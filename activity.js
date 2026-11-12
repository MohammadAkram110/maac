/* Actual activities and optional planning suggestions from recorded routines. */
(function (D) {
  'use strict';

  const minute = 60000;
  const titleKey = title => D.tidy(title).replace(/\s+/g, ' ').toLocaleLowerCase('en');
  const validDate = value => typeof value === 'string' && !!value && D.parseDate(value) === value;
  const timeNumber = time => Number(time.slice(0, 2)) * 60 + Number(time.slice(3));
  const median = values => {
    const sorted = values.slice().sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
  };

  function activityContext(data, date, time) {
    const duty = D.shiftCompanion.activeDuty(data, D.instant(date, time));
    return { shift: duty?.shift || data.roster.find(row => row.date === date)?.shift || '',
      onDuty: !!duty, nextDay: !!duty && duty.date !== date };
  }

  function validate(data) {
    for (const row of data.actualActivities) {
      if (typeof row.title !== 'string' || !D.tidy(row.title) || row.title.length > 160 ||
          !validDate(row.date) || !D.timePattern.test(row.time) || !Object.hasOwn(D.planning.categories, row.category) ||
          !row.context || typeof row.context.onDuty !== 'boolean' || typeof row.context.nextDay !== 'boolean' ||
          typeof row.context.shift !== 'string' || row.context.shift && !Object.hasOwn(D.SHIFT, row.context.shift) ||
          row.context.onDuty && !D.SHIFT[row.context.shift]?.start || row.context.nextDay && !row.context.onDuty) {
        throw new Error('An activity has an invalid title, time or shift.');
      }
      if (!row.endTime) {
        if (row.endDate || row.minutes != null) throw new Error('An activity has an incomplete finish time.');
        continue;
      }
      if (!validDate(row.endDate) || !D.timePattern.test(row.endTime) || !D.planning.validMinutes(row.minutes) ||
          D.instant(row.endDate, row.endTime) - D.instant(row.date, row.time) !== row.minutes * minute) {
        throw new Error('An activity has an invalid finish time.');
      }
    }
  }

  function suggestions(data, day, plan, now = Date.now()) {
    if (day < D.parts(now).date) return [];
    const F = D.planning;
    const P = D.dayPlan;
    const startDay = D.instant(day);
    const endDay = D.instant(D.addDays(day, 1));
    const current = Math.ceil(now / minute) * minute;
    const rosterShift = data.roster.find(row => row.date === day)?.shift || '';
    const alreadyPlanned = new Set(plan.busy.filter(block => block.kind !== 'personal' && block.start < endDay && block.end > startDay)
      .map(block => titleKey(block.row?.title || block.title)));
    const groups = new Map();
    for (const row of data.actualActivities.slice().sort((a, b) => (b.date + b.time).localeCompare(a.date + a.time))) {
      if (row.date > day || alreadyPlanned.has(titleKey(row.title))) continue;
      const ctx = row.context;
      const key = JSON.stringify([titleKey(row.title), row.category, ctx.shift, ctx.onDuty, ctx.nextDay]);
      if (!groups.has(key)) groups.set(key, new Map());
      const group = groups.get(key);
      if (!group.has(row.date)) group.set(row.date, row);
    }
    const result = [];
    for (const group of groups.values()) {
      const rows = [...group.values()];
      if (rows.length < 2) continue;
      const first = rows[0];
      const ctx = first.context;
      const duty = ctx.onDuty && plan.busy.find(block => block.kind === 'duty' && block.shift === ctx.shift &&
        block.start < endDay && block.end > startDay && (day > block.date) === ctx.nextDay);
      if (ctx.onDuty ? !duty : ctx.shift !== rosterShift) continue;
      const timed = rows.filter(row => row.minutes).map(row => row.minutes);
      const minutes = timed.length ? median(timed) : null;
      const usual = startDay + median(rows.map(row => timeNumber(row.time))) * minute;
      const length = (minutes || 1) * minute;
      const earliest = Math.max(startDay, current, duty?.start || 0);
      const latest = Math.min(endDay, duty?.end ?? endDay);
      const busy = plan.busy.filter(block => block !== duty && block.kind !== 'personal' && block.kind !== 'priority' &&
        (block.kind !== 'study' || block.booked));
      const choices = P.freeWindows(earliest, latest, busy).filter(gap => gap.end - gap.start >= length)
        .map(gap => Math.max(gap.start, Math.min(usual, gap.end - length)));
      choices.sort((a, b) => Math.abs(a - usual) - Math.abs(b - usual) || a - b);
      const time = choices[0];
      result.push({ id: first.id, title: first.title, minutes, usual, time, samples: rows.length,
        end: time !== undefined && minutes ? time + length : null,
        category: ctx.onDuty ? 'work' : Object.hasOwn(F.locks, first.category) ? first.category : 'personal' });
    }
    return result.sort((a, b) => a.usual - b.usual || a.title.localeCompare(b.title));
  }

  D.activity = { activityContext, suggestions, validate };

  D.createActivityTools = function (ui) {
    const { state, current, now, E, btn, empty, input, select, dateInput, timeInput, readDate, readTime, formValue,
      openDialog, commit, ask } = ui;
    const F = D.planning;
    const short = (label, action, fields = {}) => btn(label, action, fields, { cls: 'small' });
    const categoryLabel = row => F.categories[row.category];

    function edit({ id, date: dateArg } = {}) {
      const row = id && D.byId(current().actualActivities, id);
      if (id && !row) throw new Error('This activity is no longer available.');
      const local = now();
      const date = D.parseDate(dateArg) || state.date || local.date;
      const start = row?.time || (date === local.date ? local.time : '');
      const category = row?.category || (date === local.date && activityContext(current(), date, start).onDuty ? 'work' : 'personal');
      const fields = input('title', 'What did you do?', row?.title, { wide: true, placeholder: 'e.g. Check pump readings', extra: ' maxlength="160" data-initial-focus' }) +
        dateInput('date', 'Date', row?.date || (date <= local.date ? date : local.date)) +
        timeInput('time', 'Time', start) + timeInput('endTime', 'Finish time (optional)', row?.endTime) +
        select('category', 'Category', F.categories, category);
      openDialog('activity-form', row ? 'Edit activity' : 'Log activity', '<form id="activity-form" class="form-grid" novalidate>' +
        fields + '</form>', (row ? btn('Delete activity', 'activity-remove', { id: row.id }, { cls: 'danger' }) : '') +
        btn('Cancel', 'close-dialog') + '<button class="primary" type="submit" form="activity-form">Save activity</button>', { row });
    }

    async function save(form, previous) {
      const values = new FormData(form);
      const title = D.tidy(values.get('title'));
      const date = readDate(values, 'date', 'the activity date', true);
      const time = readTime(values, 'time', 'the activity time', true);
      const endTime = readTime(values, 'endTime', 'the finish time');
      const category = formValue(values, 'category');
      const endDate = endTime ? (endTime < time ? D.addDays(date, 1) : date) : '';
      const startsAt = D.instant(date, time);
      const endsAt = endTime ? D.instant(endDate, endTime) : startsAt;
      if (!title || title.length > 160 || !Object.hasOwn(F.categories, category)) throw new Error('Enter an activity and choose a category.');
      if (startsAt > Date.now() || endsAt > Date.now() || endTime && endsAt <= startsAt) {
        throw new Error('Enter an activity that has already happened, with a finish time after its start.');
      }
      await commit(data => {
        const row = previous && D.byId(data.actualActivities, previous.id);
        if (previous && (!row || row.editToken !== previous.editToken)) throw new Error('This activity changed. Open it again to review it.');
        const sameStart = row && row.date === date && row.time === time;
        const fields = { title, date, time, endTime, endDate, category, minutes: endTime ? (endsAt - startsAt) / minute : null,
          context: sameStart ? row.context : activityContext(data, date, time), updatedAt: D.stamp(), editToken: D.uid() };
        if (row) Object.assign(row, fields);
        else data.actualActivities.push({ id: D.uid(), ...fields });
      }, 'Activity recorded.');
    }

    function remove({ id }) {
      ask('Delete this activity?', 'It will be removed from the day and its routine suggestions.', 'Delete activity',
        () => commit(data => { data.actualActivities = data.actualActivities.filter(row => !D.same(row.id, id)); }, 'Activity deleted.'));
    }

    function section(plan) {
      const day = plan.days[0].date;
      const rows = current().actualActivities.filter(row => row.date === day).sort((a, b) => a.time.localeCompare(b.time));
      const hints = suggestions(current(), day, plan);
      const actual = rows.length ? '<details class="day-secondary" data-keep-open="day-activity"><summary>Recorded activity <span>' + rows.length + '</span></summary>' +
        rows.map(row => '<div class="day-activity-row"><time>' + E(row.time + (row.endTime ? '–' + row.endTime + (row.endDate > row.date ? ' next day' : '') : '')) +
          '</time><div><strong>' + E(row.title) + '</strong><small>' + E(categoryLabel(row)) + '</small></div>' +
          short('Edit', 'activity-edit', { id: row.id }) + '</div>').join('') + '</details>' : '';
      const routine = hints.length ? '<details class="day-secondary" data-keep-open="day-routine"><summary>Routine suggestions <span>' + hints.length + '</span></summary>' +
        hints.map(row => {
          const usual = D.parts(row.usual).time;
          const time = row.time !== undefined ? D.parts(row.time).time : '';
          const detail = [row.samples + ' similar days', row.minutes && D.minutesText(row.minutes),
            time ? (time === usual ? 'Usually ' + usual : 'Usually ' + usual + ' · Free at ' + time) : 'No free window today'].filter(Boolean).join(' · ');
          const finish = row.end && D.parts(row.end);
          const action = time ? short('Use in plan', 'plan-lock', { date: day, title: row.title, time, category: row.category,
            'end-time': finish?.time || '', 'end-date': finish?.date || '' }) : '';
          return '<div class="day-activity-row routine-suggestion"><div><strong>' + E(row.title) + '</strong><small>' + E(detail) +
            '</small></div>' + action + '</div>';
        }).join('') + '</details>' : '';
      return actual + routine;
    }

    return { section, forms: { 'activity-form': save }, actions: { 'activity-edit': edit, 'activity-remove': remove } };
  };

  if (typeof module === 'object' && module.exports) module.exports = D.activity;
})(typeof module === 'object' && module.exports ? require('./core.js') : Diary);
