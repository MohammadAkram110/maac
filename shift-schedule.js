/* Roster-based sticky schedules and persistent in-app alarms. */
(function (D) {
  'use strict';

  const routines = {
    Morning: [
      ['logbook', 'Logbook reading', '06:20'],
      ['ora', 'ORA reading and jobs follow-up', '06:25'],
      ['bm-dcs', 'Discussion with BM and DCS monitoring', '06:30'],
      ['miv', 'Fuel MIV for CAN plant vehicles', '06:35'],
      ['ptw', 'PTW completion', '06:40'],
      ['checklist', 'Area Engineer checklist filling', '13:00'],
      ['writing', 'Logbook writing', '13:20']
    ],
    Evening: [
      ['logbook', 'Logbook reading', '14:20'],
      ['ora', 'ORA reading and jobs follow-up', '14:25'],
      ['bm-dcs', 'Discussion with BM and DCS monitoring', '14:30'],
      ['ptw', 'PTW revalidation', '14:40'],
      ['checklist', 'Area Engineer checklist filling', '18:00'],
      ['dinner', 'Dinner', '20:30', 30],
      ['writing', 'Logbook writing', '21:30']
    ],
    Night: [
      ['logbook', 'Logbook reading', '22:20'],
      ['bm-dcs', 'Discussion with BM and DCS monitoring', '22:30'],
      ['ora', 'ORA reading and jobs follow-up', '22:40'],
      ['ptw', 'PTW revalidation if any', '22:45'],
      ['emergency', 'Emergency Talk', '22:50'],
      ['checklist', 'Area Engineer checklist filling', '23:30'],
      ['dpr', 'DPR sheet making', '00:01'],
      ['highlights', 'Highlight making', '01:00'],
      ['dcs-learning', 'DCS Learning', '02:00', 60],
      ['batch', 'Batch preparation', '03:00'],
      ['permits', 'Permits making', '04:00']
    ]
  };
  const weekly = {
    safety: ['safety', 'Follow up the safety articles checklist audit', '10:00'],
    topics: ['dlevel', 'D-level topic reading, sending and assigning to operators', '07:30'],
    dlevel: ['dlevel', 'D-level conducting for my group', '07:30', 90],
    meeting: ['meeting', 'Communication meeting', '14:30', 60],
    points: ['points', 'Make Communication meeting points', '18:30']
  };
  const legacyTitles = { ora: 'ORA reading', checklist: 'Area engineer checklist filling' };
  const isRest = shift => ['Rest', 'Off', 'Leave'].includes(shift);
  const timedTypes = new Set(['task', 'event', 'meeting', 'followup', 'mwr']);
  const stamp = ms => new Date(ms).toISOString();
  const scheduleKey = (family, key) => family + ':' + key;
  const rosterOrder = roster => roster.slice().sort((a, b) => a.date.localeCompare(b.date));
  const workingDuties = roster => roster.filter(row => D.SHIFT[row.shift]?.start);

  function scheduledTime(data, key, fallback) {
    const time = data.settings.shiftRoutineTimes?.[key];
    return D.timePattern.test(time) ? time : fallback;
  }

  function dailySpecs(data, duty) {
    const family = D.shiftFamily(duty?.shift);
    return (routines[family] || []).map(([key, title, fallback, duration], index) => {
      const id = scheduleKey(family, key);
      const time = scheduledTime(data, id, fallback);
      return { id: 'shift-sticky:' + duty.date + ':' + key, title, time, planMinutes: duration || null,
        date: D.dutyTimeDate(duty.date, duty.shift, time), shift: duty.shift, dutyDate: duty.date,
        shiftStickyDay: duty.date, shiftStickyKey: key, shiftScheduleKey: id, shiftSequence: index + 1 };
    });
  }

  function advanceAt(day, working) {
    const earlier = working.filter(row => row.date < day);
    if (earlier.length >= 2) return D.dutyWindow(earlier.at(-2)).start;
    const fallback = D.instant(D.addDays(day, -2), '06:00');
    return earlier.length ? Math.min(D.dutyWindow(earlier[0]).start, fallback) : fallback;
  }

  function weeklySpecs(data, duty, working) {
    const weekday = D.daysBetween(D.weekStart(duty.date), duty.date);
    const family = D.shiftFamily(duty.shift);
    const keys = weekday === 1 ? [family === 'Morning' ? 'topics' : 'dlevel'] :
      weekday === 6 && family === 'Morning' ? ['safety'] : weekday === 2 && family === 'Evening' ? ['meeting', 'points'] : [];
    return keys.map(key => {
      const [identifier, title, fallback, duration] = weekly[key];
      const id = scheduleKey('Weekly', key);
      return { id: 'shift-reminder:' + duty.date + ':' + identifier, title, time: scheduledTime(data, id, fallback),
        planMinutes: duration || null, date: duty.date, shift: D.SHIFT[duty.shift]?.start ? duty.shift : '', dutyDate: duty.date,
        shiftReminderKey: identifier, shiftScheduleKey: id, shiftAdvanceAt: stamp(advanceAt(duty.date, working)) };
    });
  }

  function calendarSpecs(data, day, roster) {
    const specs = [];
    const add = (key, title, fallback) => {
      const id = scheduleKey('Calendar', key);
      const shift = roster.get(day)?.shift;
      specs.push({ id: 'shift-reminder:' + day + ':' + key, title, time: scheduledTime(data, id, fallback),
        date: day, dutyDate: day, shift: D.SHIFT[shift]?.start ? shift : '', shiftReminderKey: key, shiftScheduleKey: id });
    };
    if (D.daysBetween(D.weekStart(day), day) === 4) add('lototo', 'LOTOTO audit in substation by shift in-charge', '');
    if (D.shiftFamily(roster.get(D.addDays(day, 1))?.shift) === 'Morning') add('permit-preview', 'Permit previews', '19:00');
    return specs;
  }

  function reminderSpecs(data, day, roster, working = workingDuties(rosterOrder([...roster.values()]))) {
    const duty = roster.get(day);
    return [...(duty ? weeklySpecs(data, duty, working) : []), ...calendarSpecs(data, day, roster)];
  }

  function hasMissingShiftStickies(data, day) {
    const roster = new Map(data.roster.map(row => [row.date, row]));
    const entries = new Map(data.entries.map(row => [String(row.id), row]));
    return [...dailySpecs(data, roster.get(day)), ...calendarSpecs(data, day, roster)].some(spec => {
      const row = entries.get(spec.id);
      return !row || !row.deletedAt && (row.shiftStickyInactive || D.open(row) && !row.shiftScheduleKey);
    });
  }

  function updateRoutine(row, spec, at, today, selected) {
    if (row.deletedAt || row.draft || row.shiftDateOverride) return false;
    if (!spec && !row.shiftStickyInactive && (row.status !== 'todo' || D.instant(row.date, row.time) <= Date.parse(at))) return false;
    const changes = { shiftStickyInactive: !spec };
    if (spec) {
      const fresh = D.open({ ...row, shiftStickyInactive: false });
      const scheduledAt = D.instant(spec.date, spec.time);
      const future = scheduledAt >= Date.parse(at) || (row.dutyDate || row.shiftStickyDay) >= today;
      Object.assign(changes, { shift: spec.shift, dutyDate: spec.dutyDate, shiftSequence: spec.shiftSequence,
        shiftAdvanceAt: spec.shiftAdvanceAt });
      const migration = !row.shiftScheduleKey && (future || selected);
      const changedDuty = row.shiftScheduleKey && (row.shiftScheduleKey !== spec.shiftScheduleKey || row.shift !== spec.shift || row.shiftStickyInactive);
      const oldBatchStart = spec.shiftScheduleKey === 'Night:batch' && row.shiftScheduleKey === spec.shiftScheduleKey &&
        row.time === '02:00' && spec.time === '03:00' && !row.planOccurrenceOverride && D.instant(row.date, row.time) >= Date.parse(at);
      if (fresh && (migration || changedDuty && future || oldBatchStart)) {
        Object.assign(changes, { date: spec.date, time: spec.time, planMinutes: spec.planMinutes,
          shiftScheduleKey: spec.shiftScheduleKey });
        const knownTitle = [legacyTitles[row.shiftStickyKey], spec.title, ...Object.values(routines).flat()
          .filter(item => item[0] === row.shiftStickyKey).map(item => item[1]), ...Object.values(weekly).map(item => item[1])];
        if (knownTitle.includes(row.title)) changes.title = spec.title;
        if (migration && row.time && row.time !== spec.time && D.list(row.history).some(item => item.action === 'Edited on Shift Stickies' || item.action === 'Edited')) {
          changes.time = row.time;
          changes.date = row.date;
          changes.planMinutes = row.planMinutes;
        }
      }
    }
    if (Object.entries(changes).every(([key, value]) => value === row[key] || key === 'shiftStickyInactive' && !value && !row[key])) return false;
    Object.assign(row, changes, { updatedAt: at, editToken: D.uid() });
    row.history = [...D.list(row.history), { at, action: spec ? 'Shift schedule updated' : 'Shift routine hidden after roster change' }];
    return true;
  }

  function syncShiftStickies(data, days, at = D.stamp()) {
    const roster = rosterOrder(data.roster);
    const dutyByDate = new Map(roster.map(row => [row.date, row]));
    const working = workingDuties(roster);
    const today = D.parts(at).date;
    const selected = new Set([today, ...days.filter(Boolean)]);
    const through = D.parseDate(data.settings.shiftScheduleThrough);
    for (let day = through; day && day < today; day = D.addDays(day, 1)) selected.add(day);
    const rows = new Map(data.entries.map(row => [String(row.id), row]));
    const schedule = new Map();
    const existingDays = new Set(data.entries.filter(row => row.shiftStickyKey || row.shiftReminderKey)
      .map(row => row.shiftStickyDay || row.dutyDate));
    for (const duty of roster) {
      const requested = selected.has(duty.date);
      const existing = existingDays.has(duty.date);
      if (requested || existing) for (const spec of dailySpecs(data, duty)) schedule.set(spec.id, { spec, create: requested || duty.date >= today });
      if (requested || existing || duty.date >= today) for (const spec of weeklySpecs(data, duty, working)) {
        schedule.set(spec.id, { spec, create: requested || duty.date >= today });
      }
    }

    const calendarDays = new Set([...selected, ...existingDays].filter(Boolean));
    for (const duty of working) {
      if ((duty.date >= today || selected.has(duty.date)) && D.shiftFamily(duty.shift) === 'Morning') {
        calendarDays.add(D.addDays(duty.date, -1));
      }
    }
    for (const day of calendarDays) {
      for (const spec of calendarSpecs(data, day, dutyByDate)) {
        const preview = spec.shiftReminderKey === 'permit-preview' && selected.has(D.addDays(day, 1));
        schedule.set(spec.id, { spec, create: selected.has(day) || day >= today || preview });
      }
    }

    let changed = !through || through < today;
    if (changed) data.settings.shiftScheduleThrough = today;
    if (!Number.isFinite(data.settings.shiftAlarmFrom)) {
      const local = D.parts(at);
      data.settings.shiftAlarmFrom = D.instant(local.date, local.time);
      changed = true;
    }
    for (const row of data.entries) {
      if (!row.shiftStickyKey && !row.shiftReminderKey) continue;
      const spec = schedule.get(String(row.id))?.spec;
      changed = updateRoutine(row, spec, at, today, selected.has(row.shiftStickyDay || row.dutyDate)) || changed;
    }
    let position = data.entries.reduce((max, row) => row.type === 'task' ? Math.max(max, row.position || 0) : max, 0) + 1;
    for (const { spec, create } of schedule.values()) {
      if (!create || rows.has(spec.id)) continue;
      D.workTask(data, { ...spec, stickyCard: true, stickyPinned: true,
        stickyColour: spec.shiftReminderKey ? 'peach' : D.shiftFamily(spec.shift) === 'Night' && spec.date !== spec.dutyDate ? 'lilac' : 'sky',
        routineHeading: spec.shiftReminderKey ? 'Roster reminder' : 'Shift routine', assignment: 'routine',
        history: [{ at, action: 'Added from shift schedule' }] }, at, position++);
      changed = true;
    }
    return changed;
  }

  function saveRoutineStart(data, previous, row, at) {
    if (!previous?.shiftScheduleKey || row.time === previous.time) return;
    const [family] = row.shiftScheduleKey.split(':');
    if (!D.timePattern.test(row.time) && !(row.shiftReminderKey === 'lototo' && !row.time)) {
      throw new Error('Enter a start time for this scheduled sticky.');
    }
    if (row.shiftStickyKey) {
      const window = D.dutyWindow({ date: row.dutyDate, shift: family });
      const start = D.instant(D.dutyTimeDate(row.dutyDate, family, row.time), row.time);
      if (!window || start < window.start || start >= window.end || start + (row.planMinutes || 0) * 60000 > window.end) {
        throw new Error('Choose a start time within the ' + family + ' shift so it also works on its 12-hour duty.');
      }
    }
    data.settings.shiftRoutineTimes = { ...data.settings.shiftRoutineTimes, [row.shiftScheduleKey]: row.time };
    for (const task of data.entries) {
      if (task.shiftScheduleKey !== row.shiftScheduleKey || !D.open(task)) continue;
      const edited = D.same(task.id, row.id);
      if (!edited && (task.planOccurrenceOverride || D.instant(task.date, task.time) <= Date.parse(at))) continue;
      if (edited) delete task.planOccurrenceOverride;
      const date = task.shiftDateOverride ? task.date : task.shiftStickyKey
        ? D.dutyTimeDate(task.dutyDate, task.shift, row.time) : task.dutyDate;
      if (task.time === row.time && task.date === date) continue;
      Object.assign(task, { time: row.time, date, updatedAt: at, editToken: D.uid() });
      if (!edited) task.history = [...D.list(task.history), { at, action: 'Updated from the routine start time' }];
    }
  }

  function restBlocks(roster) {
    const sorted = rosterOrder(roster);
    const working = workingDuties(sorted).map(row => ({ date: row.date, ...D.dutyWindow(row) }));
    const blocks = [];
    for (const duty of sorted.filter(row => isRest(row.shift))) {
      const last = blocks.at(-1);
      if (last && duty.date === D.addDays(last.end, 1)) last.end = duty.date;
      else blocks.push({ start: duty.date, end: duty.date });
    }
    return blocks.map(block => {
      const prior = working.findLast(row => row.date < block.start);
      const next = working.filter(row => row.date > block.end).slice(0, 2);
      return { ...block, next, restStart: Math.max(D.instant(block.start), prior?.end || 0),
        alertAt: prior?.start ?? D.instant(D.addDays(block.start, -1), '06:00'),
        reviewEnd: next.at(-1)?.end ?? D.instant(D.addDays(block.end, 1)) };
    });
  }

  const alarmKey = (...parts) => 'shift-alarm:' + JSON.stringify(parts);
  const acknowledge = (data, key) => !!data.reminders[key]?.ack;
  const plannedDates = row => row.shiftStickyKey ? [[row.dueDate, row.dueTime]] :
    [[row.dueDate, row.dueTime], [row.date, row.time], [row.followDate, row.followTime]];
  function restAlerts(data, now = Date.now()) {
    const from = data.settings.shiftAlarmFrom ?? now;
    const blocks = restBlocks(data.roster).filter(block => block.alertAt <= now && block.reviewEnd > from);
    if (!blocks.length) return [];
    return data.entries.filter(row => timedTypes.has(row.type) && D.open(row)).flatMap(row => {
      const block = blocks.findLast(item => plannedDates(row).some(([date, time]) => {
        if (!date) return false;
        const timed = D.timePattern.test(time) ? D.instant(date, time) : 0;
        return date >= item.start && date <= item.end && (!timed || timed >= item.restStart) ||
          item.next.some(duty => date === duty.date || timed >= duty.start && timed < duty.end);
      }));
      if (!block) return [];
      const key = alarmKey('rest', row.id, block.start);
      if (acknowledge(data, key)) return [];
      const dates = block.next.map(item => D.formatDate(item.date)).join(' and ');
      return [{ row, key, at: block.alertAt, label: 'Do before rest', detail: 'Rest starts ' + D.formatDate(block.start) +
        (dates ? ' · first shifts back ' + dates : '') }];
    });
  }

  function alarms(data, now = Date.now(), rest = restAlerts(data, now)) {
    const from = data.settings.shiftAlarmFrom;
    const result = new Map(rest.map(item => [String(item.row.id), { ...item, keys: [item.key] }]));
    if (!Number.isFinite(from)) return [...result.values()];
    for (const row of data.entries) {
      if (!timedTypes.has(row.type) || !D.open(row) || !D.timePattern.test(row.time)) continue;
      const start = D.instant(row.date, row.time);
      if (start < from) continue;
      const scheduled = start <= now;
      const at = scheduled ? start : Date.parse(row.shiftAdvanceAt);
      if (!Number.isFinite(at) || at > now) continue;
      const key = scheduled ? alarmKey('start', row.id, row.shiftScheduleKey || '', row.date, row.time) :
        alarmKey('advance', row.id, row.shiftScheduleKey, row.dutyDate);
      if (acknowledge(data, key)) continue;
      const other = result.get(String(row.id));
      const end = D.eventWindow(row)?.end;
      const when = D.formatDate(row.date) + ' ' + row.time + (end ? '–' + D.parts(end).time : '');
      const label = !scheduled ? 'Upcoming duty' : now - start < 60000 ? 'Start now' : 'Start time passed';
      const alert = { row, key, at, label, detail: when };
      result.set(String(row.id), { ...(other && !scheduled ? other : alert), keys: [key, ...D.list(other?.keys)] });
    }
    return [...result.values()].sort((a, b) => b.at - a.at || D.manualOrder(a.row, b.row));
  }

  const screenshotDate = '2026-11-09';
  const screenshotTasks = [
    ['sop', 'SOP Revision', { shift: 'Evening', dutyDate: screenshotDate, stickyColour: 'mint', stickyPinned: true }],
    ['linkedin', 'Linkedin Post', { dueDate: screenshotDate, dueTime: '22:00', priority: 'high', stickyColour: 'yellow', stickyPinned: true }],
    ['topics', 'D-Level Topics reading and sending', { shift: 'Evening', dutyDate: screenshotDate, stickyColour: 'sky', stickyPinned: true }],
    ['leakages', 'Leakages Audit "Instrument Air, NA, NH3, Steam, Condensate, Process Streams, Oil (Turbo machinery, Machines, Seals) etc"',
      { dueDate: '2026-11-15', stickyColour: 'yellow' }],
    ['hoses', 'Hose Pipe Health Check (Hose Physical Health, Seals, Tagging/Testing, Whip Check/R-Pin etc)',
      { dueDate: '2026-11-18', stickyColour: 'yellow' }],
    ['apprentice', 'Apprentice Test Submission', { dueDate: '2026-11-10', dueTime: '10:00', priority: 'critical', assignment: 'other' }]
  ];
  const matchTitle = title => D.tidy(title).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const matchesTask = (row, title) => row.type === 'task' && matchTitle(row.title) === matchTitle(title);

  function addScreenshotTasks(data, at = D.stamp()) {
    if (data.settings.screenshotTasksAdded) return false;
    for (const [key, title, fields] of screenshotTasks) {
      const id = 'screenshot-task:' + key;
      if (data.entries.some(row => D.same(row.id, id) || matchesTask(row, title))) continue;
      D.workTask(data, { id, title, date: screenshotDate, stickyCard: !!fields.stickyColour, ...fields,
        history: [{ at, action: 'Added from the diary screenshots' }] }, at);
    }
    data.settings.screenshotTasksAdded = true;
    return true;
  }

  function screenshotMatches(row) {
    const known = screenshotTasks.find(([, title, fields]) => matchesTask(row, title) &&
      ([row.date, row.originalDate, row.dutyDate].includes(screenshotDate) ||
        fields.dueDate && [row.dueDate, row.originalDueDate].includes(fields.dueDate)));
    return known ? 'screenshot-task:' + known[0] : '';
  }

  function mergeScreenshotTasks(data, backup) {
    const incoming = backup.entries;
    const seed = row => D.str(row.id).startsWith('screenshot-task:');
    const actual = new Set(incoming.filter(row => !seed(row)).map(screenshotMatches).filter(Boolean));
    const referenced = new Set([data, backup].flatMap(source => [
      ...source.entries.flatMap(row => [...D.list(row.links), ...D.list(row.planPrerequisites), row.planParentId]),
      ...source.handovers.flatMap(row => row.itemIds), ...source.reports.flatMap(row => D.list(row.sources).map(item => item?.id)),
      ...source.shiftPauses.map(row => row.taskId), ...source.briefNotes.map(row => row.taskId),
      ...source.followConversations.flatMap(row => row.itemIds), ...source.learningLinks.flatMap(row => [row.taskId, row.sampleId])
    ]).filter(Boolean).map(String));
    if (actual.size) {
      data.entries = data.entries.filter(row => !(seed(row) && actual.has(String(row.id)) && !referenced.has(String(row.id)) &&
        row.createdAt === row.updatedAt && row.status === 'todo' && !row.deletedAt && D.list(row.history).length === 1));
    }
    const current = new Set(data.entries.filter(row => !seed(row)).map(screenshotMatches).filter(Boolean));
    return incoming.filter(row => !seed(row) || referenced.has(String(row.id)) || !current.has(String(row.id)));
  }

  Object.assign(D, { syncShiftStickies, hasMissingShiftStickies });
  D.shiftSchedule = { dailySpecs, calendarSpecs, reminderSpecs, saveRoutineStart, alarms, restBlocks, restAlerts, addScreenshotTasks, mergeScreenshotTasks };
})(typeof module === 'object' && module.exports ? require('./core.js') : Diary);
