/* Shared rules for the sticky board, people, and shift reminders. */
(function (D) {
  'use strict';

  const people = [
    { name: 'Ahsan Sarfaraz', role: 'dm' },
    { name: 'Usman Ahmed', role: 'um' },
    { name: 'Nadeem Shah', role: 'sh' },
    { name: 'Salman Sarwar', role: 'de' },
    { name: 'Umair Shaukat' }, { name: 'Tanveer Ahmed' }, { name: 'Tanveer Arshad' }, { name: 'Haseeb' }
  ];
  const personKey = name => D.tidy(name).replace(/\s+/g, ' ').toLowerCase();
  const personRole = name => people.find(person => personKey(person.name) === personKey(name))?.role || '';
  const personName = row => D.tidy(row.assignedBy) || people.find(person => person.role && person.role === D.assignmentOf(row))?.name || '';
  const isSticky = row => row?.type === 'task' && (typeof row.stickyCard === 'boolean' ? row.stickyCard :
    !!(row.shiftStickyKey || row.stickyColour || row.stickyPinned === true));
  const stickyKind = row => row.stickyKind || (row.dutyDate || row.shiftStickyDay ? 'shift' : 'day');
  const stickyLabel = row => stickyKind(row) === 'shift' ? 'Shift sticky' : 'Day sticky';
  const openTaskOn = (row, day) => row.type === 'task' && D.open(row) && D.taskDay(row) <= day;

  function taskPlanChange(data, row, date) {
    if (date === row.date) return {};
    if (row.shiftStickyKey || row.shiftReminderKey) return { planNotBefore: true, shiftDateOverride: true, shiftAdvanceAt: '' };
    if (!row.dutyDate) return { planNotBefore: true };
    const duty = data.roster.find(item => item.date === date);
    return { planNotBefore: true, dutyDate: D.SHIFT[duty?.shift]?.start ? date : '', shift: D.SHIFT[duty?.shift]?.start ? duty.shift : '' };
  }

  function assigners(data) {
    const names = new Map(people.map(person => [personKey(person.name), person.name]));
    for (const name of [...D.list(data.settings.assignerNames), ...data.entries.filter(D.active).map(personName),
      ...data.assignments.filter(row => !row.deletedAt).map(row => row.assignedBy)]) {
      const key = personKey(name);
      if (key && !names.has(key)) names.set(key, D.tidy(name));
    }
    return [...names.values()];
  }

  function rosterAlerts(data, local = D.parts(), rest = D.shiftSchedule.restAlerts(data)) {
    const result = new Map(rest.map(item => [String(item.row.id), item]));
    const next = D.dutyAt(data.roster, D.instant(local.date, local.time)).next;
    if (D.shiftFamily(next?.shift) !== 'Night') return result;
    for (const row of data.entries) {
      if (row.type !== 'task' || row.scope !== 'work' || row.shiftStickyKey || !D.open(row) || result.has(String(row.id))) continue;
      const times = [[row.dueDate, row.dueTime], [row.date, row.time]];
      if (times.some(([day, time]) => day === next.date &&
          (D.timePattern.test(time) ? time >= D.SHIFT.Morning.start && time < D.SHIFT[next.shift].start :
            ['Morning', 'Evening'].includes(D.shiftFamily(row.shift))))) {
        result.set(String(row.id), { label: 'Do today', detail: 'This task is in daytime before ' + next.shift + ' duty on ' + D.formatDate(next.date) });
      }
    }
    return result;
  }

  const meals = {
    lunch: { label: 'Lunch In/Out', time: '09:30' },
    dinner: { label: 'Dinner In/Out', time: '15:30' }
  };
  const mealId = (date, meal) => date + ':' + meal;
  function mealPrompt(data, local = D.parts()) {
    const meal = local.time >= meals.dinner.time ? 'dinner' : local.time >= meals.lunch.time ? 'lunch' : '';
    if (!meal) return null;
    const log = D.byId(data.mealLogs, mealId(local.date, meal));
    return log?.dismissedAt || log?.inAt && log?.outAt ? null : { meal, date: local.date, log };
  }

  D.workflow = { isSticky, stickyKind, stickyLabel, openTaskOn, taskPlanChange, personKey, personRole, personName, assigners, rosterAlerts, meals, mealId, mealPrompt };
})(Diary);
