/* Saved adjustments, practice, and period reporting for Day Plan. */
(function (D) {
  'use strict';

  const energies = { normal: 'Normal', light: 'Light', recovery: 'Recovery' };
  const categories = { work: 'Work', learning: 'Learning', rest: 'Rest & sleep', faith: 'Namaz & faith', family: 'Family',
    meal: 'Meals & changing', travel: 'Travel', appointment: 'Appointments', personal: 'Personal' };
  const locks = { personal: 'Personal', family: 'Family', faith: 'Namaz & faith', appointment: 'Appointment',
    rest: 'Rest & sleep', meal: 'Meal', travel: 'Travel', work: 'Work' };
  const reviewActions = { next: 'Record a next action', split: 'Add a subtask', follow: 'Arrange a follow-up', move: 'Move to a new date' };
  const priorities = { critical: 'Critical', high: 'High', normal: 'Normal', low: 'Low' };
  const editableBlocks = { prep: ['transition', 'travel'], after: ['transition', 'meal'], sleep: ['rest', 'rest'],
    nap: ['rest', 'rest'], meal: ['meal', 'meal'] };
  const minute = 60000;
  const validDay = date => !!date && D.parseDate(date) === date;
  const validMinutes = (minutes, limit = 1440) => Number.isInteger(minutes) && minutes > 0 && minutes <= limit;
  const estimate = row => row.planRemaining || row.planMinutes || (row.shiftStickyKey ? 10 : row.shiftScheduleKey || row.time && !row.planFlexible ? 15 : 25);
  const at = value => value && Number.isFinite(Date.parse(value)) ? Date.parse(value) : 0;
  const workItem = row => row.scope === 'work' && ['task', 'followup', 'mwr'].includes(row.type);
  const periodIncludes = (date, start, end) => validDay(date) && (!start || date >= start) && (!end || date <= end);
  const energy = (data, date) => D.byId(data.planDays, date)?.energy || 'normal';
  const closeoutId = (date, shift) => 'closeout:' + date + ':' + shift;
  const blockId = (type, date, shift = '') => 'plan-block:' + type + ':' + date + ':' + shift;
  const assignmentFor = (data, row) => {
    const parent = row.portfolioId && D.byId(data.assignments, row.portfolioId);
    return parent && !parent.deletedAt ? parent : null;
  };
  function availableTask(data, row) {
    if (!D.open(row)) return false;
    if (!row.assignmentPlan) return true;
    const assignment = assignmentFor(data, row);
    return !!assignment && !assignment.completedAt;
  }

  function dutyWindow(data, duty) {
    const window = D.dutyWindow(duty);
    if (!window) return null;
    const plan = D.byId(data.planDays, duty.date);
    if (plan?.finishShift !== duty.shift || !plan.finishDate || !plan.finishTime) return window;
    return { start: plan.startTime ? D.instant(duty.date, plan.startTime) : window.start,
      end: D.instant(plan.finishDate, plan.finishTime), adjusted: true };
  }

  function validate(data) {
    for (const row of data.planDays) {
      if (row.id !== row.date || !validDay(row.date) || !Object.hasOwn(energies, row.energy)) throw new Error('A Day Plan adjustment is invalid.');
      if (row.finishShift || row.finishDate || row.finishTime) {
        const shift = D.dutyWindow({ date: row.date, shift: row.finishShift });
        if (!shift || !validDay(row.finishDate) || !D.timePattern.test(row.finishTime) || row.startTime && !D.timePattern.test(row.startTime) ||
            D.instant(row.finishDate, row.finishTime) <= (row.startTime ? D.instant(row.date, row.startTime) : shift.start) ||
            row.finishDate > D.addDays(row.date, 1)) {
          throw new Error('A duty has an invalid start or finish time.');
        }
      }
    }
    for (const row of data.planBlocks) {
      if (!Object.hasOwn(editableBlocks, row.blockType) || !validDay(row.anchorDate) || (row.shift && !Object.hasOwn(D.SHIFT, row.shift)) ||
          row.id !== blockId(row.blockType, row.anchorDate, row.shift) || !validDay(row.date) || !D.timePattern.test(row.time) ||
          !validMinutes(row.minutes) || typeof row.title !== 'string' || !D.tidy(row.title)) {
        throw new Error('An adjusted plan block has an invalid date, start or duration.');
      }
    }
    for (const row of data.practiceQueue) {
      if (!D.byId(data.learningCourses, row.courseId) || typeof row.title !== 'string' || !D.tidy(row.title) || !validMinutes(row.minutes, 240) ||
          !['open', 'done'].includes(row.status)) throw new Error('A practice item is invalid.');
    }
    for (const row of data.timeLogs) {
      if (!validDay(row.date) || typeof row.title !== 'string' || !D.tidy(row.title) || !validMinutes(row.minutes) || !Object.hasOwn(categories, row.category)) {
        throw new Error('A time log is missing a valid date, activity, category or duration.');
      }
    }
    for (const row of data.shiftCloseouts) {
      if (!validDay(row.date) || !D.SHIFT[row.shift]?.start || row.id !== closeoutId(row.date, row.shift) ||
          typeof row.draftText !== 'string' || !Array.isArray(row.closedIds) || !Array.isArray(row.openIds)) throw new Error('A shift closeout is invalid.');
    }
    for (const row of data.entries) {
      if (D.active(row) && row.planLockCategory && (!Object.hasOwn(locks, row.planLockCategory) || !D.timed(row) || !D.eventWindow(row))) {
        throw new Error('A locked time block is missing a valid start and finish.');
      }
    }
  }

  function practice(data) {
    return data.practiceQueue.filter(row => row.status === 'open' && D.byId(data.learningCourses, row.courseId)?.status === 'active')
      .sort((a, b) => D.str(a.createdAt).localeCompare(D.str(b.createdAt)) || D.str(a.id).localeCompare(D.str(b.id)));
  }

  function carryovers(data, day) {
    return data.entries.filter(row => row.type === 'task' && D.open(row) && !row.shiftStickyKey && !row.shiftReminderKey)
      .map(row => {
        const reviewed = row.rolloverReview;
        const moves = D.list(row.history).filter(item => item && (!reviewed || item.at > reviewed.at) &&
          (!at(item.at) || D.parts(at(item.at)).date <= day) && D.list(item.changes).some(change => {
          if (!change) return false;
          const before = D.parseDate(change.before);
          const after = D.parseDate(change.after);
          return /^(planned|plan date)/i.test(change.field) && before && after && after > before;
        })).length;
        const from = reviewed?.date > D.taskDay(row) ? reviewed.date : D.taskDay(row);
        const days = row.status === 'waiting' && (!row.followDate || row.followDate > day) ? 0 : Math.max(0, D.daysBetween(from, day));
        return { row, moves, days };
      }).filter(item => item.moves >= 2 || item.days >= 2).sort((a, b) => b.moves - a.moves || b.days - a.days || D.manualOrder(a.row, b.row));
  }

  function timeReport(data, start = '', end = '') {
    const manual = data.timeLogs.filter(row => periodIncludes(row.date, start, end)).map(row => ({ ...row, source: 'Time log' }));
    const activities = D.list(data.actualActivities).filter(row => row.minutes && periodIncludes(row.date, start, end))
      .map(row => ({ ...row, source: 'Recorded activity' }));
    const tasks = data.entries.filter(row => row.type === 'task' && D.active(row) && validMinutes(row.actualMinutes)).map(row => ({
      id: row.id, date: row.actualDate || row.date, title: row.title, minutes: row.actualMinutes,
      category: row.scope === 'personal' ? 'personal' : 'work', source: 'Task time' }))
      .filter(row => periodIncludes(row.date, start, end));
    const learning = data.learningSessions.filter(row => periodIncludes(row.date, start, end)).map(row => ({
      ...row, title: [D.byId(data.learningCourses, row.courseId)?.title, row.module].filter(Boolean).join(' · '),
      minutes: row.actualMinutes, category: 'learning', source: 'Study session' }));
    const rows = [...manual, ...activities, ...tasks, ...learning].sort((a, b) => b.date.localeCompare(a.date) || a.title.localeCompare(b.title));
    const totals = new Map();
    let minutes = 0;
    for (const row of rows) {
      totals.set(row.category, (totals.get(row.category) || 0) + row.minutes);
      minutes += row.minutes;
    }
    return { rows, totals: [...totals].sort((a, b) => b[1] - a[1]), minutes };
  }

  function timeCsv(report) {
    const cell = value => {
      if (Number.isFinite(value)) return String(value);
      const text = D.str(value);
      return '"' + (/^[\s]*[=+@-]/.test(text) || /^[\t\r\n]/.test(text) ? "'" : '') + text.replaceAll('"', '""') + '"';
    };
    return '\ufeff' + [['Date', 'Category', 'Activity', 'Minutes', 'Source'],
      ...report.rows.map(row => [row.date, categories[row.category], row.title, row.minutes, row.source])]
      .map(row => row.map(cell).join(',')).join('\r\n');
  }

  function weekly(data, start, end, today) {
    const cutoff = end < today ? end : today;
    const completed = data.entries.filter(row => D.active(row) && !D.open(row) && ['task', 'followup', 'mwr'].includes(row.type))
      .map(row => ({ row, stamp: at(row.completedAt), date: row.closedDate || (at(row.completedAt) ? D.parts(at(row.completedAt)).date : '') }))
      .filter(item => periodIncludes(item.date, start, cutoff));
    const onTime = completed.filter(({ row, date, stamp }) => row.dueDate && (date < row.dueDate || date === row.dueDate &&
      (!row.dueTime || stamp && stamp <= D.instant(row.dueDate, row.dueTime))));
    const late = completed.filter(({ row, date, stamp }) => row.dueDate && (date > row.dueDate || date === row.dueDate &&
      row.dueTime && stamp > D.instant(row.dueDate, row.dueTime)));
    const time = timeReport(data, start, end);
    return { completed, onTime, late, carry: cutoff >= start ? carryovers(data, cutoff) : [], time };
  }

  function period(data, start, end) {
    const roster = new Map(data.roster.map(row => [row.date, row]));
    const working = data.roster.filter(row => D.SHIFT[row.shift]?.start).sort((a, b) => a.date.localeCompare(b.date));
    const rest = D.shiftSchedule.restBlocks(data.roster);
    const dayRows = new Map();
    const push = (day, row) => {
      if (!periodIncludes(day, start, end)) return;
      if (!dayRows.has(day)) dayRows.set(day, []);
      dayRows.get(day).push(row);
    };
    const seen = new Set();
    const forecasts = D.workSlots(data, start, end).filter(slot => !slot.manual).map(slot => ({ ...D.workSlotFields(slot),
      type: 'task', status: 'todo', scope: 'work', forecast: true }));
    const repeats = D.fixedOccurrences(data, start, end, true, D.stamp(), true).map(row => ({ ...row, forecast: true }));
    const events = [...D.eventsIn(data, start, end), ...forecasts, ...repeats];
    for (const row of events) {
      if (seen.has(D.str(row.id))) continue;
      seen.add(D.str(row.id));
      if (D.timed(row)) {
        const last = D.calendarEnd(row) < end ? D.calendarEnd(row) : end;
        for (let date = row.date < start ? start : row.date; date <= last; date = D.addDays(date, 1)) {
          push(date, { row, title: row.title, time: date === row.date ? row.time : '', label: row.planLockCategory ? 'Locked' : D.TYPES[row.type] });
        }
      }
      if (!D.dayPlan.tracked(row) || !availableTask(data, row)) continue;
      const deadlines = D.dayPlan.deadlines(row);
      const upcoming = deadlines.find(item => periodIncludes(item.day, start, end));
      if ((!row.shiftStickyKey || row.shiftDateOverride) && periodIncludes(row.date, start, end) &&
          (upcoming?.day !== row.date || row.time && upcoming.time !== row.time)) {
        push(row.date, { row, title: row.title, label: row.forecast ? 'Projected' : D.workflow?.isSticky(row) ? 'Sticky' : 'Planned', time: row.time });
      }
      for (const item of deadlines) {
        const beforeRest = row.scope === 'work' && rest.find(block => item.day >= block.start && item.day <= block.end ||
          block.next.some(duty => duty.date === item.day && item.at <= duty.end));
        const prep = beforeRest && working.findLast(duty => duty.date < beforeRest.start)?.date;
        push(item.day, { row, title: row.title, time: item.time, label: row.forecast ? 'Projected ' + item.label.toLowerCase() : item.label, prep });
      }
    }
    for (const row of data.assignments.filter(row => !row.deletedAt && !row.completedAt)) {
      const marker = (day, label) => push(day, { assignment: row, title: row.title,
        label: row.followDate && row.followDate === day ? label + ' · Follow-up' : label,
        time: row.followDate === day ? row.followTime : '' });
      if (row.assignedDate !== row.endDate) marker(row.assignedDate, 'Assignment starts');
      marker(row.endDate, 'Assignment through date');
      if (row.followDate !== row.endDate && row.followDate !== row.assignedDate) {
        push(row.followDate, { assignment: row, title: row.title, label: 'Assignment follow-up', time: row.followTime });
      }
    }
    for (const row of data.learningCourses.filter(row => row.status === 'active' && row.nextDate)) {
      push(row.nextDate, { course: row, title: row.title, time: row.nextTime, label: 'Study' });
    }
    for (const row of data.planBlocks) {
      if ((roster.get(row.anchorDate)?.shift || '') === row.shift) {
        push(row.date, { adjustment: row, title: row.title, time: row.time, label: 'Adjusted time' });
      }
    }
    const entries = new Map(data.entries.map(row => [D.str(row.id), row]));
    const days = [];
    for (let date = start; date <= end; date = D.addDays(date, 1)) {
      const duty = roster.get(date);
      const shiftRows = D.shiftSchedule.dailySpecs(data, duty).flatMap(spec => {
        const saved = entries.get(spec.id);
        if (saved && (!availableTask(data, saved) || saved.shiftDateOverride)) return [];
        const row = saved || { ...spec, type: 'task', status: 'todo', scope: 'work', forecast: true };
        return [{ row, title: row.title, time: row.time ? row.time + (row.date !== date ? ' next day' : '') : '', label: '' }];
      }).sort((a, b) => a.row.date.localeCompare(b.row.date) || D.str(a.row.time).localeCompare(D.str(b.row.time)));
      days.push({ date, duty, shiftRows, rows: (dayRows.get(date) || []).sort((a, b) =>
        (a.time || '24:00').localeCompare(b.time || '24:00') || a.title.localeCompare(b.title)) });
    }
    return days;
  }

  function closeoutItems(data, date, shift) {
    const window = dutyWindow(data, { date, shift });
    if (!window) return { completed: [], open: [] };
    const entries = data.entries.filter(row => D.active(row) && workItem(row));
    const completed = entries.filter(row => !D.open(row) && (at(row.completedAt) ? at(row.completedAt) >= window.start && at(row.completedAt) <= window.end :
      row.closedDate === date && (!row.shift || row.shift === shift)));
    const open = entries.filter(row => D.open(row) && (row.type !== 'task' ? row.date <= date : D.taskDay(row) <= date))
      .sort((a, b) => Number(b.status === 'waiting') - Number(a.status === 'waiting') || D.manualOrder(a, b));
    return { completed, open };
  }

  function handoverDraft(data, date, shift, completed, open, firstAction, notes) {
    const next = D.nextDutyAfter(data.roster, date, shift);
    const lines = ['CAN Plant shift handover', D.formatDate(date) + ' · ' + shift];
    if (next) lines.push('Next duty · ' + D.formatDate(next.date) + ' · ' + next.shift);
    if (firstAction) lines.push('', 'First action for next duty', firstAction);
    lines.push('', 'Closed this shift', ...completed.map(row => '• ' + row.title));
    if (!completed.length) lines.push('No closures selected.');
    lines.push('', 'Open items');
    for (const row of open) {
      const owner = row.person || D.byId(data.contacts, row.contactId)?.name || 'Owner to confirm';
      const due = row.dueDate ? 'Due ' + D.formatDate(row.dueDate) + (row.dueTime ? ' ' + row.dueTime : '') : 'Due date to confirm';
      const waiting = row.status === 'waiting' && (row.waitingOn || row.person);
      const follow = row.followDate && 'Follow up ' + D.formatDate(row.followDate) + (row.followTime ? ' ' + row.followTime : '');
      const action = row.rolloverReview?.next || row.handover || row.waitingReason || D.list(row.subtasks).find(item => !item.done)?.title;
      lines.push('• ' + [row.title, owner, due, waiting && 'Waiting on ' + waiting, follow].filter(Boolean).join(' · '));
      lines.push('  Next action · ' + (action || 'Confirm the next step.'));
    }
    if (!open.length) lines.push('No open items selected.');
    if (notes) lines.push('', 'Shift notes', notes);
    return lines.join('\n');
  }

  D.planning = { energies, categories, locks, reviewActions, priorities, editableBlocks, blockId, assignmentFor, availableTask,
    minute, validDay, validMinutes, estimate, energy, dutyWindow,
    validate, practice, carryovers, timeReport, timeCsv, weekly, period, closeoutId, closeoutItems, handoverDraft };
  if (typeof module === 'object' && module.exports) module.exports = D.planning;
})(typeof module === 'object' && module.exports ? require('./core.js') : Diary);
