/* A two-day plan calculated from roster duties, diary commitments, and priorities. */
(function (D) {
  'use strict';

  const F = D.planning || (typeof module === 'object' ? require('./planning-tools.js') : null);
  const C = D.shiftCompanion || (typeof module === 'object' ? require('./shift-companion.js') : null);
  const minute = 60000;
  const prefs = {
    prepare: ['Get ready and travel (minutes)', 45, 0, 180],
    after: ['Travel home, meal and changing (minutes)', 60, 0, 240],
    sleep: ['Sleep opportunity (minutes)', 480, 360, 720],
    nap: ['Rest before Night or N12 (minutes)', 90, 0, 180],
    study: ['Suggested study session (minutes)', 25, 10, 120]
  };
  const courseStates = { active: 'Active', paused: 'Paused', completed: 'Completed' };
  const tracked = row => ['task', 'followup', 'mwr'].includes(row.type);
  const atHome = row => row.scope === 'personal' || row.personalTime === true;
  const dcsSessionId = date => 'dcs-learning:' + date;
  const isOff = shift => ['Rest', 'Leave', 'Off'].includes(shift);
  const later = (a, b) => a > b ? a : b;
  const validDay = value => !!value && D.parseDate(value) === value;
  const validMinutes = (value, min, max) => Number.isInteger(value) && value >= min && value <= max;
  const duration = (start, end) => Math.max(0, Math.round((end - start) / minute));

  function preferences(settings) {
    const saved = settings.dayPlan || {};
    const values = Object.fromEntries(Object.entries(prefs).map(([key, [, fallback, min, max]]) =>
      [key, validMinutes(saved[key], min, max) ? saved[key] : fallback]));
    const home = D.timePattern.test(saved.homeStart) && D.timePattern.test(saved.homeEnd) && saved.homeStart < saved.homeEnd;
    return { ...values, afterByShift: saved.afterByShift || {}, bedtime: D.timePattern.test(saved.bedtime) ? saved.bedtime : '22:30',
      homeStart: home ? saved.homeStart : '08:00', homeEnd: home ? saved.homeEnd : '22:30' };
  }

  function validateLearning(data) {
    for (const row of data.learningCourses) {
      if (!D.tidy(row.title) || typeof row.title !== 'string' || typeof row.module !== 'string' ||
          !Object.hasOwn(courseStates, row.status) || !validMinutes(row.plannedMinutes, 5, 240) ||
          (row.nextDate || row.nextTime) && (!validDay(row.nextDate) || !D.timePattern.test(row.nextTime))) {
        throw new Error('A course has an invalid title, status, or session schedule.');
      }
    }
    for (const row of data.learningSessions) {
      if (!D.byId(data.learningCourses, row.courseId) || !validDay(row.date) ||
          !validMinutes(row.plannedMinutes, 0, 240) || !validMinutes(row.actualMinutes, 1, 1440) ||
          typeof row.module !== 'string' || typeof row.takeaway !== 'string' || typeof row.nextAction !== 'string') {
        throw new Error('A learning session has an invalid course, date, or time total.');
      }
    }
  }

  function cadence(data, row) {
    if (row.shiftStickyKey) return 'Shift';
    if (row.shiftScheduleKey === 'Calendar:permit-preview') return 'Shift';
    if (row.shiftReminderKey) return 'Weekly';
    const routine = row.routineId && D.byId(data.workRules, row.routineId);
    if (routine) return ({ 'night-weekly': 'Weekly', quarterly: 'Quarterly' })[routine.cadence] || D.CADENCES[routine.cadence];
    const rule = row.recurrence || (row.seriesId && D.byId(data.entries, row.seriesId)?.recurrence);
    if (!rule) return 'One-off';
    if (rule.unit === 'week' && rule.interval === 2) return 'Fortnightly';
    if (rule.unit === 'month' && rule.interval === 3) return 'Quarterly';
    if (rule.unit === 'month' && rule.interval === 12) return 'Yearly';
    return ({ day: 'Daily', week: 'Weekly', month: 'Monthly', year: 'Yearly' })[rule.unit] || 'One-off';
  }

  function deadlines(row, data) {
    const assignment = data && F.assignmentFor(data, row);
    return [[row.dueDate, row.dueTime, 'Due'], [row.followDate, row.followTime, 'Follow up'],
      [assignment && !assignment.completedAt && assignment.endDate, '', 'Assignment through']].filter(([day]) => validDay(day))
      .map(([day, time, label]) => ({ day, time, label, at: D.instant(day, time || '23:59') }))
      .sort((a, b) => a.at - b.at);
  }

  function freeWindows(start, end, blocks) {
    if (start >= end) return [];
    const windows = [];
    let cursor = start;
    for (const block of blocks.filter(item => item.end > start && item.start < end).sort((a, b) => a.start - b.start)) {
      if (block.start > cursor) windows.push({ start: cursor, end: block.start });
      cursor = Math.max(cursor, block.end);
    }
    if (cursor < end) windows.push({ start: cursor, end });
    return windows;
  }

  function restWindow(windows, preferred, length) {
    const full = windows.filter(gap => gap.end - gap.start >= length).map(gap => {
      const start = Math.max(gap.start, Math.min(preferred, gap.end - length));
      return { start, end: start + length };
    });
    return full.sort((a, b) => Math.abs(a.start - preferred) - Math.abs(b.start - preferred))[0] ||
      windows.sort((a, b) => (b.end - b.start) - (a.end - a.start))[0];
  }

  function overlap(block, start, end) { return block.start < end && block.end > start; }

  function lockedRest(blocks, start, end, adjustedId = '') {
    if (end <= start) return 0;
    const isRest = block => block.row?.planLockCategory === 'rest' || (adjustedId && block.adjustable?.id === adjustedId);
    const sleep = blocks.filter(isRest);
    if (!sleep.length) return 0;
    const other = blocks.filter(block => !isRest(block));
    return freeWindows(start, end, other).reduce((sum, gap) => sum + gap.end - gap.start -
      freeWindows(gap.start, gap.end, sleep).reduce((free, slot) => free + slot.end - slot.start, 0), 0);
  }

  function build(data, day, overrides = {}, now = Date.now()) {
    const tomorrow = D.addDays(day, 1);
    const afterTomorrow = D.addDays(day, 2);
    const yesterday = D.addDays(day, -1);
    const days = [day, tomorrow];
    const settings = preferences(data.settings);
    const roster = new Map(data.roster.map(row => [row.date, row]));
    for (const [date, shift] of Object.entries(overrides)) {
      if (shift) roster.set(date, { ...roster.get(date), date, shift });
      else roster.delete(date);
    }
    const planned = { ...data, roster: [...roster.values()] };
    const upcomingRoster = planned.roster.filter(row => row.date >= day && row.shift).sort((a, b) => a.date.localeCompare(b.date));
    const duties = planned.roster.filter(row => D.SHIFT[row.shift]?.start).sort((a, b) => a.date.localeCompare(b.date));
    const nextDuties = duties.filter(row => row.date > day).slice(0, 2);
    const horizon = later(tomorrow, nextDuties.at(-1)?.date || tomorrow);
    const work = duties.filter(row => row.date >= yesterday && row.date <= afterTomorrow).map(row => ({ ...row, ...F.dutyWindow(data, row) }));
    const windows = new Map(work.map(row => [row.date, row]));
    const blocks = [];
    const notices = [];
    const restricted = new Set();
    const byRow = new Map(data.entries.map(row => [D.str(row.id), row]));
    const blocked = data.entries.filter(row => tracked(row) && F.availableTask(data, row) &&
      (row.planBlocker || row.planPrerequisites?.length)).map(row => ({ row, reasons: C.blockers(data, row) }))
      .filter(item => item.reasons.length);
    const blockedIds = new Set(blocked.map(item => D.str(item.row.id)));
    const pausedIds = new Set(C.activePauses(data).map(item => D.str(item.taskId)));
    const reminderDays = [yesterday, ...days, afterTomorrow];
    const reminders = reminderDays.flatMap(date => D.shiftSchedule.reminderSpecs(planned, date, roster, duties));
    const byReminder = new Map(reminders.map(row => [row.id, row]));
    const previewing = Object.keys(overrides).length > 0;
    const invalidPreview = row => previewing && row.shiftReminderKey && row.shiftScheduleKey && !row.shiftDateOverride &&
      !row.planOccurrenceOverride && reminderDays.includes(row.date) &&
      byReminder.get(D.str(row.id))?.shiftScheduleKey !== row.shiftScheduleKey;
    const forecast = [
      ...D.workSlots(planned, day, horizon).filter(slot => !slot.manual).map(D.workSlotFields),
      ...reminders.filter(spec => {
        const saved = byRow.get(spec.id);
        return !saved || !saved.deletedAt && D.open({ ...saved, shiftStickyInactive: false }) &&
          (saved.shiftStickyInactive || invalidPreview(saved));
      })
    ].map(fields => ({ ...fields, type: 'task', status: 'todo', scope: 'work', priority: 'normal', forecast: true }));
    const when = D.parts(now);
    const current = when.date >= day && when.date <= tomorrow ? D.instant(when.date, when.time) : D.instant(day);
    const add = (kind, title, start, end, details = {}) => {
      if (start >= end) return null;
      const block = { kind, title, start, end, ...details };
      blocks.push(block);
      return block;
    };
    const warn = (date, text, restrict = false) => {
      if (restrict) restricted.add(date);
      if (days.includes(date)) notices.push({ date, text });
    };

    const blockKey = (type, date) => F.blockId(type, date, roster.get(date)?.shift || '');
    const adjustments = new Map(data.planBlocks.filter(row => row.id === blockKey(row.blockType, row.anchorDate))
      .map(row => [row.id, row]));
    const occurrence = (type, anchorDate) => ({ id: blockKey(type, anchorDate), type, anchorDate, shift: roster.get(anchorDate)?.shift || '' });
    const addDefault = (type, anchorDate, title, start, end, details = {}) => {
      const adjustable = occurrence(type, anchorDate);
      if (adjustments.has(adjustable.id)) return null;
      const [kind, category] = F.editableBlocks[type];
      return add(kind, title, start, end, { ...details, category, adjustable });
    };
    const adjustedStart = row => D.instant(row.date, row.time);
    const adjustedEnd = row => adjustedStart(row) + row.minutes * minute;
    const beforeDuty = duty => {
      const edited = adjustments.get(blockKey('prep', duty.date));
      return edited ? Math.min(duty.start, adjustedStart(edited)) : duty.start - settings.prepare * minute;
    };
    const afterDuty = duty => {
      const edited = adjustments.get(blockKey('after', duty.date));
      return edited ? Math.max(duty.end, adjustedEnd(edited)) : duty.end + (settings.afterByShift[duty.shift] ?? settings.after) * minute;
    };
    for (const row of adjustments.values()) {
      if (!overlap({ start: adjustedStart(row), end: adjustedEnd(row) }, D.instant(yesterday), D.instant(D.addDays(afterTomorrow, 2)))) continue;
      const [kind, category] = F.editableBlocks[row.blockType];
      add(kind, row.title, adjustedStart(row), adjustedEnd(row), { category, adjusted: true, adjustable: occurrence(row.blockType, row.anchorDate) });
    }
    const fixedRoutines = new Set();

    for (const [index, duty] of work.entries()) {
      const prior = work[index - 1];
      const next = work[index + 1];
      const prep = beforeDuty(duty);
      add('duty', duty.shift + ' duty', duty.start, duty.end, { date: duty.date, shift: duty.shift, adjusted: duty.adjusted, category: 'work' });
      addDefault('prep', duty.date, 'Get ready & travel to work', Math.max(prior?.end ?? prep, prep), duty.start);
      const meal = duty.shift === 'Morning' ? 'lunch' : D.shiftFamily(duty.shift) === 'Night' ? 'breakfast' : 'meal';
      addDefault('after', duty.date, 'Travel home & ' + meal, duty.end, Math.min(afterDuty(duty), next ? beforeDuty(next) : Infinity),
        { detail: 'Includes changing clothes' });
      if (prior && duty.start - prior.end < 600 * minute) {
        const gap = duration(prior.end, duty.start);
        warn(duty.date, gap ? 'Only ' + D.minutesText(gap) + ' between duties. Review this turnaround before adding commitments.' :
          'The roster gives these duties no time between them. Review the duty times.', true);
        restricted.add(prior.date);
      }
      const routines = D.shiftSchedule.dailySpecs(planned, duty).flatMap(spec => {
        const saved = byRow.get(spec.id);
        if (saved && (saved.deletedAt || saved.status === 'done' || saved.shiftDateOverride || saved.planFlexible ||
          blockedIds.has(D.str(saved.id)))) return [];
        const row = saved?.shift === duty.shift && D.active(saved) ? saved :
          { ...spec, type: 'task', scope: 'work', status: 'todo', forecast: true };
        return [{ row, start: D.instant(row.date, row.time) }];
      }).sort((a, b) => a.start - b.start);
      for (const [index, { row, start }] of routines.entries()) {
        const length = F.estimate(row) * minute;
        const nextStart = routines[index + 1]?.start ?? Infinity;
        const end = !row.planMinutes && !row.planRemaining && nextStart > start ? Math.min(start + length, nextStart) : start + length;
        const explicit = row.planOccurrenceOverride || row.planRemaining;
        const block = add('booked', row.title, start, explicit ? end : Math.min(end, duty.end),
          { row, onDuty: start >= duty.start && end <= duty.end, routine: true,
            category: row.shiftStickyKey === 'dcs-learning' ? 'learning' : 'work' });
        if (block) fixedRoutines.add(D.str(row.id));
        if (block && start < duty.start) warn(duty.date, row.title + ' starts before the adjusted duty. Use Adjust task to move it.');
      }
    }

    const bookings = [...D.eventsIn(data, yesterday, afterTomorrow).filter(row => !invalidPreview(row)), ...forecast];
    for (const row of bookings) {
      if (!D.timed(row) && !(tracked(row) && F.availableTask(data, row) && !row.planFlexible && !blockedIds.has(D.str(row.id)) && !fixedRoutines.has(D.str(row.id)) &&
          (!row.shiftStickyKey || row.shiftDateOverride || row.planOccurrenceOverride))) continue;
      const slot = D.timed(row) ? D.eventWindow(row) || (row.time ? { start: D.instant(row.date, row.time),
        end: D.instant(row.date, row.time) + 15 * minute } : null) : row.time ? { start: D.instant(row.date, row.time),
        end: D.instant(row.date, row.time) + F.estimate(row) * minute } : null;
      if (!slot) continue;
      add(row.planLockCategory ? 'locked' : 'booked', row.title, slot.start, slot.end,
        { row, category: row.planLockCategory || (row.dcsLearning ? 'learning' : row.scope === 'work' ? 'work' : D.timed(row) ? 'appointment' : 'personal'),
          onDuty: work.some(duty => slot.start >= duty.start && slot.end <= duty.end) });
    }

    for (const date of [yesterday, ...days, afterTomorrow]) {
      if (data.settings.planFaith?.prayers.length && !D.byId(data.namazTimes, date)) {
        warn(date, 'Add this date to your Namaz timetable to reserve your prayer windows.');
      }
      for (const block of C.faithWindows(data, date)) {
        add('faith', block.title, block.start, block.end, { category: 'faith', faith: block.faith, detail: block.detail,
          onDuty: work.some(duty => block.start >= duty.start && block.end <= duty.end) });
      }
    }

    const reported = new Set();
    for (const [index, block] of blocks.entries()) {
      if (!['locked', 'booked', 'faith'].includes(block.kind) && !(block.adjusted && block.adjustable)) continue;
      const match = blocks.findIndex((other, otherIndex) => other !== block && overlap(other, block.start, block.end) &&
        !reported.has(otherIndex + ':' + index) &&
        !(other.kind === 'duty' && block.onDuty && (block.row?.scope === 'work' || block.routine || block.kind === 'faith')));
      if (match >= 0) {
        reported.add(index + ':' + match);
        warn(D.parts(block.start).date, block.title + ' overlaps ' + blocks[match].title + '. Check their times.');
      }
    }

    for (const date of [yesterday, ...days]) {
      const duty = windows.get(date);
      const nextDate = D.addDays(date, 1);
      const next = windows.get(nextDate);
      const recovery = duty && (D.overnight(duty.shift) || D.parts(duty.end).date !== date);
      const earliest = recovery ? afterDuty(duty) : Math.max(D.instant(date, '17:00'), duty ? afterDuty(duty) : 0);
      const latest = Math.min(next ? beforeDuty(next) : Infinity,
        D.instant(nextDate, recovery ? '22:00' : '12:00'));
      const bedtime = D.instant(settings.bedtime < '12:00' ? nextDate : date, settings.bedtime);
      const sleepId = blockKey('sleep', date);
      const changed = adjustments.has(sleepId);
      const protectedTime = lockedRest(blocks, earliest, latest, changed ? sleepId : '');
      const goal = Math.max(0, settings.sleep * minute - protectedTime);
      const preferred = recovery ? earliest : Math.max(earliest, Math.min(bedtime, latest - goal));
      const sleep = !changed && goal && restWindow(freeWindows(earliest, latest, blocks), preferred, goal);
      if (sleep) addDefault('sleep', date, recovery ? 'Sleep after overnight duty' : 'Sleep', sleep.start, sleep.end);
      const available = Math.round(protectedTime / minute) + (sleep ? duration(sleep.start, sleep.end) : 0);
      if (available < settings.sleep) {
        const affected = date < day || recovery && days.includes(nextDate) ? nextDate : date;
        warn(affected, 'The plan fits ' + (available ? D.minutesText(available) + ' of sleep time' : 'no sleep block') +
          ' before the next commitments. Review the roster and bookings.', true);
        restricted.add(nextDate);
      }
    }

    for (const date of days) {
      const duty = windows.get(date);
      const family = D.shiftFamily(duty?.shift);
      if (family === 'Night' && settings.nap && !adjustments.has(blockKey('nap', date))) {
        const end = beforeDuty(duty) - 20 * minute;
        const start = Math.max(D.instant(date, '11:00'), end - 4 * 60 * minute);
        const goal = settings.nap * minute - lockedRest(blocks, start, end);
        const rest = goal > 0 && restWindow(freeWindows(start, end, blocks), end - goal, goal);
        if (rest && duration(rest.start, rest.end) >= 20) addDefault('nap', date, 'Rest before Night duty', rest.start, rest.end);
      }
      if (family === 'Evening' || family === 'Night' || !duty) {
        const end = duty ? Math.min(D.instant(date, family === 'Evening' ? '13:00' : '20:00'), beforeDuty(duty)) : D.instant(date, '14:30');
        const start = family === 'Night' ? end - 3 * 60 * minute : D.instant(date, family === 'Evening' ? '11:30' : '12:30');
        const meal = freeWindows(start, end, blocks).filter(gap => gap.end - gap.start >= 30 * minute).at(-1);
        if (meal) addDefault('meal', date, duty ? 'Meal before duty' : 'Lunch', meal.end - 30 * minute, meal.end);
      }
    }

    const courses = data.learningCourses.filter(row => row.status === 'active');
    const displaced = new Set();
    for (const course of courses.filter(row => days.includes(row.nextDate) && row.nextTime)) {
      const start = D.instant(course.nextDate, course.nextTime);
      const end = start + course.plannedMinutes * minute;
      if (blocks.some(block => overlap(block, start, end))) {
        displaced.add(course.id);
        warn(course.nextDate, course.title + ' overlaps a duty, rest block, or booking. Review its session time.');
      }
      else add('study', course.title, start, end, { course, booked: true });
    }

    const restDays = D.shiftSchedule.restBlocks(planned.roster).filter(block => block.end >= day && block.start <= horizon);
    const candidates = [...data.entries, ...forecast].filter(row => tracked(row) && F.availableTask(data, row) && !invalidPreview(row) &&
      !blockedIds.has(D.str(row.id)) && !pausedIds.has(D.str(row.id)) &&
      !(row.forecast && row.shiftReminderKey && row.date < day) &&
      (!row.shiftStickyKey || row.focus || row.shiftDateOverride || row.planFlexible || row.planOccurrenceOverride || row.priority === 'critical'))
      .map(row => {
      const dates = deadlines(row, data);
      const due = dates[0];
      const dueOnRest = dates.find(item => item.day >= day && isOff(roster.get(item.day)?.shift) &&
        (item.day <= horizon || restDays.some(block => item.day >= block.start && item.day <= block.end)));
      const advance = restDays.find(block => dates.some(item => item.day >= block.start && item.day <= block.end ||
        block.next.some(duty => item.day === duty.date && item.at <= duty.end)));
      const timing = due || (row.time && { day: row.date, time: row.time, at: D.instant(row.date, row.time), label: 'Planned' });
      const night = nextDuties.find(duty => D.shiftFamily(duty.shift) === 'Night' && timing?.day === duty.date && timing.at < F.dutyWindow(data, duty).start);
      const nextDutyDue = nextDuties.find(duty => due?.day === duty.date);
      const ready = row.type === 'task' ? (row.planOccurrenceOverride ? row.date : D.taskDay(row)) : row.date;
      const earlyCutoff = Math.min(night && !atHome(row) ? timing.at : Infinity, advance && !atHome(row) ? advance.restStart : Infinity);
      const cutoff = Math.min(due?.at ?? Infinity, earlyCutoff);
      const workCutoff = Math.min(dates.find(item => item.label !== 'Follow up')?.at ?? Infinity, earlyCutoff);
      const followAt = row.status === 'waiting' && row.followDate ? D.instant(row.followDate, row.followTime || '00:00') : 0;
      const priority = ['critical', 'high', 'normal', 'low'].indexOf(row.priority || 'normal');
      return { row, due, ready, dueOnRest, restShift: roster.get(dueOnRest?.day)?.shift, advance, night, timing, nextDutyDue,
        cutoff, workCutoff, followAt, priority, home: atHome(row), urgent: !!(due && due.day <= horizon || advance || night || row.priority === 'critical' || row.focus) };
    }).filter(item => item.ready <= horizon || item.advance || item.dueOnRest);

    const ranked = candidates.filter(item => item.ready <= tomorrow || item.advance || item.night || item.urgent && item.due)
      .filter(({ row }) => row.status !== 'waiting' || row.followDate && row.followDate <= horizon)
      .sort((a, b) => Number(!!b.row.focus) - Number(!!a.row.focus) || Number(b.urgent) - Number(a.urgent) || a.cutoff - b.cutoff || a.priority - b.priority ||
        (a.row.stickyPriority ?? Infinity) - (b.row.stickyPriority ?? Infinity) || D.manualOrder(a.row, b.row));
    const top = ranked.slice(0, 3);
    const flexEnd = D.instant(afterTomorrow);
    const homeSlots = date => [Math.max(D.instant(date, settings.homeStart), current), D.instant(date, settings.homeEnd)];
    const onDutySlots = date => work.filter(duty => overlap(duty, D.instant(date), D.instant(D.addDays(date, 1))))
      .map(duty => [Math.max(D.instant(date), duty.start, current), duty.end]);
    const lightUse = new Set();

    for (const item of ranked) {
      const { row } = item;
      const booked = blocks.find(block => block.kind === 'booked' && D.same(block.row.id, row.id) && overlap(block, D.instant(day), flexEnd));
      if (booked) { item.block = booked; continue; }
      const length = F.estimate(row) * minute;
      const before = item.workCutoff > current ? item.workCutoff : Infinity;
      for (const date of days) {
        if (date < item.ready && (row.planFlexible || row.planNotBefore || !item.advance && !item.night)) continue;
        const energy = F.energy(data, date);
        if (!item.urgent && (energy === 'recovery' || energy === 'light' && (lightUse.has(date) || length > 25 * minute))) {
          item.held = true;
          continue;
        }
        const followLater = row.status === 'waiting' && row.followDate > date;
        if (followLater && !item.advance && !item.night) continue;
        const slots = row.scope === 'personal' ? [] : onDutySlots(date).map(slot => [...slot, true]);
        if (item.home) slots.push([...homeSlots(date), false]);
        for (const [start, end, onDuty] of slots) {
          const busy = onDuty ? blocks.filter(block => block.kind !== 'duty') : blocks;
          const from = followLater ? start : Math.max(start, item.followAt);
          const earliest = row.planFlexible && row.time && row.date === date ? D.instant(date, row.time) : 0;
          const dayEnd = D.instant(D.addDays(date, 1));
          const gap = freeWindows(Math.max(from, earliest), Math.min(end, before), busy).find(slot => slot.start < dayEnd && slot.end - slot.start >= length);
          if (!gap) continue;
          const title = date < item.ready || followLater ? 'Prepare · ' + row.title : row.status === 'waiting' ? 'Follow up · ' + row.title : row.title;
          item.block = add('priority', title, gap.start, gap.start + length,
            { row, onDuty, category: row.dcsLearning || row.shiftStickyKey === 'dcs-learning' ? 'learning' : undefined });
          if (energy === 'light' && !item.urgent) lightUse.add(date);
          break;
        }
        if (item.block) break;
      }
    }

    for (const duty of work) {
      if (D.shiftFamily(duty.shift) === 'Night' || !overlap(duty, D.instant(day), flexEnd) || duty.end <= now ||
          restricted.has(duty.date) || F.energy(data, duty.date) !== 'normal' || byRow.has(dcsSessionId(duty.date))) continue;
      const weekend = D.daysBetween(D.weekStart(duty.date), duty.date) >= 5;
      const busy = blocks.filter(block => block.kind !== 'duty' || block.date !== duty.date);
      const gaps = freeWindows(Math.max(duty.start, current), duty.end, busy);
      const gap = (weekend && gaps.find(slot => duration(slot.start, slot.end) >= 60)) ||
        gaps.find(slot => duration(slot.start, slot.end) >= 30);
      if (!gap || gap.start >= flexEnd) continue;
      const minutes = weekend ? Math.min(60, duration(gap.start, gap.end)) : 30;
      add('study', 'DCS Learning', gap.start, gap.start + minutes * minute,
        { dcsSuggestion: true, onDuty: true, category: 'learning', dutyDate: duty.date, shift: duty.shift, detail: 'Suggested if duty is clear' });
    }

    const active = courses.slice().sort((a, b) => (a.nextDate || '9999').localeCompare(b.nextDate || '9999') || a.title.localeCompare(b.title));
    const offered = new Set();
    for (const date of days) {
      const [start, end] = homeSlots(date);
      const pending = ranked.some(item => !item.block && item.urgent && (item.due?.day || item.ready) <= date);
      const studyCourse = active.find(course => course.nextDate === date && displaced.has(course.id)) || active.find(course => !course.nextDate);
      const energy = F.energy(data, date);
      if (energy !== 'recovery' && !restricted.has(date) && !pending && !blocks.some(block => block.kind === 'study' && !block.dcsSuggestion && D.parts(block.start).date === date)) {
        const gaps = freeWindows(start, end, blocks);
        const max = energy === 'light' ? 15 : Infinity;
        const practice = F.practice(data).find(item => !offered.has(item.id) && item.minutes <= max &&
          gaps.some(gap => duration(gap.start, gap.end) >= item.minutes + 20));
        const minutes = practice?.minutes || Math.min(studyCourse?.plannedMinutes || settings.study, max);
        const gap = gaps.find(slot => duration(slot.start, slot.end) >= minutes + 20);
        if (gap && (practice || studyCourse || !active.length)) {
          const title = studyCourse && displaced.has(studyCourse.id) ? 'Reschedule · ' + studyCourse.title : studyCourse?.title;
          add('study', practice?.title || title || 'Learning or skill practice', gap.start, gap.start + minutes * minute,
            { course: practice ? D.byId(courses, practice.courseId) : studyCourse, practice, booked: false });
          if (practice) offered.add(practice.id);
        }
      }
      for (const gap of freeWindows(Math.max(D.instant(date), current), D.instant(D.addDays(date, 1)), blocks)
        .filter(slot => duration(slot.start, slot.end) >= 15)) {
        add('personal', 'Personal time', gap.start, gap.end);
      }
    }

    const visible = blocks.slice().sort((a, b) => a.start - b.start || Number(b.kind === 'duty') - Number(a.kind === 'duty') || a.end - b.end);
    return { nextDuties, upcomingRoster, top, notices, busy: blocks, unplaced: ranked.slice(3).filter(item => !item.block),
      blocked: blocked.filter(item => item.row.date <= tomorrow || deadlines(item.row, data).some(due => due.day <= horizon)),
      early: candidates.filter(item => item.advance || item.dueOnRest || item.night || item.nextDutyDue)
      .sort((a, b) => a.cutoff - b.cutoff || D.manualOrder(a.row, b.row)), days: days.map(date => ({ date, duty: roster.get(date),
        blocks: visible.filter(block => overlap(block, D.instant(date), D.instant(D.addDays(date, 1)))) })) };
  }

  function findNow(data, minutes, place, now = Date.now()) {
    const local = D.parts(now);
    const start = D.instant(local.date, local.time);
    const end = start + minutes * minute;
    const plan = build(data, local.date, {}, now);
    const busy = plan.busy.filter(block => !['priority', 'personal'].includes(block.kind) && (block.kind !== 'study' || block.booked) &&
      (block.kind !== 'duty' || place !== 'plant'));
    const available = (row = null) => {
      const fixed = busy.filter(block => !row || !block.row || !D.same(row.id, block.row.id) || block.start > start);
      const first = freeWindows(start, end, fixed)[0];
      return first?.start === start ? duration(start, first.end) : 0;
    };
    const base = available();
    const pausedIds = new Set(C.activePauses(data).map(item => D.str(item.taskId)));
    const ready = data.entries.filter(row => tracked(row) && F.availableTask(data, row) && !pausedIds.has(D.str(row.id)) && !C.blockers(data, row).length &&
      (row.type === 'task' ? D.taskDay(row) <= local.date : row.date <= local.date) &&
      (place === 'plant' ? row.scope === 'work' : atHome(row)) &&
      (row.status !== 'waiting' || row.followDate && D.instant(row.followDate, row.followTime || '00:00') <= start) &&
      (!row.time || D.instant(row.date, row.time) <= start) && F.estimate(row) <= available(row));
    const sorted = ready.map(row => ({ row, due: deadlines(row, data)[0], rank: Object.keys(F.priorities).indexOf(row.priority || 'normal') }))
      .sort((a, b) => Number(!!b.row.focus) - Number(!!a.row.focus) || (a.due?.at ?? Infinity) - (b.due?.at ?? Infinity) ||
        a.rank - b.rank || D.manualOrder(a.row, b.row));
    const urgent = sorted.find(item => item.row.focus || item.rank <= 1 || item.due?.day <= D.addDays(local.date, 1));
    if (urgent) return { row: urgent.row, minutes: F.estimate(urgent.row), available: available(urgent.row) };
    const energy = F.energy(data, local.date);
    const limit = energy === 'normal' ? base : energy === 'light' ? Math.min(15, base) : 0;
    const exercise = F.practice(data).find(item => item.minutes <= limit);
    if (exercise) return { practice: exercise, minutes: exercise.minutes, available: base };
    const fallback = sorted[0]?.row;
    if (fallback) return { row: fallback, minutes: F.estimate(fallback), available: available(fallback) };
    if (limit >= 10) return { title: 'Practise one technique from your latest study session', minutes: Math.min(15, limit), available: base };
    return { available: base };
  }

  D.dayPlan = { build, findNow, freeWindows, preferences, prefs, courseStates, validateLearning, cadence, deadlines, tracked, atHome, dcsSessionId };
})(typeof module === 'object' && module.exports ? require('./core.js') : Diary);
