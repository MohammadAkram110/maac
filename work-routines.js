/* Scheduled work creates regular tasks and keeps each occurrence editable. */
(function (D) {
  'use strict';
  const ASSIGNERS = {
    dm: 'Department Manager', um: 'Unit Manager', sh: 'Section Head', de: 'Day Engineer',
    hse: 'HSE Coordinator / HSE Task', psm: 'PSM Coordinator / PSM Task',
    operators: 'Operators', routine: 'Routine', other: 'Other'
  };
  const CADENCES = {
    daily: 'Daily', weekly: 'Weekly', fortnightly: 'Fortnightly', monthly: 'Monthly',
    quarterly: 'Every three months', 'night-weekly': 'Weekly on Night duty', manual: 'On demand'
  };
  const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  const NIGHT_OPTIONS = { choose: 'Choose either night', first: 'First night', second: 'Second night' };
  const PRESETS = {
    dlevel: { heading: 'Weekly', title: 'D Level Weekly', cadence: 'weekly', weekday: 1, time: '07:30', endTime: '09:00', assignment: 'routine' },
    emergency: { heading: 'Weekly', title: 'Weekly emergency talk', cadence: 'night-weekly', night: 'choose', shift: 'Night', assignment: 'routine' },
    apprentice: { heading: 'Monthly', title: 'Apprentice monthly report', cadence: 'monthly', assignment: 'routine' },
    audit: { heading: 'Audits', title: '', cadence: 'monthly', monthDay: 20, assignment: 'routine' },
    jcc: { heading: 'Job Cycle Check', title: '', cadence: 'quarterly', assignment: 'routine' },
    scba: { heading: 'Weekly', title: 'SCBA Donning and Doffing', cadence: 'weekly', assignment: 'routine' },
    simis: { heading: 'SIMIS', title: 'Check the SIMIS work queue', cadence: 'manual', assignment: 'routine' },
    ecm: { heading: 'ECM', title: 'Check the ECM work queue', cadence: 'manual', assignment: 'routine' },
    safety: { heading: 'Safety checklist audit', title: 'Review Sunday safety checklist and follow up recommendations',
      cadence: 'weekly', weekday: 6, shift: 'Morning', assignment: 'operators' }
  };

  function assignmentOf(row) {
    if (row.assignment !== undefined) return row.assignment;
    return ({ DM: 'dm', UM: 'um', 'Section Head': 'sh', 'Day Engineer': 'de',
      'Helper/Operator': 'operators', Routine: 'routine' })[row.role] || '';
  }

  const canonicalDate = date => typeof date === 'string' && D.parseDate(date) === date && !!date;
  const time = value => value === '' || typeof value === 'string' && D.timePattern.test(value);
  const hasWeekday = cadence => cadence === 'weekly' || cadence === 'fortnightly';
  const hasMonthDay = cadence => cadence === 'monthly' || cadence === 'quarterly';
  const auditTemplates = ['monthly-audit-1', 'monthly-audit-2', 'monthly-audit-3'];
  const isAuditTemplate = rule => auditTemplates.includes(rule.id);

  function installAuditRoutines(data, at) {
    const today = D.parts(at).date;
    let added = 0;
    for (const [index, id] of auditTemplates.entries()) {
      const title = 'Audit ' + (index + 1);
      if (data.workRules.some(row => row.id === id || D.tidy(row.title).toLowerCase() === title.toLowerCase())) continue;
      data.workRules.push({ ...PRESETS.audit, id, title, body: '', startDate: today, effectiveFrom: today,
        endDate: '', time: '', endTime: '', shift: '', night: 'choose', enabled: true, updatedAt: at });
      added++;
    }
    return added;
  }

  function validateWorkRule(rule) {
    if (!D.tidy(rule.heading) || typeof rule.heading !== 'string' || !D.tidy(rule.title) || typeof rule.title !== 'string' ||
        typeof rule.body !== 'string' || !Object.hasOwn(CADENCES, rule.cadence) || typeof rule.enabled !== 'boolean' ||
        !canonicalDate(rule.startDate) || !canonicalDate(rule.effectiveFrom) ||
        (rule.endDate !== '' && (!canonicalDate(rule.endDate) || rule.endDate < rule.startDate)) ||
        (rule.shift !== '' && !D.SHIFT[rule.shift]?.start) ||
        (rule.assignment !== '' && !Object.hasOwn(ASSIGNERS, rule.assignment)) ||
        !time(rule.time) || !time(rule.endTime) || (rule.endTime && (!rule.time || rule.endTime === rule.time)) ||
        (rule.time && rule.endTime && rule.endTime < rule.time && !D.overnight(rule.shift)) ||
        (hasWeekday(rule.cadence) && (!Number.isInteger(rule.weekday) || rule.weekday < 0 || rule.weekday > 6)) ||
        (hasMonthDay(rule.cadence) && (!Number.isInteger(rule.monthDay) || rule.monthDay < 1 || rule.monthDay > 31)) ||
        (rule.cadence === 'night-weekly' && (!Object.hasOwn(NIGHT_OPTIONS, rule.night) || rule.shift !== 'Night'))) {
      throw new Error('Enter a work heading, task title, valid dates and the schedule day required for this repeat.');
    }
    if (rule.shift && rule.time) {
      const date = rule.startDate;
      const slot = { rule, date, shift: rule.shift };
      const window = plannedTime(slot);
      const duty = D.dutyWindow({ date, shift: rule.shift });
      if (D.instant(window.date, rule.time) < duty.start || D.instant(window.date, rule.time) >= duty.end ||
          D.instant(window.dueDate, window.dueTime) > duty.end) {
        throw new Error('Choose a time block within the selected shift.');
      }
    }
    return rule;
  }

  function cadenceMatches(rule, date) {
    const week = D.weekStart(date);
    const weekday = D.daysBetween(week, date);
    const months = (Number(date.slice(0, 4)) - Number(rule.startDate.slice(0, 4))) * 12 +
      Number(date.slice(5, 7)) - Number(rule.startDate.slice(5, 7));
    if (rule.cadence === 'daily') return true;
    if (rule.cadence === 'weekly') return weekday === rule.weekday;
    if (rule.cadence === 'fortnightly') return weekday === rule.weekday &&
      D.daysBetween(D.weekStart(rule.startDate), week) % 14 === 0;
    if (rule.cadence === 'quarterly' && months % 3 !== 0) return false;
    return hasMonthDay(rule.cadence) && Number(date.slice(-2)) === Math.min(rule.monthDay, Number(D.monthRange(date)[1].slice(-2)));
  }

  function nightNumber(roster, date) {
    const night = day => D.shiftFamily(roster.get(day)) === 'Night';
    if (!night(date)) return 0;
    if (!night(D.addDays(date, -1))) return 1;
    return !night(D.addDays(date, -2)) ? 2 : 0;
  }

  function period(rule, date) {
    if (hasMonthDay(rule.cadence)) return date.slice(0, 7);
    if (hasWeekday(rule.cadence) || rule.cadence === 'night-weekly') return D.weekStart(date);
    return date;
  }

  function workSlots(data, start, end) {
    const roster = new Map(data.roster.map(row => [row.date, row.shift]));
    const ids = new Set(data.entries.map(row => String(row.id)));
    const usedDates = new Set(data.entries.filter(row => row.routineId).map(row =>
      row.routineId + ':' + (row.routineDate || row.dutyDate || row.originalDate || row.date)));
    const slots = [];
    for (const rule of data.workRules.filter(row => row.enabled && row.cadence !== 'manual')) {
      const flexibleAudit = isAuditTemplate(rule) && rule.cadence === 'monthly' && !rule.time && !rule.shift;
      const first = [flexibleAudit ? D.monthRange(start)[0] : start, rule.startDate, rule.effectiveFrom].sort().at(-1);
      const last = rule.endDate && rule.endDate < end ? rule.endDate : end;
      for (let date = first; date <= last; date = flexibleAudit ? D.addMonths(D.monthRange(date)[0], 1) : D.addDays(date, 1)) {
        const assigned = roster.get(date);
        if (rule.shift && assigned !== rule.shift && D.shiftFamily(assigned) !== rule.shift) continue;
        const shift = rule.shift ? assigned : '';
        const number = rule.cadence === 'night-weekly' ? nightNumber(roster, date) : 0;
        const manual = rule.cadence === 'night-weekly' && rule.night === 'choose';
        let auditDue;
        if (flexibleAudit) {
          const monthEnd = D.monthRange(date)[1];
          auditDue = date.slice(0, 8) + String(Math.min(rule.monthDay, Number(monthEnd.slice(-2)))).padStart(2, '0');
          if (auditDue < date || auditDue < start || rule.endDate && auditDue > rule.endDate) continue;
        } else if (rule.cadence === 'night-weekly') {
          if (!number || (!manual && (rule.night === 'first' ? number !== 1 : number !== 2))) continue;
        } else if (!cadenceMatches(rule, date)) continue;
        const id = 'routine:' + rule.id + ':' + period(rule, date);
        if (!ids.has(id) && !usedDates.has(rule.id + ':' + date)) slots.push({ id, rule, date, shift, manual, number, auditDue });
      }
    }
    return slots.sort((a, b) => a.date.localeCompare(b.date) || a.rule.time.localeCompare(b.rule.time));
  }

  function plannedTime({ rule, date, shift }) {
    const startDate = D.dutyTimeDate(date, shift, rule.time);
    let dueDate = startDate;
    let dueTime = rule.endTime || rule.time;
    if (rule.endTime && rule.endTime < rule.time) dueDate = D.addDays(startDate, 1);
    if (!dueTime && shift) {
      dueTime = D.SHIFT[shift].end;
      if (D.overnight(shift)) dueDate = D.addDays(date, 1);
    }
    return { date: startDate, dueDate, dueTime,
      planMinutes: rule.endTime ? (D.instant(dueDate, dueTime) - D.instant(startDate, rule.time)) / 60000 : null };
  }

  function nextPosition(data) {
    return data.entries.reduce((high, row) => row.type === 'task' ? Math.max(high, row.position || 0) : high, 0) + 1;
  }

  function workTask(data, fields, at = D.stamp(), position = nextPosition(data)) {
    const row = { id: D.uid(), type: 'task', scope: 'work', status: 'todo', priority: 'normal', position,
      body: '', date: D.parts(at).date, time: '', dueDate: '', dueTime: '', shift: '', dutyDate: '',
      assignment: '', routineHeading: '', createdAt: at, updatedAt: at, editToken: D.uid(), attachments: [],
      links: [], tags: [], subtasks: [], history: [{ at, action: 'Created' }], ...fields };
    row.originalDate = row.date;
    row.originalDueDate = row.dueDate;
    data.entries.push(row);
    return row;
  }

  function workSlotFields(slot) {
    const { rule, shift, date } = slot;
    const schedule = slot.auditDue ? { date, dueDate: slot.auditDue, dueTime: '', planMinutes: 30, planFlexible: true } : plannedTime(slot);
    return { id: slot.id, title: rule.title, body: rule.body, noteStyles: rule.noteStyles, ...schedule, time: rule.time,
      shift, dutyDate: shift ? date : '', assignment: rule.assignment, routineHeading: rule.heading,
      routineId: rule.id, routineDate: date };
  }

  function addWorkSlot(data, slot, at = D.stamp(), position = nextPosition(data)) {
    if (D.byId(data.entries, slot.id)) return false;
    return workTask(data, { ...workSlotFields(slot), history: [{ at, action: 'Created from work routine', reason: slot.rule.heading }] }, at, position);
  }

  function generateWork(data, at = D.stamp()) {
    const installed = installAuditRoutines(data, at);
    if (!data.workRules.some(row => row.enabled)) return installed;
    const date = D.parts(at).date;
    const due = workSlots(data, D.addDays(date, -30), date);
    const ids = new Set();
    let position = nextPosition(data);
    for (const slot of due) {
      if (slot.manual || ids.has(slot.id)) continue;
      addWorkSlot(data, slot, at, position++);
      ids.add(slot.id);
    }
    return installed + ids.size;
  }

  Object.assign(D, { ASSIGNERS, CADENCES, WEEKDAYS, NIGHT_OPTIONS, PRESETS, assignmentOf, validateWorkRule,
    hasWeekday, hasMonthDay, isAuditTemplate, workSlots, workSlotFields, workTask, addWorkSlot, generateWork });
})(typeof module === 'object' && module.exports ? require('./core.js') : Diary);
