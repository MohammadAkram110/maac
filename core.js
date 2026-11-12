/* Data and date rules shared by the browser and the local verification suite. */
(function (root) {
  'use strict';
  const APP = 'my-shift-life-diary';
  const SCHEMA = 6;
  const KEY = APP + ':v' + SCHEMA;
  const taskDesk = root.TaskDeskRules || (typeof module === 'object' ? require('./task-desk.js') : null);
  const ZONE = 'Asia/Karachi';
  const DAY = 86400000;
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const TYPES = { task: 'Task', note: 'Diary Note', event: 'Event', meeting: 'Meeting', log: 'Shift Log', mwr: 'MWR', followup: 'Follow-up' };
  const STATUS = { todo: 'To do', doing: 'In progress', waiting: 'Waiting', done: 'Done' };
  const MWR = { planned: 'To be raised', raised: 'Raised', working: 'In progress', waiting: 'Waiting', closed: 'Closed' };
  const ROLES = ['Routine', 'Helper/Operator', 'Day Engineer', 'Section Head', 'UM', 'DM'];
  const SHIFT = {
    Morning: { start: '06:00', end: '14:00' }, Evening: { start: '14:00', end: '22:00' },
    Night: { start: '22:00', end: '06:00' }, D12: { start: '06:00', end: '18:00', family: 'Morning' },
    N12: { start: '18:00', end: '06:00', family: 'Night' }, E12: { start: '14:00', end: '02:00', family: 'Evening' },
    Rest: {}, Off: {}, Leave: {}
  };
  const WORKING_SHIFTS = Object.keys(SHIFT).filter(shift => SHIFT[shift].start);
  const shiftFamily = shift => SHIFT[shift]?.family || shift;
  const overnight = shift => !!SHIFT[shift]?.start && SHIFT[shift].end < SHIFT[shift].start;
  const PHASES = { start: 'Start Shift', during: 'During Shift', end: 'End Shift' };
  const REPORT = {
    highlights: 'Shift highlights',
    hse: 'HSE/SCD Highlights', lab: 'Lab Highlights', plant1: 'Plant Highlights 1',
    plant2: 'Plant Highlights 2', plant3: 'Plant Highlights 3', completed: 'Completed Work',
    pending: 'Pending Work for Next Shift', verbal: 'Verbal Summary'
  };
  const EXTRA_LISTS = ['workRules', 'namazTimes', 'namazLog', 'zikrItems', 'zikrLog', 'faithNotes', 'mealLogs',
    'assignments', 'updateNotes', 'learningCourses', 'learningSessions', 'planDays', 'planBlocks', 'shiftCloseouts', 'practiceQueue', 'timeLogs',
    'shiftPauses', 'briefNotes', 'followConversations', 'personalWindows', 'learningLinks', 'planBaselines', 'actualActivities',
    'financePlans', 'billTemplates'];
  const LISTS = ['entries', 'roster', 'dutyHistory', 'reports', 'contacts', 'notebooks', 'templates', 'checklists',
    'goals', 'handovers', 'money', 'budgets', ...EXTRA_LISTS];
  const MONEY_LIMIT = 99_999_999_999;
  const dtf = new Intl.DateTimeFormat('en-GB', {
    timeZone: ZONE, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23'
  });
  const datePattern = /^\d{4}-\d{2}-\d{2}$/;
  const timePattern = /^([01]\d|2[0-3]):[0-5]\d$/;
  const clone = (value) => JSON.parse(JSON.stringify(value));
  const uid = () => globalThis.crypto?.randomUUID?.() ?? Date.now().toString(36) + '-' + Math.random().toString(36).slice(2);
  const stamp = () => new Date().toISOString();
  const same = (a, b) => String(a) === String(b);
  const byId = (rows, id) => rows.find(row => same(row.id, id));
  const active = (row) => !row.deletedAt && !row.draft && row.shiftStickyInactive !== true;
  const open = (row) => active(row) && !['done', 'closed'].includes(row.status);
  const timed = (row) => row.type === 'event' || row.type === 'meeting';
  const str = (value) => value == null ? '' : String(value);
  const list = (value) => Array.isArray(value) ? value : [];
  const tidy = (value) => str(value).trim();
  const unique = (values) => [...new Set(values)];
  const dateNum = (date) => Date.parse(date + 'T00:00:00Z') / DAY;
  const dateAt = (n) => new Date(n * DAY).toISOString().slice(0, 10);

  function parts(input = Date.now()) {
    const values = Object.fromEntries(dtf.formatToParts(input instanceof Date ? input : new Date(input)).map(part => [part.type, part.value]));
    return { date: values.year + '-' + values.month + '-' + values.day, time: values.hour + ':' + values.minute, second: values.second };
  }

  function parseDate(input) {
    let value = tidy(input);
    const display = /^(\d{1,2})-([A-Za-z]{3})-(\d{4})$/.exec(value);
    if (display) {
      const month = MONTHS.findIndex(name => name.toLowerCase() === display[2].toLowerCase()) + 1;
      if (!month) return '';
      value = display[3] + '-' + String(month).padStart(2, '0') + '-' + display[1].padStart(2, '0');
    }
    if (!datePattern.test(value) || !Number.isFinite(dateNum(value)) || dateAt(dateNum(value)) !== value) return '';
    return value;
  }

  function formatDate(date) {
    if (!parseDate(date)) return '';
    const [year, month, day] = parseDate(date).split('-');
    return day + '-' + MONTHS[Number(month) - 1] + '-' + year;
  }

  function formatStamp(value) {
    if (!value || !Number.isFinite(Date.parse(value))) return '';
    const local = parts(value);
    return formatDate(local.date) + ' ' + local.time;
  }

  function legacyDate(value) {
    if (typeof value !== 'string' && typeof value !== 'number') return '';
    if (typeof value === 'string' && datePattern.test(value)) return parseDate(value);
    return parseDate(value) || (Number.isFinite(new Date(value).getTime()) ? parts(value).date : '');
  }

  const addDays = (date, count) => dateAt(dateNum(date) + count);
  const daysBetween = (a, b) => dateNum(b) - dateNum(a);
  const weekStart = (date) => addDays(date, -((new Date(date + 'T00:00Z').getUTCDay() + 6) % 7));

  function addMonths(date, count) {
    const [year, month, day] = date.split('-').map(Number);
    const target = new Date(Date.UTC(year, month - 1 + count, 1));
    const last = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
    target.setUTCDate(Math.min(day, last));
    return target.toISOString().slice(0, 10);
  }

  function monthRange(date) {
    const start = date.slice(0, 7) + '-01';
    return [start, addDays(addMonths(start, 1), -1)];
  }

  function instant(date, time = '00:00') {
    if (!parseDate(date) || !timePattern.test(time)) return NaN;
    const wall = Date.parse(date + 'T' + time + ':00Z');
    let guess = wall - 5 * 3600000;
    for (let i = 0; i < 3; i += 1) {
      const actual = parts(guess);
      const shown = Date.parse(actual.date + 'T' + actual.time + ':' + actual.second + 'Z');
      if (shown === wall) break;
      guess += wall - shown;
    }
    return guess;
  }

  function empty() {
    const data = {
      app: APP, schemaVersion: SCHEMA, rev: '', savedAt: '', reminders: {},
      settings: { theme: 'system', palette: 'green', quietStart: '', quietEnd: '', reminderTime: '09:00', notifications: false, soonDays: 7 }
    };
    for (const key of LISTS) data[key] = [];
    if (api.starterZikr) data.zikrItems = api.starterZikr();
    return data;
  }

  function dutyWindow(duty) {
    const shift = SHIFT[duty?.shift];
    if (!shift?.start || !parseDate(duty.date)) return null;
    return {
      start: instant(duty.date, shift.start),
      end: instant(overnight(duty.shift) ? addDays(duty.date, 1) : duty.date, shift.end)
    };
  }

  function dutyTimeDate(date, shift, time) {
    return overnight(shift) && time && time < SHIFT[shift].end ? addDays(date, 1) : date;
  }

  function taskDay(row) {
    if (row.shiftDateOverride) return row.date;
    if (row.shiftStickyKey && row.shiftStickyDay) return row.shiftStickyDay;
    if (row.dutyDate && overnight(row.shift) && dutyTimeDate(row.dutyDate, row.shift, row.time) === row.date) {
      return row.dutyDate;
    }
    return row.dutyDate > row.date ? row.dutyDate : row.date;
  }

  function dutyAt(roster, now = Date.now()) {
    const local = parts(now);
    const today = roster.find(row => row.date === local.date);
    const yesterday = roster.find(row => row.date === addDays(local.date, -1));
    const current = [yesterday, today].filter(Boolean).find(row => {
      const window = dutyWindow(row);
      return window && now >= window.start && now < window.end;
    });
    const next = roster.filter(row => dutyWindow(row)?.start > now).sort((a, b) => a.date.localeCompare(b.date))[0];
    return { current, next, today };
  }

  function updateDuty(data, date, shift, group, note, reason, now = stamp()) {
    const previous = data.roster.find(row => row.date === date);
    if (!parseDate(date) || (shift && !Object.hasOwn(SHIFT, shift))) throw new Error('Choose a valid duty date and shift.');
    if (previous?.shift === shift && previous.group === group && previous.note === note) return;
    if (!previous && !shift) return;
    const next = shift ? { ...previous, id: previous?.id ?? uid(), date, shift, group, note, updatedAt: now } : null;
    if (previous) data.roster = data.roster.filter(row => row.date !== date);
    if (next) data.roster.push(next);
    data.dutyHistory.push({ id: uid(), date, before: previous ?? null, after: next, reason, at: now });
  }

  function swapDuty(data, date, otherDate, reason, now = stamp()) {
    if (date === otherDate) throw new Error('Choose a different date for the swap.');
    const first = data.roster.find(row => row.date === date);
    const second = data.roster.find(row => row.date === otherDate);
    if (!first || !second) throw new Error('Enter roster duties for both dates before swapping.');
    const note = tidy(reason);
    updateDuty(data, date, second.shift, second.group, second.note, 'Swap with ' + formatDate(otherDate) + (note ? ' · ' + note : ''), now);
    updateDuty(data, otherDate, first.shift, first.group, first.note, 'Swap with ' + formatDate(date) + (note ? ' · ' + note : ''), now);
  }

  const manualOrder = (a, b) => (Number(a.position) || 0) - (Number(b.position) || 0) || str(a.id).localeCompare(str(b.id));

  function moveTask(rows, id, status = '', beforeId = null) {
    const task = byId(rows, id);
    if (task?.type !== 'task' || !active(task) || (status && !Object.hasOwn(STATUS, status))) return false;
    if (beforeId !== null && same(id, beforeId)) return false;
    const ordered = rows.filter(row => row.type === 'task' && active(row) && !same(row.id, id)).sort(manualOrder);
    let index = beforeId == null ? ordered.length : ordered.findIndex(row => same(row.id, beforeId));
    if (index < 0) return false;
    if (beforeId == null && status) {
      const last = ordered.findLastIndex(row => row.status === status);
      if (last >= 0) index = last + 1;
    }
    ordered.splice(index, 0, task);
    ordered.forEach((row, i) => { row.position = i + 1; });
    return true;
  }

  function setTaskStatus(task, status, now = stamp()) {
    if (task.status === status) return;
    const before = task.status;
    task.status = status;
    task.completedAt = status === 'done' ? now : '';
    if (task.type === 'task' && status !== 'done' && task.closedDate) task.closedDate = '';
    task.updatedAt = now;
    task.editToken = uid();
    task.history = [...list(task.history), { at: now, action: 'Status changed', from: STATUS[before] ?? before, to: STATUS[status] }];
  }

  function upcoming(date, rule, index) {
    const increment = Number(rule.interval) * index;
    if (rule.unit === 'month' || rule.unit === 'year') return addMonths(date, increment * (rule.unit === 'year' ? 12 : 1));
    return addDays(date, increment * (rule.unit === 'week' ? 7 : 1));
  }

  function validRule(rule) {
    return rule && ['fixed', 'completion'].includes(rule.mode) &&
      Number.isInteger(Number(rule.interval)) && Number(rule.interval) >= 1 && Number(rule.interval) <= 365 &&
      ['day', 'week', 'month', 'year'].includes(rule.unit) && (!rule.until || parseDate(rule.until));
  }

  const anchorDate = (entry) => entry.occurrenceDate || (entry.type === 'task' && entry.dueDate) || entry.date;
  const occurrenceId = (id, date) => 'repeat:' + encodeURIComponent(str(id)) + ':' + date;
  function planOffset(entry) {
    if (entry.type !== 'task') return 0;
    return Number.isInteger(entry.recurrence?.planOffset) ? entry.recurrence.planOffset :
      daysBetween(anchorDate(entry), entry.originalDate || entry.date);
  }

  function occurrence(root, parent, date, now) {
    const planned = addDays(date, planOffset(root));
    const row = {
      ...clone(root), id: occurrenceId(root.id, date), seriesId: root.id, occurrenceDate: date,
      date: planned, recurrence: null, focus: false, pinned: false, createdAt: now, updatedAt: now,
      editToken: uid(), history: [{ at: now, action: 'Created by recurrence', date }],
      deletedAt: '', draft: false, sourceNoteId: '', sample: !!root.sample
    };
    if (row.type === 'task') {
      row.status = 'todo';
      row.completedAt = '';
      row.dueDate = (root.recurrence.hasDeadline ?? !!root.dueDate) ? date : '';
      row.originalDueDate = row.dueDate;
      row.originalDate = planned;
      row.subtasks = list(root.subtasks).map(item => ({ ...item, done: false }));
      row.actualMinutes = null;
      row.actualDate = '';
      row.closingComment = '';
      row.waitingOn = '';
      row.waitingReason = '';
      row.followDate = '';
      row.followTime = '';
      delete row.followStep;
      delete row.progressPercent;
      delete row.progressUpdates;
      delete row.sourceTaskId;
      row.closedDate = '';
      row.verifiedBy = '';
      row.closeNotes = '';
      if (row.noteStyles) {
        delete row.noteStyles.waitingReason;
        delete row.noteStyles.closeNotes;
      }
      row.dutyDate = '';
      row.position = 0;
      delete row.stickyPinned;
      delete row.stickyRank;
      delete row.stickyPriority;
      delete row.shiftStickyKey;
      delete row.shiftStickyDay;
      delete row.shiftStickyInactive;
      delete row.shiftScheduleKey;
      delete row.shiftReminderKey;
      delete row.shiftAdvanceAt;
      delete row.shiftDateOverride;
      delete row.shiftSequence;
      delete row.shiftRoutineRank;
      delete row.planOccurrenceOverride;
      delete row.planNotBefore;
      delete row.planPrerequisites;
      delete row.planBlocker;
      delete row.planRemaining;
      delete row.planParentId;
      delete row.lastSlotBooking;
      delete row.rolloverReview;
      if (parent) row.previousOccurrenceId = parent.id;
    } else if (root.endDate) {
      row.endDate = addDays(planned, daysBetween(root.date, root.endDate));
    }
    return row;
  }

  function fixedOccurrences(data, start, end, virtual = false, now = stamp(), tasks = false) {
    const roots = data.entries.filter(row => active(row) && (tasks ? row.type === 'task' && !row.legacySeries : timed(row)) &&
      !row.seriesId && validRule(row.recurrence) && row.recurrence.mode === 'fixed');
    const occupied = new Set(data.entries.filter(row => row.seriesId && row.occurrenceDate)
      .map(row => occurrenceId(row.seriesId, row.occurrenceDate)));
    const result = [];
    for (const row of roots) {
      const rule = row.recurrence;
      const anchor = anchorDate(row);
      if (!parseDate(anchor) || !parseDate(row.date)) continue;
      const limit = rule.until && rule.until < end ? rule.until : end;
      const monthDistance = (Number(start.slice(0, 4)) - Number(anchor.slice(0, 4))) * 12 +
        Number(start.slice(5, 7)) - Number(anchor.slice(5, 7));
      const units = rule.unit === 'month' ? monthDistance : rule.unit === 'year' ? monthDistance / 12 :
        daysBetween(anchor, start) / (rule.unit === 'week' ? 7 : 1);
      const first = Math.max(1, Math.floor(units / Number(rule.interval)) - 1);
      for (let i = first; i < first + 10000; i += 1) {
        const date = upcoming(anchor, rule, i);
        if (!parseDate(date) || date > limit) break;
        if (date < start || occupied.has(occurrenceId(row.id, date))) continue;
        const next = occurrence(row, null, date, now);
        next.virtual = virtual;
        result.push(next);
      }
    }
    return result;
  }

  function generateRecurrence(data, now = stamp()) {
    const local = parts(now).date;
    const roots = data.entries.filter(row => timed(row) && !row.seriesId && active(row) && validRule(row.recurrence) && parseDate(anchorDate(row)));
    const anchors = roots.map(anchorDate).sort();
    const initial = anchors[0] || local;
    const horizon = addDays(local, Number(data.settings.soonDays) || 7);
    const generated = fixedOccurrences(data, initial, horizon, false, now);
    const successorOf = new Set(data.entries.map(row => str(row.previousOccurrenceId)).filter(Boolean));
    const ids = new Set(data.entries.map(row => str(row.id)));
    for (const task of data.entries) {
      if (!active(task) || task.type !== 'task' || task.status !== 'done' || !task.completedAt || successorOf.has(str(task.id))) continue;
      const original = task.seriesId ? byId(data.entries, task.seriesId) : task;
      const template = task.legacySeries ? task : original;
      if (!template || !active(template) || !validRule(template.recurrence)) continue;
      const rule = template.recurrence;
      const completed = Date.parse(task.completedAt);
      if (!Number.isFinite(completed)) continue;
      const base = task.legacySeries ? (task.dueDate ? instant(task.dueDate, task.dueTime || '23:59') : null) :
        instant(anchorDate(task), task.dueTime || '23:59');
      const repeat = { every: Number(rule.interval), unit: rule.unit,
        from: rule.mode === 'completion' ? 'completion' : 'schedule',
        anchorDay: rule.anchorDay || Number(anchorDate(template).slice(-2)) };
      // Task Desk advances a fixed task to the first scheduled slot after completion.
      const due = taskDesk.nextDueAt({ dueAt: base, repeat }, completed);
      if (!Number.isFinite(due)) continue;
      const { date, time } = parts(due);
      const id = task.legacySeries ? task.legacySeries.id + ':' + (task.legacySeries.index + 1) : occurrenceId(template.id, date);
      if (!parseDate(date) || (rule.until && date > rule.until) || ids.has(id)) continue;
      const next = occurrence(template, task, date, now);
      next.id = id;
      if (task.legacySeries) {
        next.legacySeries = { id: task.legacySeries.id, index: task.legacySeries.index + 1 };
        next.recurrence = clone(rule);
        next.seriesId = task.legacySeries.id;
        next.dueDate = date;
        next.dueTime = time;
        next.originalDueDate = date;
      }
      generated.push(next);
      ids.add(id);
    }
    let position = data.entries.reduce((high, row) => row.type === 'task'
      ? Math.max(high, Number(row.position) || 0) : high, 0);
    for (const row of generated) {
      if (row.type === 'task') row.position = ++position;
      data.entries.push(row);
    }
    return generated.length;
  }

  function eventsIn(data, start, end) {
    if (start > end) return [];
    let earliest = 0;
    let latest = 0;
    for (const row of data.entries.filter(row => timed(row) && !row.seriesId && validRule(row.recurrence))) {
      const anchor = anchorDate(row);
      if (!parseDate(anchor)) continue;
      const offsets = [planOffset(row)];
      if (timed(row) && parseDate(row.endDate)) offsets.push(daysBetween(row.date, row.endDate));
      for (const offset of offsets) {
        earliest = Math.min(earliest, offset);
        latest = Math.max(latest, offset);
      }
    }
    const candidates = [...data.entries, ...fixedOccurrences(data, addDays(start, -latest), addDays(end, -earliest), true)];
    return candidates.filter(row => active(row) &&
      (row.date <= end && calendarEnd(row) >= start ||
       row.dueDate >= start && row.dueDate <= end ||
       row.followDate >= start && row.followDate <= end ||
       row.dutyDate >= start && row.dutyDate <= end));
  }

  function eventWindow(row) {
    if (!row.time || (!timed(row) && !(row.type === 'task' && row.planMinutes > 0))) return null;
    const start = instant(row.date, row.time);
    const end = row.type === 'task' ? start + row.planMinutes * 60000 :
      row.endTime ? instant(row.endDate || row.date, row.endTime) : start;
    return end > start ? { start, end } : null;
  }

  function calendarEnd(row) {
    if (timed(row)) return row.endDate || row.date;
    const window = row.type === 'task' && row.planMinutes > 0 ? eventWindow(row) : null;
    return window ? parts(window.end - 1).date : row.date;
  }

  function overlaps(rows) {
    const events = rows.map(row => ({ id: row.id, ...eventWindow(row) })).filter(row => Number.isFinite(row.start))
      .sort((a, b) => a.start - b.start);
    const ids = new Set();
    let previous = events[0];
    for (const event of events.slice(1)) {
      if (event.start < previous.end) {
        ids.add(str(previous.id));
        ids.add(str(event.id));
      }
      if (event.end > previous.end) previous = event;
    }
    return ids;
  }

  function search(data, filters) {
    const lower = (value) => str(value).toLocaleLowerCase('en');
    const match = (value, term) => lower(value).includes(lower(term));
    const words = tidy(filters.words).split(/\s+/).filter(Boolean);
    const rows = filters.from && filters.to
      ? eventsIn(data, filters.from, filters.to)
      : data.entries.filter(row => active(row) &&
        (!filters.from || [row.date, row.endDate, row.dueDate, row.followDate].some(date => date >= filters.from)) &&
        (!filters.to || [row.date, row.dueDate, row.followDate].some(date => date && date <= filters.to)));
    return rows.filter(row => {
      const contact = byId(data.contacts, row.contactId);
      const notebook = byId(data.notebooks, row.notebookId);
      const assignment = row.portfolioId && byId(list(data.assignments), row.portfolioId);
      const person = [row.person, row.assignedBy, api.ASSIGNERS?.[api.assignmentOf(row)], row.participants, row.verifiedBy, contact?.name].filter(Boolean).join(' ');
      const searchable = [row.title, row.body, row.agenda, row.minutes, row.decisions, row.readings, row.number,
        row.department, row.area, row.equipment, row.routineHeading, person, row.handover, row.closingComment, row.waitingOn, row.waitingReason, row.closeNotes,
        notebook?.name, assignment?.deletedAt ? '' : assignment?.title,
        ...list(row.tags), ...list(row.updates).map(update => update.text), ...list(row.subtasks).map(item => item.title)].join(' ');
      return (!filters.type || row.type === filters.type) && (!filters.scope || row.scope === filters.scope) &&
        match(person, filters.person) && match(row.area, filters.area) && match(row.equipment, filters.equipment) &&
        (!filters.tag || list(row.tags).some(tag => match(tag, filters.tag))) && words.every(word => match(searchable, word));
    }).sort((a, b) => b.date.localeCompare(a.date) || str(b.time).localeCompare(str(a.time)));
  }

  function deadline(row, settings) {
    const date = row.type === 'task' ? row.dueDate : timed(row) ? row.date : row.followDate || row.dueDate;
    if (!date) return null;
    const time = timed(row) ? row.time : row.followDate && row.type !== 'task' ? row.followTime : row.dueTime;
    return { date, time: time || settings.reminderTime || '09:00', explicit: !!time };
  }

  function isOverdue(row, now) {
    return open(row) && !!row.dueDate && (row.dueDate < now.date ||
      row.dueDate === now.date && !!row.dueTime && row.dueTime < now.time);
  }

  function quietNow(settings, time) {
    const { quietStart: start, quietEnd: end } = settings;
    if (!timePattern.test(start) || !timePattern.test(end) || start === end) return false;
    return start < end ? time >= start && time < end : time >= start || time < end;
  }

  function reminderRows(data, now = Date.now(), ignoreQuiet = false) {
    if (!ignoreQuiet && quietNow(data.settings, parts(now).time)) return [];
    return data.entries.filter(row => open(row) && row.remind === true).flatMap(row => {
      const due = deadline(row, data.settings);
      if (!due) return [];
      const lead = Number(row.remindMinutes) || 0;
      const key = JSON.stringify([row.id, due.date, due.time, lead]);
      const state = data.reminders[key] || {};
      const dueAt = instant(due.date, due.time) - lead * 60000;
      if (state.ack || state.snooze > now || dueAt > now) return [];
      return [{ row, key, dueAt, due, state }];
    }).sort((a, b) => a.dueAt - b.dueAt);
  }

  function reportText(report, verbal = false) {
    const window = dutyWindow(report);
    const range = window ? [window.start, window.end].map(ms => formatStamp(new Date(ms).toISOString())).join(' → ') : '';
    const heading = ['CAN Plant Shift Report', formatDate(report.date) + ' · ' + report.shift, range,
      report.status === 'ready' ? 'Ready' : 'Draft', report.incharge && 'Shift in-charge · ' + report.incharge,
      report.recipient && 'Handover to · ' + report.recipient].filter(Boolean).join('\n');
    const section = (label, text) => {
      const lines = taskDesk.reportLines(text);
      return lines.length ? label + '\n' + lines.map(line => '• ' + line).join('\n') : '';
    };
    const sections = verbal && tidy(report.sections?.verbal)
      ? [section('Verbal summary', report.sections.verbal), section(REPORT.pending, report.sections.pending)]
      : Object.entries(REPORT).filter(([key]) => key !== 'verbal').map(([key, title]) => section(title, report.sections?.[key]));
    if (report.acknowledgement) sections.push(section('Handover acknowledgement', report.acknowledgement));
    return [heading, verbal && !tidy(report.sections?.verbal) ? 'Verbal handover outline' : '', ...sections].filter(Boolean).join('\n\n');
  }

  function appendReportSource(report, section, row) {
    if (!Object.hasOwn(REPORT, section) || !row || !active(row)) return false;
    report.sources ??= [];
    report.sections ??= {};
    if (report.sources.some(source => same(source.id, row.id))) return false;
    const text = [row.title, row.body, row.readings, section === 'pending' ? row.handover : ''].filter(Boolean).join('\n');
    if (!tidy(text)) return false;
    const previous = report.sections[section] || '';
    const normal = (value) => tidy(value).replace(/\s+/g, ' ').toLocaleLowerCase('en');
    const used = new Set(Object.values(report.sections).flatMap(value => str(value).split('\n')).map(normal));
    const lines = text.split('\n').filter(line => {
      const clean = normal(line);
      if (!clean || used.has(clean)) return false;
      used.add(clean);
      return true;
    });
    if (!lines.length) return false;
    report.sections[section] = [previous, lines.join('\n')].filter(Boolean).join('\n');
    report.sources.push({ id: row.id, section });
    return true;
  }

  function metrics(data, start, end, today = parts().date) {
    const cutoff = end > today ? today : end;
    const openAt = (row, date) => row.date <= date && (!row.completedAt ? open(row) : parts(row.completedAt).date > date);
    const tasks = data.entries.filter(row => active(row) && row.type === 'task');
    const completed = tasks.filter(row => row.completedAt && parts(row.completedAt).date >= start && parts(row.completedAt).date <= cutoff);
    const overdue = tasks.filter(row => row.dueDate && row.dueDate < cutoff && row.date <= cutoff && openAt(row, cutoff));
    const carried = tasks.filter(row => (row.originalDate || row.date) < start &&
      openAt({ ...row, date: row.originalDate || row.date }, addDays(start, -1)));
    const upcoming = tasks.filter(row => open(row) && row.dueDate && row.dueDate > cutoff && row.dueDate <= addDays(cutoff, 7));
    const mwrs = data.entries.filter(row => row.type === 'mwr' && active(row) && row.date <= cutoff &&
      (row.status !== 'closed' || row.closedDate > cutoff))
      .map(row => ({ row, age: row.raisedDate && row.raisedDate <= cutoff ? daysBetween(row.raisedDate, cutoff) : null }))
      .sort((a, b) => (b.age ?? -1) - (a.age ?? -1));
    const work = data.entries.filter(row => active(row) && row.scope === 'work' && row.date >= start && row.date <= end);
    const followups = data.entries.filter(row => open(row) && ['task', 'mwr', 'followup'].includes(row.type) &&
      row.date <= cutoff && (row.type !== 'task' || row.status === 'waiting' || row.mwrStatus && row.mwrStatus !== 'none' && row.mwrStatus !== 'closed' || row.handover));
    const routines = data.checklists.filter(row => !row.deletedAt && row.date >= start && row.date <= end);
    const time = { work: 0, personal: 0 };
    for (const task of tasks) {
      const date = task.actualDate || task.date;
      if (date >= start && date <= end) time[task.scope] += Number(task.actualMinutes) || 0;
    }
    return { cutoff, completed, overdue, carried, upcoming, mwrs, work, followups, routines, time };
  }

  const categoryKey = value => tidy(value).toLocaleLowerCase('en').replace(/\s+/g, ' ');

  function parseMoney(value) {
    const raw = tidy(value);
    if (!/^(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d{1,2})?$/.test(raw)) return null;
    const [whole, cents = ''] = raw.replace(/,/g, '').split('.');
    const amount = Number(whole) * 100 + Number(cents.padEnd(2, '0'));
    return Number.isSafeInteger(amount) && amount > 0 && amount <= MONEY_LIMIT ? amount : null;
  }

  const moneyNumber = new Intl.NumberFormat('en-PK', { maximumFractionDigits: 2 });
  const formatMoney = minor => 'PKR ' + moneyNumber.format(minor / 100);
  const minutesText = minutes => {
    const count = Number(minutes) || 0;
    return [count >= 60 ? Math.floor(count / 60) + ' h' : '', count % 60 ? count % 60 + ' min' : ''].filter(Boolean).join(' ') || '0 min';
  };

  function financeMonth(data, month) {
    const records = data.money.filter(row => !row.deletedAt && row.date.startsWith(month + '-'));
    const budgets = data.budgets.filter(row => !row.deletedAt && row.month === month);
    const totals = { expense: 0, income: 0 };
    const categories = new Map();
    for (const row of records) {
      totals[row.type] += row.amountMinor;
      if (row.type !== 'expense') continue;
      const key = categoryKey(row.category);
      const category = categories.get(key) || { name: row.category, spent: 0, budget: null };
      category.spent += row.amountMinor;
      categories.set(key, category);
    }
    for (const row of budgets.filter(row => row.category)) {
      const key = categoryKey(row.category);
      const category = categories.get(key) || { name: row.category, spent: 0 };
      category.budget = row;
      categories.set(key, category);
    }
    const budget = budgets.find(row => !row.category) || null;
    return { records, budget, ...totals, net: totals.income - totals.expense,
      remaining: budget ? budget.amountMinor - totals.expense : null,
      categories: [...categories.values()].sort((a, b) => b.spent - a.spent || a.name.localeCompare(b.name)) };
  }

  function nextDutyAfter(roster, date, shift) {
    const start = dutyWindow({ date, shift })?.start ?? instant(date);
    return roster.filter(row => dutyWindow(row)?.start > start)
      .sort((a, b) => a.date.localeCompare(b.date))[0];
  }

  function pendingHandover(data, date, shift, local = parts()) {
    const incoming = new Map();
    for (const transfer of data.handovers.filter(row => !row.deletedAt && row.toDate === date && row.toShift === shift)) {
      for (const id of transfer.itemIds) incoming.set(str(id), transfer);
    }
    const work = data.entries.filter(row => row.scope === 'work' && open(row) && ['task', 'followup', 'mwr'].includes(row.type));
    return work.filter(row => incoming.has(str(row.id)) || ((row.type !== 'task' || taskDay(row) <= date) &&
      (!row.shift || !shift || row.shift === shift) &&
      (row.handover || row.type !== 'task' && row.date <= date || row.dutyDate === date || row.date === date ||
        row.priority === 'critical' || row.status === 'waiting' || isOverdue(row, local) ||
        (row.mwrStatus && !['none', 'closed'].includes(row.mwrStatus)))))
      .map(row => ({ row, transfer: incoming.get(str(row.id)) }))
      .sort((a, b) => Number(!!b.transfer) - Number(!!a.transfer) || manualOrder(a.row, b.row));
  }

  const api = { APP, SCHEMA, KEY, ZONE, MONTHS, TYPES, STATUS, MWR, ROLES, SHIFT, WORKING_SHIFTS, PHASES, REPORT, LISTS, EXTRA_LISTS, MONEY_LIMIT, taskDesk, timePattern,
    clone, uid, stamp, same, byId, active, open, timed, str, list, tidy, unique, parts, parseDate, formatDate,
    formatStamp, legacyDate, addDays, daysBetween, weekStart, addMonths, monthRange, instant, empty, dutyWindow,
    dutyAt, dutyTimeDate, taskDay, shiftFamily, overnight, updateDuty, swapDuty, manualOrder, moveTask, setTaskStatus, validRule, anchorDate, fixedOccurrences,
    generateRecurrence, eventsIn, eventWindow, calendarEnd, overlaps, search, deadline, isOverdue, quietNow, reminderRows,
    reportText, appendReportSource, metrics, categoryKey, parseMoney, formatMoney, minutesText, financeMonth,
    nextDutyAfter, pendingHandover };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Diary = api;
})(globalThis);
