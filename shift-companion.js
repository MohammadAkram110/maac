/* Roster-aware tools that share the existing diary records and time plan. */
(function (D) {
  'use strict';

  const minute = 60000;
  const validDay = value => !!value && D.parseDate(value) === value;
  const validTime = value => typeof value === 'string' && D.timePattern.test(value);
  const isMinutes = (value, min = 1, max = 1440) => Number.isInteger(value) && value >= min && value <= max;
  const stampAt = value => Date.parse(value) || 0;
  const reference = value => typeof value === 'string' && !!value || Number.isSafeInteger(value);
  const references = value => Array.isArray(value) && value.every(reference);
  const overlap = (a, b) => a.start < b.end && b.start < a.end;
  const minutes = (start, end) => Math.round((end - start) / minute);
  const tracked = row => !!row && ['task', 'followup', 'mwr'].includes(row.type);
  const nextFirst = (a, b) => (a.followDate || '9999').localeCompare(b.followDate || '9999') ||
    (a.followTime || '').localeCompare(b.followTime || '') || D.manualOrder(a, b);
  const lastFirst = (a, b) => stampAt(b.at) - stampAt(a.at);

  function working(data) {
    return data.roster.filter(row => D.SHIFT[row.shift]?.start).sort((a, b) => a.date.localeCompare(b.date));
  }

  function activeDuty(data, now = Date.now()) {
    const today = D.parts(now).date;
    return working(data).filter(row => row.date >= D.addDays(today, -1) && row.date <= today).find(row => {
      const window = D.planning.dutyWindow(data, row);
      return now >= window.start && now < window.end;
    });
  }

  function activePauses(data) {
    return data.shiftPauses.filter(row => {
      if (row.resumedAt || !row.taskId) return false;
      const task = D.byId(data.entries, row.taskId);
      return tracked(task) && D.planning.availableTask(data, task);
    }).sort(lastFirst);
  }

  function blockers(data, row) {
    const result = row.planBlocker ? [{ title: row.planBlocker }] : [];
    for (const id of D.list(row.planPrerequisites)) {
      const item = D.byId(data.entries, id);
      if (!item || !D.active(item)) result.push({ title: 'Prerequisite unavailable · ' + (item?.title || D.str(id)) });
      else if (D.open(item)) result.push({ id, title: item.title });
    }
    return result;
  }

  function cyclic(entries, id, prerequisites) {
    const byId = new Map(entries.map(row => [D.str(row.id), row]));
    const queue = prerequisites.map(D.str);
    const visited = new Set();
    while (queue.length) {
      const next = queue.pop();
      if (D.same(next, id)) return true;
      if (visited.has(next)) continue;
      visited.add(next);
      queue.push(...D.list(byId.get(next)?.planPrerequisites).map(D.str));
    }
    return false;
  }

  function briefing(data, duty, now = Date.now()) {
    const window = D.planning.dutyWindow(data, duty);
    if (!window) return null;
    const previous = working(data).filter(row => row.date < duty.date &&
      D.planning.dutyWindow(data, row).end <= window.start).at(-1);
    const closeout = previous && D.byId(data.shiftCloseouts, D.planning.closeoutId(previous.date, previous.shift));
    const lastEnd = previous ? D.planning.dutyWindow(data, previous).end : D.instant(D.addDays(duty.date, -1));
    const savedAt = stampAt(closeout?.updatedAt);
    const since = savedAt > 0 && savedAt <= window.start ? savedAt : lastEnd;
    const until = Math.min(now, window.end);
    const recorded = value => stampAt(value) > since && stampAt(value) <= until;
    const incoming = data.handovers.filter(row => !row.deletedAt && row.toDate === duty.date && row.toShift === duty.shift &&
      (!row.createdAt || stampAt(row.createdAt) <= now));
    const notes = data.briefNotes.filter(row => row.dutyDate === duty.date && row.shift === duty.shift && stampAt(row.at) <= now)
      .map(row => ({ ...row, title: row.source || 'Incoming update', entryId: row.taskId }));
    const updates = notes.concat(incoming.map(row => ({ title: 'Handover from ' + row.shift + ' · ' + D.formatDate(row.date),
      text: row.note || 'Open work carried to this duty.', at: row.updatedAt || row.createdAt, handover: row })));
    const deadlines = [];
    for (const row of data.entries.filter(item => D.active(item) && item.scope === 'work')) {
      if (row.type === 'log' && !row.draft) {
        const at = new Date(D.instant(row.date, row.time || '00:00')).toISOString();
        if (recorded(at)) updates.push({ title: row.title, text: row.body, at, entryId: row.id });
      }
      for (const item of D.list(row.updates)) {
        if (recorded(item.at || item.timestamp)) updates.push({ title: row.title, text: item.text, at: item.at || item.timestamp, entryId: row.id });
      }
      if (!tracked(row)) continue;
      const history = D.list(row.history).filter(item => item && recorded(item.at));
      const status = history.filter(item => item.action === 'Status changed' && item.to).sort(lastFirst)[0];
      if (status) updates.push({ title: row.title, text: 'Status changed to ' + status.to, at: status.at, entryId: row.id });
      const edits = history.flatMap(item =>
        D.list(item.changes).filter(change => change && /^due (date|time)$/i.test(change.field)).map(change => ({ ...change, at: item.at })));
      if (edits.length) {
        const fields = new Map();
        for (const edit of edits.sort((a, b) => stampAt(a.at) - stampAt(b.at))) {
          const key = edit.field.toLowerCase();
          const first = fields.get(key);
          fields.set(key, { ...edit, before: first ? first.before : edit.before });
        }
        const changes = [...fields.values()].filter(item => D.str(item.before) !== D.str(item.after));
        if (changes.length) deadlines.push({ row, changes, at: edits.at(-1).at });
      }
    }
    const ids = new Set([...D.list(closeout?.openIds), ...incoming.flatMap(row => D.list(row.itemIds)),
      ...notes.map(row => row.entryId).filter(Boolean)].map(D.str));
    const checks = data.entries.filter(row => tracked(row) && row.scope === 'work' && D.open(row) && ids.has(D.str(row.id)))
      .sort(nextFirst);
    return { previous, since, closeout, updates: updates.sort(lastFirst), deadlines: deadlines.sort(lastFirst), checks };
  }

  const personKey = value => D.tidy(value).toLocaleLowerCase('en');
  const waitingPerson = row => D.tidy(row.waitingOn || (row.status === 'waiting' ? row.person : ''));
  function personGroups(data) {
    const groups = new Map();
    const get = person => {
      const key = personKey(person);
      if (!groups.has(key)) groups.set(key, { key, person, rows: [], conversations: [] });
      return groups.get(key);
    };
    for (const row of data.entries) {
      const person = waitingPerson(row);
      if (tracked(row) && D.open(row) && person) get(person).rows.push(row);
    }
    for (const log of data.followConversations) get(log.person).conversations.push(log);
    return [...groups.values()].sort((a, b) => a.person.localeCompare(b.person)).map(group => ({
      ...group, rows: group.rows.sort(nextFirst), conversations: group.conversations.sort(lastFirst)
    }));
  }

  function faithWindows(data, day) {
    const pref = data.settings.planFaith;
    if (!pref?.prayers.length) return [];
    const timetable = D.byId(data.namazTimes, day);
    if (!timetable) return [];
    return pref.prayers.filter(key => timetable.times[key]).map(key => {
      const zikr = key === pref.zikrAfter;
      const start = D.instant(day, timetable.times[key]) + pref.offset * minute;
      return { start, end: start + (pref.minutes + (zikr ? pref.zikrMinutes : 0)) * minute,
        title: D.PRAYERS[key] + (zikr ? ' & ' + (key === 'maghrib' ? 'evening zikr' : 'zikr') : ''),
        detail: 'From your saved timetable', faith: { prayer: key, date: day, slot: zikr && key === 'maghrib' ? 'evening' : key } };
    });
  }

  function findPersonalSlot(data, item, now = Date.now(), another = false, plan = null) {
    if (item.completedAt) return { state: 'done' };
    const current = D.parts(now).date;
    const entry = D.byId(data.entries, item.entryId);
    const booked = entry && D.active(entry) ? entry : null;
    const window = booked && D.eventWindow(booked);
    const base = window ? { ...data, entries: data.entries.filter(row => !D.same(row.id, booked.id)) } : data;
    const fixed = (day, source = base) => (plan && source === data && plan.days[0].date === day ? plan :
      D.dayPlan.build(source, day, {}, now)).busy.filter(block => !['personal', 'priority'].includes(block.kind) &&
      (block.kind !== 'study' || block.booked) && !D.same(block.row?.id, booked?.id ?? ''));
    const within = window && booked.date >= item.from && booked.date <= item.through &&
      window.start >= D.instant(booked.date, item.startTime) && window.end <= D.instant(booked.date, item.endTime) &&
      minutes(window.start, window.end) === item.minutes;
    if (window && window.end > now && !another && within && !fixed(booked.date, data).some(block => overlap(window, block))) {
      return { state: 'booked', window, booked };
    }
    const length = item.minutes * minute;
    const first = item.from > current ? item.from : current;
    const startAfter = another && window ? Math.max(now, window.end) : now;
    for (let day = first; day <= item.through; day = D.addDays(day, 1)) {
      const start = Math.max(D.instant(day, item.startTime), Math.ceil(startAfter / minute) * minute);
      const end = D.instant(day, item.endTime);
      if (end - start < length) continue;
      const fit = D.dayPlan.freeWindows(start, end, fixed(day)).find(gap => gap.end - gap.start >= length);
      if (fit) return { state: 'offer', window: { start: fit.start, end: fit.start + length }, booked };
    }
    return { state: item.through < current ? 'expired' : 'no-slot', booked };
  }

  const rosterWindow = (data, row) => row && D.planning.dutyWindow(data, row);
  function rosterPreview(data, changes) {
    const dates = Object.keys(changes).sort();
    const first = dates[0];
    const next = new Map(data.roster.map(row => [row.date, row]));
    for (const day of dates) {
      if (changes[day]) next.set(day, { ...next.get(day), date: day, shift: changes[day] });
      else next.delete(day);
    }
    const proposed = { ...data, roster: [...next.values()] };
    const oldWorking = working(data);
    const newWorking = working(proposed);
    const beforeDuties = oldWorking.filter(row => row.date >= first).slice(0, 8);
    const afterDuties = newWorking.filter(row => row.date >= first).slice(0, 8);
    const end = [dates.at(-1), beforeDuties.at(-1)?.date, afterDuties.at(-1)?.date].filter(Boolean).sort().at(-1);
    const inRange = day => day && day >= first && day <= end;
    const afterRest = new Map();
    const originalRest = D.shiftSchedule.restBlocks(data.roster);
    for (const rest of D.shiftSchedule.restBlocks(proposed.roster)) {
      const duty = newWorking.findLast(row => row.date < rest.start);
      if (!duty || duty.date > end || rest.end < first) continue;
      const beforeRest = originalRest.find(block => block.start === rest.start && block.end === rest.end);
      const prior = beforeRest && oldWorking.findLast(row => row.date < beforeRest.start);
      const restWindows = block => block.next.map(row => row.start + ':' + row.end).join();
      if (prior?.date === duty.date && prior.shift === duty.shift && restWindows(beforeRest) === restWindows(rest)) continue;
      const tasks = data.entries.filter(row => row.scope === 'work' && tracked(row) && D.planning.availableTask(data, row) &&
        D.dayPlan.deadlines(row, data).some(item => item.day >= rest.start && item.day <= rest.end ||
          rest.next.some(nextDuty => item.day === nextDuty.date && item.at <= rosterWindow(proposed, next.get(nextDuty.date)).end)));
      if (tasks.length) afterRest.set(duty.date, tasks);
    }
    const selected = new Set([...dates, ...data.roster.map(row => row.date), ...data.entries.flatMap(row =>
      D.active(row) && (D.timed(row) || row.scope === 'work' && row.dueDate) ? [row.date, row.dueDate] : [])].filter(inRange));
    for (const day of afterRest.keys()) selected.add(day);
    const compare = (plan, day) => new Map(plan.days[0].blocks.filter(block => D.parts(block.start).date === day &&
      (['rest', 'transition', 'meal'].includes(block.kind) || block.row?.shiftReminderKey ||
        block.row?.shiftScheduleKey?.startsWith('Calendar:'))).map(block => [
      block.adjustable?.id.split(':').slice(0, 3).join(':') || block.row?.shiftReminderKey || block.row?.shiftScheduleKey,
      { title: block.title, start: block.start, end: block.end, entryId: block.row?.forecast ? '' : block.row?.id }
    ]));
    const rows = [...selected].sort().map(day => {
      const before = data.roster.find(row => row.date === day);
      const after = next.get(day);
      const original = D.dayPlan.build(data, day, {}, D.instant(day));
      const changed = D.dayPlan.build(data, day, changes, D.instant(day));
      const originalBlocks = compare(original, day);
      const changedBlocks = compare(changed, day);
      const updates = [];
      for (const key of new Set([...originalBlocks.keys(), ...changedBlocks.keys()])) {
        const a = originalBlocks.get(key);
        const b = changedBlocks.get(key);
        if (a?.start === b?.start && a?.end === b?.end && a?.title === b?.title) continue;
        updates.push({ title: b?.title || a.title, before: a, after: b, entryId: b?.entryId || a?.entryId });
      }
      const oldWarnings = new Set(original.notices.filter(item => item.date === day).map(item => item.text));
      const warnings = changed.notices.filter(item => item.date === day && !oldWarnings.has(item.text)).map(item => item.text);
      return { day, before, after, beforeWindow: rosterWindow(data, before), afterWindow: rosterWindow(proposed, after),
        updates, warnings: [...new Set(warnings)], prepare: afterRest.get(day) || [] };
    });
    return { rows, first: rows[0]?.day || first, end, count: afterDuties.length };
  }

  const afterKey = (day, shift) => day + ':' + shift;
  function saveBaseline(data, day, now = Date.now()) {
    if (D.byId(data.planBaselines, day)) throw new Error('A baseline is already saved for this date.');
    const plan = D.dayPlan.build(data, day, {}, now);
    const shift = plan.days[0].duty?.shift || '';
    const start = D.instant(day);
    const end = D.instant(D.addDays(day, 1));
    const blocks = plan.days[0].blocks.filter(block => block.category || ['study', 'priority'].includes(block.kind)).map(block => {
      const category = block.category || (block.kind === 'study' ? 'learning' : block.onDuty ? 'work' : 'personal');
      return { title: block.title, category, start: Math.max(block.start, start), end: Math.min(block.end, end) };
    });
    const after = plan.busy.find(block => block.adjustable?.type === 'after' && block.adjustable.anchorDate === day);
    const row = { id: day, date: day, shift, at: new Date(now).toISOString(), blocks,
      afterMinutes: after ? minutes(after.start, after.end) : null,
      afterDate: after ? D.parts(after.start).date : day };
    data.planBaselines.push(row);
    return row;
  }

  function cycleReview(data, through, from = '') {
    const duties = working(data).filter(row => row.date <= through);
    const start = from || duties.slice(-8)[0]?.date || D.addDays(through, -7);
    const snapshots = data.planBaselines.filter(row => row.date >= start && row.date <= through).sort((a, b) => a.date.localeCompare(b.date));
    const actual = D.planning.timeReport(data, start, through);
    const groups = new Map();
    const displacements = [];
    const patterns = new Map();
    const planned = new Map();
    const roster = new Map(data.roster.map(row => [row.date, row.shift]));
    const baselineDates = new Set(snapshots.map(row => row.date));
    const logged = new Map();
    for (const row of actual.rows.filter(item => baselineDates.has(item.date))) {
      logged.set(row.category, (logged.get(row.category) || 0) + row.minutes);
    }
    for (const row of snapshots) {
      for (const key of Object.keys(D.planning.categories)) {
        const blocks = row.blocks.filter(block => block.category === key).sort((a, b) => a.start - b.start);
        let previousEnd = -Infinity;
        for (const block of blocks) {
          if (block.end > previousEnd) planned.set(key, (planned.get(key) || 0) + minutes(Math.max(block.start, previousEnd), block.end));
          previousEnd = Math.max(previousEnd, block.end);
        }
      }
      const log = data.timeLogs.find(item => item.sourceType === 'cycle-after' && item.sourceId === afterKey(row.date, row.shift));
      if (row.afterMinutes !== null && log && D.SHIFT[row.shift]?.start) {
        const group = groups.get(row.shift) || { shift: row.shift, planned: [], actual: [] };
        group.planned.push(row.afterMinutes);
        group.actual.push(log.minutes);
        groups.set(row.shift, group);
      }
      const plannedPersonal = row.blocks.filter(block => ['learning', 'family'].includes(block.category));
      if (!plannedPersonal.length) continue;
      const transition = (row.shift || 'Unrostered') + ' → ' + (roster.get(D.addDays(row.date, 1)) || 'Unrostered');
      const pattern = patterns.get(transition) || { transition, total: 0, changed: 0 };
      pattern.total += 1;
      patterns.set(transition, pattern);
      const current = D.dayPlan.build(data, row.date, {}, D.instant(row.date)).days[0].blocks;
      const prior = displacements.length;
      for (const block of plannedPersonal) {
        if (current.some(item => item.title === block.title && (item.category === block.category || item.kind === 'study') &&
          Math.max(item.start, D.instant(row.date)) === block.start && Math.min(item.end, D.instant(D.addDays(row.date, 1))) === block.end)) continue;
        displacements.push({ row, block, replacement: current.find(item => item.title === block.title) });
      }
      if (displacements.length > prior) pattern.changed += 1;
    }
    const median = values => {
      const ordered = values.slice().sort((a, b) => a - b);
      const middle = Math.floor(ordered.length / 2);
      return ordered.length % 2 ? ordered[middle] : Math.round((ordered[middle - 1] + ordered[middle]) / 2);
    };
    return { start, through, snapshots, actual, planned, logged, displacements, patterns: [...patterns.values()].filter(item => item.changed),
      groups: [...groups.values()].map(item => ({ shift: item.shift, count: item.actual.length,
        planned: median(item.planned), actual: median(item.actual) })) };
  }

  function validate(data) {
    const pref = data.settings.planFaith;
    if (pref && (!Array.isArray(pref.prayers) || new Set(pref.prayers).size !== pref.prayers.length ||
      pref.prayers.some(key => !Object.hasOwn(D.PRAYERS, key)) || !isMinutes(pref.minutes, 1, 120) ||
      !isMinutes(pref.offset, -120, 120) || pref.zikrAfter && !pref.prayers.includes(pref.zikrAfter) ||
      !isMinutes(pref.zikrMinutes, 0, 120))) throw new Error('A prayer planning preference is invalid.');
    for (const [shift, value] of Object.entries(data.settings.dayPlan?.afterByShift || {})) {
      if (!D.SHIFT[shift]?.start || !isMinutes(value, 0, 240)) throw new Error('A travel and meal allowance is invalid.');
    }
    for (const row of data.entries) {
      if (row.planRemaining != null && !isMinutes(row.planRemaining) || row.planBlocker != null && typeof row.planBlocker !== 'string' ||
          row.planParentId != null && !reference(row.planParentId) || row.planPrerequisites != null &&
          (!references(row.planPrerequisites) || row.planPrerequisites.some(id => D.same(id, row.id)))) {
        throw new Error('A task readiness record is invalid.');
      }
    }
    const stamp = value => typeof value === 'string' && !!stampAt(value);
    const checks = {
      shiftPauses: row => stamp(row.at) && typeof row.note === 'string' && typeof row.restart === 'string' &&
        (!row.taskId || reference(row.taskId)) && (!row.dutyDate || validDay(row.dutyDate) && D.SHIFT[row.shift]?.start) &&
        (row.remaining == null || isMinutes(row.remaining)) && (!row.resumedAt || stamp(row.resumedAt)),
      briefNotes: row => stamp(row.at) && validDay(row.dutyDate) && D.SHIFT[row.shift]?.start &&
        typeof row.source === 'string' && typeof row.text === 'string' && !!D.tidy(row.text) && (!row.taskId || reference(row.taskId)),
      followConversations: row => stamp(row.at) && typeof row.person === 'string' && !!D.tidy(row.person) && references(row.itemIds) &&
        typeof row.note === 'string' && (!row.promiseDate || validDay(row.promiseDate)) && (!row.promiseTime || row.promiseDate && validTime(row.promiseTime)) &&
        (!row.checkDate || validDay(row.checkDate)) && (!row.checkTime || row.checkDate && validTime(row.checkTime)),
      personalWindows: row => typeof row.title === 'string' && !!D.tidy(row.title) && ['family', 'personal', 'appointment'].includes(row.category) &&
        validDay(row.from) && validDay(row.through) && row.from <= row.through && validTime(row.startTime) && validTime(row.endTime) &&
        isMinutes(row.minutes) && D.instant(row.from, row.endTime) - D.instant(row.from, row.startTime) >= row.minutes * minute &&
        (!row.entryId || reference(row.entryId)) && (!row.completedAt || stamp(row.completedAt)),
      learningLinks: row => reference(row.taskId) && reference(row.courseId) && reference(row.sessionId) &&
        typeof row.takeaway === 'string' && typeof row.sample === 'string' && ['ready', 'used', 'practice'].includes(row.status) &&
        stamp(row.at) && (!row.sampleId || reference(row.sampleId)),
      planBaselines: row => row.id === row.date && validDay(row.date) && stamp(row.at) &&
        (!row.shift || Object.hasOwn(D.SHIFT, row.shift)) && validDay(row.afterDate) &&
        (row.afterMinutes === null || isMinutes(row.afterMinutes)) && Array.isArray(row.blocks) && row.blocks.every(block =>
          block && typeof block.title === 'string' && Object.hasOwn(D.planning.categories, block.category) &&
          Number.isFinite(block.start) && Number.isFinite(block.end) && block.end > block.start)
    };
    for (const [key, check] of Object.entries(checks)) {
      if (data[key].some(row => !check(row))) throw new Error('A diary record in ' + key + ' is invalid.');
    }
  }

  D.shiftCompanion = { tracked, activeDuty, activePauses, blockers, cyclic, briefing, waitingPerson, personGroups, personKey,
    faithWindows, findPersonalSlot, rosterPreview, afterKey, saveBaseline, cycleReview, validate };
  if (typeof module === 'object' && module.exports) module.exports = D.shiftCompanion;
})(globalThis.Diary || (typeof require === 'function' ? require('./core.js') : undefined));
