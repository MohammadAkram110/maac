/* Open records from the earlier schema-7 web edition in the current diary. */
(function (D) {
  'use strict';
  const version = 7;
  const palettes = { forest: 'green', ocean: 'blue', sand: 'amber', plum: 'plum', slate: 'slate' };
  const roles = { dm: 'dm', um: 'um', section: 'sh', engineer: 'de', hse: 'hse', psm: 'psm' };
  const colours = { honey: 'yellow', sky: 'sky', lavender: 'lilac', mint: 'mint' };
  const zikrSlots = { any: 'anytime', morning: 'morning', evening: 'evening', after: 'anytime', night: 'anytime' };
  const references = { muslim: 'Sahih Muslim 2692', dawud: 'Sunan Abi Dawud 5082', bukhari: 'Sahih al-Bukhari 5361' };

  function routine(plan, day, lastNight) {
    const start = plan.start || day;
    const night = plan.frequency === 'night';
    const once = plan.frequency === 'once';
    const endDate = once ? start : plan.until || '';
    const weekday = D.daysBetween(D.weekStart(start), start);
    const firstFortnightly = plan.frequency === 'fortnightly' ?
      D.addDays(start, (plan.weekday - weekday + 7) % 7) : start;
    const startDate = endDate && firstFortnightly > endDate ? start : firstFortnightly;
    // The Night rule now looks at consecutive duties. Retain the last already booked week.
    const nextNightWeek = night && lastNight ? D.addDays(D.weekStart(lastNight), 7) : '';
    const row = {
      id: plan.id, title: plan.title, heading: plan.heading, body: plan.notes,
      cadence: night ? 'night-weekly' : once ? 'daily' : plan.frequency,
      startDate, effectiveFrom: [plan.effective || start, nextNightWeek].sort().at(-1), endDate,
      weekday: plan.weekday, monthDay: Number(start.slice(-2)), time: plan.time || '', endTime: plan.endTime || '',
      shift: night ? 'Night' : plan.shift || '', night: plan.night === 2 ? 'second' : 'first',
      assignment: roles[plan.source] || '', enabled: plan.enabled, updatedAt: plan.updatedAt
    };
    try {
      return D.validateWorkRule(row);
    } catch {
      // Keep a rule editable when its previous time falls outside the selected duty.
      const previous = [plan.frequency, plan.shift, plan.time, plan.endTime].filter(Boolean).join(' · ');
      return { ...row, cadence: 'manual', shift: '', time: '', endTime: '',
        body: [row.body, 'Previous schedule · ' + previous].filter(Boolean).join('\n\n') };
    }
  }

  function zikr(item, archived = false) {
    return {
      id: item.id, title: item.title, arabic: item.text,
      meaning: ({ after: 'After namaz', night: 'Before sleep' })[item.session] || '',
      target: item.target, when: zikrSlots[item.session], required: item.required,
      archived, reference: references[item.reference] || ''
    };
  }

  function migrateFaith(data, previous, at) {
    const templates = D.list(previous.zikrTemplates);
    const items = new Map((templates.length ? templates.map(item => zikr(item, !!item.deletedAt)) : data.zikrItems)
      .map(item => [item.id, item]));
    for (const day of D.list(previous.worshipDays)) {
      const date = day.date;
      const times = Object.fromEntries(Object.keys(D.PRAYERS).map(key => [key, day.times[key] || '']));
      const schedule = { id: date, date, times, source: day.source };
      const values = Object.values(times);
      const full = values.every((time, i) => D.timePattern.test(time) && (i === 0 || values[i - 1] < time));
      if (full) data.namazTimes.push(schedule);
      const notes = [day.journal];
      const partial = full ? [] : Object.entries(times).filter(([, time]) => time)
        .map(([key, time]) => D.PRAYERS[key] + ' ' + time);
      if (day.times.jumuah) partial.push('Jumu’ah ' + day.times.jumuah);
      if (partial.length) notes.push([day.source, partial.join(' · ')].filter(Boolean).join('\n'));
      const body = notes.filter(Boolean).join('\n\n');
      if (body) data.faithNotes.push({ id: date, date, body });
      for (const [prayer, prayed] of Object.entries(day.prayed)) {
        if (prayed) data.namazLog.push({ id: date + ':' + prayer, date, prayer, at });
      }
      for (const item of D.list(day.zikr)) {
        if (!items.has(item.id)) items.set(item.id, zikr(item, true));
        if (!item.count) continue;
        const slot = zikrSlots[item.session];
        data.zikrLog.push({ id: D.zikrLogId(date, slot, item.id), date, slot, itemId: item.id,
          title: item.title, count: item.count, target: item.target, at });
      }
    }
    data.zikrItems = [...items.values()];
  }

  function upgrade(previous) {
    if (previous?.app !== D.APP || previous.schemaVersion !== version) return previous;
    const at = Number.isFinite(Date.parse(previous.savedAt)) ? previous.savedAt : D.stamp();
    // Keep the previous timetable, zikr history and schedule fields in JSON backups.
    const data = { ...D.empty(), ...previous, schemaVersion: D.SCHEMA,
      settings: { ...previous.settings, palette: palettes[previous.settings.palette] || 'green' } };
    const lastWorkDate = new Map();
    for (const row of previous.entries) {
      const id = String(row.workPlanId);
      if (row.workDate && row.workDate > (lastWorkDate.get(id) || '')) lastWorkDate.set(id, row.workDate);
    }
    const day = D.parts(at).date;
    data.workRules = D.list(previous.workPlans).map(plan => routine(plan, day, lastWorkDate.get(String(plan.id))));
    data.entries = previous.entries.map(row => ({
      ...row,
      ...(row.sticky ? { stickyCard: true, stickyPinned: row.status !== 'done', stickyColour: colours[row.sticky] } : {}),
      ...(row.assignmentSource ? { assignment: roles[row.assignmentSource] || '' } : {}),
      ...(row.workHeading ? { routineHeading: row.workHeading } : {}),
      ...(row.workPlanId && row.workDate ? { routineId: row.workPlanId, routineDate: row.workDate } : {})
    }));
    migrateFaith(data, previous, at);
    return data;
  }

  D.browserLegacy = { version, upgrade };
})(Diary);
