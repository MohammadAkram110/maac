/* Controls for shift interruptions, preparation, and roster-cycle planning. */
(function (D) {
  'use strict';

  D.createShiftCompanionUI = function (ui) {
    const { state, current, now, E, btn, chip, empty, panel, select, input, textarea, check, dateInput, timeInput,
      readDate, readTime, formValue, openDialog, closeDialog, commit, render, navigate, viewEntry, ask } = ui;
    const C = D.shiftCompanion;
    const F = D.planning;
    const R = D.rosterSupport;
    const date = D.formatDate;
    const short = (label, action, fields = {}, opts = {}) => btn(label, action, fields, { cls: 'small', ...opts });
    const open = (row, label = row.title) => btn(label, 'entry-view', { id: row.id }, { cls: 'row-title' });
    const when = (day, time) => day ? date(day) + (time ? ' · ' + time : '') : '';
    const stamp = value => D.formatStamp(value);
    const period = window => window ? D.parts(window.start).time + '–' + D.parts(window.end).time +
      (D.parts(window.start).date !== D.parts(window.end).date ? ' next day' : '') : '—';
    const windowLabel = window => date(D.parts(window.start).date) + ' · ' + period(window);
    const task = (id, data = current()) => D.byId(data.entries, id);
    const openTasks = (data = current()) => data.entries.filter(row => C.tracked(row) && F.availableTask(data, row));
    const titleList = rows => Object.fromEntries(rows.map(row => [D.str(row.id), row.title]));
    const selections = (rows, name, selected = []) => rows.map(row => '<label class="check"><input type="checkbox" name="' +
      name + '" value="' + E(row.id) + '"' + (selected.some(id => D.same(id, row.id)) ? ' checked' : '') + '><span>' +
      E(row.title) + '</span></label>').join('');
    const fieldset = (label, content) => '<fieldset class="wide"><legend>' + E(label) + '</legend><div class="link-picker">' + content + '</div></fieldset>';
    const text = (value, cls = 'muted') => value ? '<p class="' + cls + '">' + E(value) + '</p>' : '';
    const lines = (values, separator = ' · ') => values.filter(Boolean).join(separator);
    const number = (values, key, label, min, max, optional = false) => {
      const raw = D.tidy(values.get(key));
      if (!raw && optional) return null;
      const value = Number(raw);
      if (!raw || !Number.isInteger(value) || value < min || value > max) throw new Error(label + ' must be from ' + min + ' to ' + max + ' minutes.');
      return value;
    };
    let cycleRange;

    function form(id, title, fields, label, row = null, intro = '', tools = '') {
      openDialog(id, title, intro + '<form id="' + id + '" class="form-grid" novalidate>' + fields + '</form>',
        tools + btn('Cancel', 'close-dialog') + '<button class="primary" type="submit" form="' + id + '">' + E(label) + '</button>', { row });
    }

    function touch(row, at = D.stamp()) {
      Object.assign(row, { updatedAt: at, editToken: D.uid() });
    }

    function pauseEdit({ id } = {}) {
      const data = current();
      const openPauses = C.activePauses(data);
      if (id && openPauses.some(row => D.same(row.taskId, id))) return pauseList();
      const available = openTasks(data).filter(row => !openPauses.some(item => D.same(item.taskId, row.id)));
      const at = Date.now();
      const currentFixed = !id && D.dayPlan.build(data, now().date, {}, at).busy.find(block =>
        block.kind === 'booked' && block.row && block.start <= at && at < block.end &&
        available.some(row => D.same(row.id, block.row.id)));
      const chosen = id || currentFixed?.row.id || '';
      const duty = C.activeDuty(data, at);
      form('companion-pause-form', 'Pause & capture',
        select('taskId', 'Pause a task or capture a note', { '': 'Quick note only', ...titleList(available) }, chosen) +
        input('note', 'What interrupted you?', '', { wide: true, extra: ' maxlength="500" data-initial-focus' }) +
        input('restart', 'Start here when you return', '', { wide: true, extra: ' maxlength="500"' }) +
        input('remaining', 'Minutes remaining', '', { type: 'number', extra: ' min="1" max="1440"' }),
        'Save capture', null, text(duty && date(duty.date) + ' · ' + duty.shift + ' duty'),
        data.shiftPauses.length ? btn('View captures', 'companion-pauses') : '');
    }

    async function savePause(element) {
      const values = new FormData(element);
      const taskId = formValue(values, 'taskId');
      const note = D.tidy(values.get('note'));
      const restart = D.tidy(values.get('restart'));
      const remaining = number(values, 'remaining', 'Remaining time', 1, 1440, true);
      if (!note && !taskId) throw new Error('Enter a note or choose the work you paused.');
      if (note.length > 500 || restart.length > 500) throw new Error('Keep the note and restart point to 500 characters each.');
      await commit(data => {
        const entry = taskId && task(taskId, data);
        if (taskId && (!C.tracked(entry) || !F.availableTask(data, entry) || C.activePauses(data).some(row => D.same(row.taskId, taskId)))) {
          throw new Error('This task has changed or already has a saved restart point.');
        }
        const at = D.stamp();
        const duty = C.activeDuty(data, Date.parse(at));
        data.shiftPauses.push({ id: D.uid(), taskId, note, restart, remaining, at,
          dutyDate: duty?.date || '', shift: duty?.shift || '', resumedAt: taskId ? '' : at });
      }, taskId ? 'Restart point saved.' : 'Quick note saved.');
    }

    function pauseList() {
      const data = current();
      const active = C.activePauses(data);
      const earlier = data.shiftPauses.filter(row => !active.includes(row)).slice().reverse();
      const content = row => {
        const linked = task(row.taskId);
        return '<div><strong>' + E(linked?.title || row.note || 'Quick note') + '</strong><small>' +
          E(lines([stamp(row.at), row.shift && row.shift + ' · ' + date(row.dutyDate), row.remaining && D.minutesText(row.remaining) + ' left'])) +
          '</small>' + text(linked && row.note) + text(row.restart && 'Restart at ' + row.restart) + '</div>';
      };
      openDialog('companion-pauses', 'Paused work & captures',
        (active.map(row => '<article class="plan-review-row">' + content(row) +
          short('Resume task', 'companion-resume', { id: row.id }) + '</article>').join('') || empty('No paused tasks.')) +
        (earlier.length ? '<details class="section-actions"><summary>Capture history (' + earlier.length + ')</summary>' +
          earlier.map(row => '<article class="plan-review-row">' + content(row) + '</article>').join('') + '</details>' : ''),
        btn('Pause & capture', 'companion-pause', {}, { cls: 'primary' }));
    }

    async function resume({ id }) {
      const taskId = await commit(data => {
        const row = C.activePauses(data).find(item => D.same(item.id, id));
        if (!row) throw new Error('This restart point is no longer active.');
        const at = D.stamp();
        row.resumedAt = at;
        const entry = task(row.taskId, data);
        if (entry && F.availableTask(data, entry)) {
          if (row.remaining != null) entry.planRemaining = row.remaining;
          touch(entry, at);
          entry.history = [...D.list(entry.history), { at, action: 'Resumed work', note: row.restart }];
        }
        return row.taskId;
      }, 'Work resumed.');
      if (task(taskId)) viewEntry(taskId);
      else closeDialog(true);
    }

    function lastSlot({ id }) {
      const row = task(id);
      const result = R.lastWorkableSlot(current(), row);
      if (result.state === 'unavailable') throw new Error('This work item is no longer open.');
      const limit = result.limit;
      const cutoff = limit ? text(limit.label + ' · ' + when(limit.day, limit.time)) : '';
      const found = result.state === 'fit';
      const body = found ? text(windowLabel(result) + ' · ' + (result.duty ? result.duty.shift + ' duty' : 'Personal time')) +
        text(D.minutesText(result.minutes) + ' needed') : result.state === 'blocked' ?
        text(lines(result.reasons.map(item => item.title))) : result.state === 'needs-limit' ?
        text('Set a due or follow-up date, or enter upcoming Rest or Leave for work.') :
        text('No open window fits ' + D.minutesText(result.minutes) + ' before this cutoff.');
      openDialog('companion-last-slot', 'Last workable slot', text(row.title) + cutoff + body,
        btn('Close', 'close-dialog') + (found ? btn('Plan this slot', 'companion-book-last', { id, start: result.start, end: result.end }, { cls: 'primary' }) :
          btn(result.state === 'blocked' ? 'Review readiness' : 'Adjust task', result.state === 'blocked' ? 'companion-readiness' : 'plan-adjust-task', { id })));
    }

    async function bookLast({ id, start, end }) {
      await commit(data => {
        const row = task(id, data);
        const at = D.stamp();
        const result = R.lastWorkableSlot(data, row, Date.parse(at));
        if (result.state !== 'fit' || result.start !== Number(start) || result.end !== Number(end)) {
          throw new Error('Availability changed. Open Last workable slot again to review the latest plan.');
        }
        const from = when(row.date, row.time);
        const local = D.parts(result.start);
        const binding = row.type === 'task' ? D.workflow.taskPlanChange(data, row, local.date) : {};
        row.originalDate ||= row.date;
        row.originalDueDate ||= row.dueDate || '';
        Object.assign(row, binding, { date: local.date, time: local.time, planFlexible: false, planNotBefore: true,
          shift: result.duty?.shift || '', dutyDate: result.duty?.date || '',
          lastSlotBooking: { date: local.date, time: local.time, onDuty: !!result.duty,
            earliest: result.earliest, allowEarly: result.allowEarly } });
        if (row.planRemaining == null) row.planMinutes = result.minutes;
        if (row.shiftScheduleKey) row.planOccurrenceOverride = true;
        row.history = [...D.list(row.history), { at, action: 'Booked last workable slot', from, to: when(local.date, local.time) }];
        touch(row, at);
      }, 'Last workable slot booked.');
      closeDialog(true);
    }

    function lastSlotAlerts(plan) {
      const data = current();
      const at = Date.now();
      const through = plan.days.at(-1).date;
      const rows = data.entries.filter(row => row.lastSlotBooking && row.date <= through && R.bookingChanged(data, row, plan, at));
      if (!rows.length) return '';
      return panel('Last-slot bookings to review', rows.map(row => {
        const result = R.lastWorkableSlot(data, row, at, plan);
        const detail = result.state === 'fit' ? 'Next option · ' + windowLabel(result) : result.state === 'no-slot' ?
          'No workable slot before ' + date(result.limit.day) : 'Review the current deadline or readiness';
        return '<article class="plan-review-row"><div>' + open(row) + '<small>' + E(detail) + '</small></div>' +
          short('Last workable slot', 'companion-last-slot', { id: row.id }) + '</article>';
      }).join(''));
    }

    function acceptanceRows(transfer) {
      return transfer.itemIds.map(id => {
        const row = task(id);
        const accepted = R.acceptance(transfer, id);
        const detail = accepted ? 'Accepted by ' + accepted.by + ' · ' + stamp(accepted.at) : 'Awaiting acceptance';
        return '<article class="plan-review-row"><div>' + (row && !row.deletedAt ? open(row) : '<strong>' + E(row?.title || 'Unavailable item') + '</strong>') +
          '<small>' + E(detail) + '</small></div>' + (row && !row.deletedAt ? short(accepted ? 'Edit acceptance' : 'Record acceptance',
            'companion-accept', { id: transfer.id, item: id }) : '') + '</article>';
      }).join('');
    }

    function acceptanceEdit({ id, item }) {
      const transfer = D.byId(current().handovers, id);
      const row = task(item);
      if (!transfer || transfer.deletedAt || !transfer.itemIds.some(key => D.same(key, item)) || !row || row.deletedAt) {
        throw new Error('This handover item is no longer available.');
      }
      const saved = R.acceptance(transfer, item);
      const local = saved ? D.parts(Date.parse(saved.at)) : now();
      form('companion-accept-form', 'Record handover acceptance',
        input('by', 'Accepted by', saved?.by, { wide: true, extra: ' maxlength="120" data-initial-focus' }) +
        dateInput('date', 'Date accepted', local.date) + timeInput('time', 'Time accepted', local.time),
        'Save acceptance', { id, item, token: saved?.token || '', previousAt: saved?.at || '' },
        text(row.title + ' · To ' + date(transfer.toDate) + ' ' + transfer.toShift),
        saved ? btn('Clear acceptance', 'companion-clear-accept', { id, item, token: saved.token || '', 'previous-at': saved.at }) : '');
    }

    function updateAcceptance(data, previous, fields) {
      const transfer = D.byId(data.handovers, previous.id);
      const saved = R.acceptance(transfer, previous.item);
      if (!transfer || transfer.deletedAt || !transfer.itemIds.some(id => D.same(id, previous.item)) ||
          (saved?.token || '') !== previous.token || (saved?.at || '') !== previous.previousAt) {
        throw new Error('This handover item changed. Open it again to review it.');
      }
      transfer.acceptances = D.list(transfer.acceptances).filter(row => !D.same(row.itemId, previous.item));
      if (fields) transfer.acceptances.push({ itemId: previous.item, ...fields, token: D.uid() });
    }

    async function saveAcceptance(element, previous) {
      const values = new FormData(element);
      const by = D.tidy(values.get('by'));
      const day = readDate(values, 'date', 'the date accepted', true);
      const time = readTime(values, 'time', 'the time accepted', true);
      if (!by || by.length > 120) throw new Error('Enter who accepted the item.');
      const when = D.instant(day, time);
      if (when > Date.now()) throw new Error('Choose a date and time up to now.');
      await commit(data => updateAcceptance(data, previous, { by, at: new Date(when).toISOString() }), 'Handover acceptance recorded.');
    }

    function briefPanel(day, shift) {
      const data = current();
      const duty = { date: day, shift };
      const result = C.briefing(data, duty);
      if (!result) return '';
      const awaiting = R.pendingAcceptance(data, duty).length;
      const deferred = R.heldForDuty(data, duty).length;
      const detail = lines([result.updates.length + ' updates', result.deadlines.length + ' deadlines changed',
        result.checks.length + ' still to check', awaiting && awaiting + ' awaiting acceptance', deferred && deferred + ' deferred reminders']);
      return panel('Since my last duty', text(detail) + text(result.closeout?.firstAction && 'First action · ' + result.closeout.firstAction),
        short('Open briefing', 'companion-brief', { date: day, shift }),
        result.previous ? result.previous.shift + ' · ' + date(result.previous.date) : '');
    }

    function briefing({ date: day, shift }) {
      const data = current();
      const duty = { date: day, shift };
      const result = C.briefing(data, duty);
      if (!result) throw new Error('Choose a working duty to view its briefing.');
      const updates = result.updates.map(row => {
        const linked = task(row.entryId);
        return '<article class="plan-review-row"><div>' + (linked && D.active(linked) ? open(linked, row.title) : '<strong>' + E(row.title) + '</strong>') +
          '<small>' + E(stamp(row.at)) + '</small>' + text(row.text, 'companion-note') + '</div></article>';
      }).join('');
      const changes = result.deadlines.map(item => '<article class="plan-review-row"><div>' + open(item.row) + '<small>' +
        E(lines(item.changes.map(change => change.field + ' ' + (change.before || '—') + ' → ' + (change.after || '—')))) +
        '</small></div></article>').join('');
      const checks = result.checks.map(row => '<article class="plan-review-row"><div>' + open(row) +
        '<small>' + E(lines([C.waitingPerson(row) && 'Waiting on ' + C.waitingPerson(row), row.followDate && 'Check ' + when(row.followDate, row.followTime),
          row.dueDate && 'Due ' + when(row.dueDate, row.dueTime)])) + '</small></div></article>').join('');
      const awaiting = R.pendingAcceptance(data, duty).map(({ row, transfer }) => '<article class="plan-review-row"><div>' + open(row) +
        '<small>' + E('Handed to ' + date(transfer.toDate) + ' ' + transfer.toShift) + '</small></div>' +
        short('Record acceptance', 'companion-accept', { id: transfer.id, item: row.id }) + '</article>').join('');
      const held = R.heldForDuty(data, duty).map(({ row, label }) => '<article class="plan-review-row"><div>' + open(row) +
        '<small>' + E(label) + '</small></div></article>').join('');
      openDialog('companion-brief', 'Since my last duty',
        text(date(day) + ' · ' + shift + ' · Reviewing updates since ' + stamp(new Date(result.since).toISOString())) +
        (result.closeout?.firstAction ? panel('First action from closeout', text(result.closeout.firstAction)) : '') +
        panel('Recorded updates', updates || empty('Add an incoming handover or update.')) +
        panel('Deadlines changed', changes || empty('No deadline changes recorded in this window.')) +
        panel('Still to check', checks || empty('No open items linked to this handover.')) +
        (awaiting ? panel('Awaiting handover acceptance', awaiting) : '') + (held ? panel('Deferred work reminders', held) : ''),
        btn('Add incoming update', 'companion-brief-add', { date: day, shift }, { cls: 'primary' }));
    }

    function briefEdit({ date: day, shift }) {
      form('companion-brief-form', 'Add incoming update',
        input('source', 'From or source', '', { wide: true, extra: ' maxlength="120"' }) +
        textarea('text', 'Paste a handover or write an update', '', '') +
        select('taskId', 'Link work item (optional)', { '': 'None', ...titleList(openTasks().filter(row => row.scope === 'work')) }, ''),
        'Save update', { date: day, shift }, text(date(day) + ' · ' + shift));
    }

    async function saveBrief(element, duty) {
      const values = new FormData(element);
      const source = D.tidy(values.get('source'));
      const body = formValue(values, 'text').trim();
      const taskId = formValue(values, 'taskId');
      if (!body || body.length > 12000 || source.length > 120) throw new Error('Enter an update of up to 12,000 characters.');
      await commit(data => {
        if (!data.roster.some(row => row.date === duty.date && row.shift === duty.shift && D.SHIFT[row.shift]?.start)) {
          throw new Error('Save this duty to the roster before adding the update.');
        }
        const linked = taskId && task(taskId, data);
        if (taskId && (!C.tracked(linked) || !D.active(linked) || linked.scope !== 'work')) throw new Error('The linked work is no longer available.');
        data.briefNotes.push({ id: D.uid(), dutyDate: duty.date, shift: duty.shift, source, text: body, taskId, at: D.stamp() });
      }, 'Incoming update saved.');
      briefing(duty);
    }

    function peoplePage() {
      const groups = C.personGroups(current());
      return panel('Follow-ups by person', groups.map(group => {
        const rows = group.rows.map(row => {
          const last = group.conversations.find(item => item.itemIds.some(id => D.same(id, row.id)));
          const promise = group.conversations.find(item => item.promiseDate && item.itemIds.some(id => D.same(id, row.id)));
          const promised = promise && 'Reply promised ' + when(promise.promiseDate, promise.promiseTime);
          return '<article class="plan-review-row"><div>' + open(row) + '<small>' + E(lines([last && 'Last conversation ' + stamp(last.at),
            promised, row.followDate && 'My next check ' + when(row.followDate, row.followTime), row.dueDate && 'Due ' + when(row.dueDate, row.dueTime)])) +
            '</small></div></article>';
        }).join('');
        const logs = group.conversations.map(item => '<article class="plan-review-row"><div><strong>' + E(stamp(item.at)) + '</strong>' +
          '<small>' + E(lines([item.promiseDate && 'Reply promised ' + when(item.promiseDate, item.promiseTime),
            item.checkDate && 'My next check ' + when(item.checkDate, item.checkTime)])) + '</small>' + text(item.note, 'companion-note') +
          '<div class="actions">' + item.itemIds.map(id => task(id)).filter(row => row && D.active(row)).map(row => open(row)).join('') +
          '</div></div></article>').join('');
        return '<details class="companion-group"' + (group.rows.length ? ' open' : '') + '><summary>' + E(group.person) +
          chip(group.rows.length + ' open') + '</summary>' + rows +
          short('Log conversation', 'companion-contact', { person: group.person }) +
          (logs ? '<details class="section-actions"><summary>Conversation history (' + group.conversations.length + ')</summary>' + logs + '</details>' : '') +
          '</details>';
      }).join('') || empty('Set Waiting on for an open task to see it here.'), short('Log conversation', 'companion-contact'));
    }

    function conversation({ person = '', id } = {}) {
      const linked = task(id);
      const who = person || (linked && C.waitingPerson(linked)) || '';
      const group = C.personGroups(current()).find(row => row.key === C.personKey(who));
      const eligible = group?.rows || (linked && D.open(linked) ? [linked] : []);
      const next = current().roster.filter(row => row.date >= now().date && D.SHIFT[row.shift]?.start)
        .sort((a, b) => a.date.localeCompare(b.date)).slice(0, 3).map(row => when(row.date, '') + ' ' + row.shift);
      form('companion-contact-form', 'Log conversation',
        input('person', 'Person', who, { wide: true, extra: ' maxlength="120" data-initial-focus' }) +
        (eligible.length ? fieldset('Related open items', selections(eligible, 'itemId', id ? [id] : [])) +
          '<div class="wide">' + check('waiting', 'Mark selected work waiting for a reply', false) + '</div>' : '') +
        textarea('note', 'What was discussed?', '', '') +
        dateInput('promiseDate', 'Their promised reply date', '') + timeInput('promiseTime', 'Their promised reply time', '') +
        dateInput('checkDate', 'My next check date', '') + timeInput('checkTime', 'My next check time', ''),
        'Save conversation', null, text(next.length && 'Upcoming duties · ' + next.join(' · ')));
    }

    async function saveConversation(element) {
      const values = new FormData(element);
      const person = D.tidy(values.get('person'));
      const note = formValue(values, 'note').trim();
      const promiseDate = readDate(values, 'promiseDate', 'the promised reply date');
      const promiseTime = readTime(values, 'promiseTime', 'the promised reply time');
      const checkDate = readDate(values, 'checkDate', 'your next check date');
      const checkTime = readTime(values, 'checkTime', 'your next check time');
      const itemIds = [...new Set(values.getAll('itemId'))];
      if (!person || person.length > 120 || note.length > 4000 || !note && !promiseDate && !checkDate) {
        throw new Error('Enter a person and a discussion note, promised date, or next check date.');
      }
      if (promiseTime && !promiseDate || checkTime && !checkDate) throw new Error('Choose a date for each time you enter.');
      await commit(data => {
        const selected = itemIds.map(id => task(id, data));
        if (selected.some(row => !C.tracked(row) || !F.availableTask(data, row) ||
          C.waitingPerson(row) && C.personKey(C.waitingPerson(row)) !== C.personKey(person))) {
          throw new Error('A selected item has changed or is waiting on a different person.');
        }
        const at = D.stamp();
        data.followConversations.push({ id: D.uid(), person, note, promiseDate, promiseTime, checkDate, checkTime, itemIds, at });
        for (const row of selected) {
          row.waitingOn ||= person;
          if (values.has('waiting')) D.setTaskStatus(row, 'waiting', at);
          if (checkDate) {
            const changes = [{ field: 'Follow-up date', before: row.followDate || '', after: checkDate },
              { field: 'Follow-up time', before: row.followTime || '', after: checkTime }];
            Object.assign(row, { followDate: checkDate, followTime: checkTime });
            row.history = [...D.list(row.history), { at, action: 'Follow-up conversation', changes }];
          }
          touch(row, at);
        }
      }, 'Conversation saved.');
    }

    function readiness({ id }) {
      const row = task(id);
      if (!C.tracked(row) || !F.availableTask(current(), row)) throw new Error('This work item is no longer open.');
      const selected = D.list(row.planPrerequisites);
      const rows = current().entries.filter(item => C.tracked(item) && !D.same(item.id, id) &&
        (D.open(item) || selected.some(key => D.same(key, item.id))));
      const missing = selected.filter(key => !rows.some(item => D.same(item.id, key)))
        .map(key => ({ id: key, title: 'Unavailable prerequisite · ' + key }));
      form('companion-readiness-form', 'Readiness & remaining time',
        input('blocker', 'What needs to happen first? Clear this when confirmed.', row.planBlocker, { wide: true, extra: ' maxlength="500" data-initial-focus' }) +
        input('remaining', 'Minutes still needed', row.planRemaining ?? '', { type: 'number', extra: ' min="1" max="1440"' }) +
        '<details class="wide"' + (selected.length ? ' open' : '') + '><summary>Task prerequisites (' + selected.length + ')</summary>' +
        fieldset('Each selected task must be complete', selections([...rows, ...missing], 'prerequisite', selected) ||
          empty('Create or link an open step to use it as a prerequisite.')) + '</details>',
        'Save and replan', row, text(row.title), btn('Add a ready step', 'companion-step', { id }));
    }

    async function saveReadiness(element, previous) {
      const values = new FormData(element);
      const blocker = D.tidy(values.get('blocker'));
      const remaining = number(values, 'remaining', 'Remaining time', 1, 1440, true);
      const prerequisites = [...new Set(values.getAll('prerequisite'))];
      if (blocker.length > 500) throw new Error('Keep the blocker to 500 characters.');
      await commit(data => {
        const row = task(previous.id, data);
        if (!C.tracked(row) || !F.availableTask(data, row) || row.editToken !== previous.editToken) throw new Error('This work item changed.');
        if (prerequisites.some(id => !C.tracked(task(id, data)) && !D.list(row.planPrerequisites).some(old => D.same(old, id))) ||
          C.cyclic(data.entries, row.id, prerequisites)) throw new Error('Choose available prerequisites that do not depend on this task.');
        Object.assign(row, { planBlocker: blocker, planRemaining: remaining, planPrerequisites: prerequisites });
        touch(row);
      }, 'Readiness saved and plan updated.');
    }

    function stepEdit({ id }) {
      const row = task(id);
      if (!C.tracked(row) || !F.availableTask(current(), row)) throw new Error('This work item is no longer open.');
      form('companion-step-form', 'Add a ready step', input('title', 'Step you can do now', '', { wide: true, extra: ' maxlength="500" data-initial-focus' }) +
        dateInput('date', 'Available from', state.date) + input('minutes', 'Estimated minutes', 15, { type: 'number', extra: ' min="1" max="1440"' }) +
        '<div class="wide">' + check('required', 'Complete this step before planning the parent task', true) + '</div>',
        'Add step', row, text(row.title));
    }

    async function saveStep(element, previous) {
      const values = new FormData(element);
      const title = D.tidy(values.get('title'));
      const day = readDate(values, 'date', 'the date the step is available', true);
      const minutes = number(values, 'minutes', 'Step estimate', 1, 1440);
      if (!title || title.length > 500) throw new Error('Enter a step name of up to 500 characters.');
      await commit(data => {
        const parent = task(previous.id, data);
        if (!C.tracked(parent) || !F.availableTask(data, parent) || parent.editToken !== previous.editToken) throw new Error('This work item changed.');
        const at = D.stamp();
        const step = D.workTask(data, { title, date: day, planMinutes: minutes, planFlexible: true, planParentId: parent.id,
          portfolioId: parent.portfolioId || '', scope: parent.scope, personalTime: parent.personalTime === true,
          dueDate: parent.dueDate || '', dueTime: parent.dueDate ? parent.dueTime || '' : '', priority: parent.priority || 'normal' }, at);
        if (values.has('required')) parent.planPrerequisites = [...D.list(parent.planPrerequisites), step.id];
        touch(parent, at);
      }, 'Ready step added to the plan.');
    }

    function readinessPanel(row) {
      const reasons = C.blockers(current(), row);
      const pause = C.activePauses(current()).find(item => D.same(item.taskId, row.id));
      const parent = !D.workflow.isSticky(row) && task(row.planParentId);
      const children = current().entries.filter(item => D.same(item.planParentId, row.id) && D.active(item) && !D.workflow.isSticky(item));
      if (!reasons.length && !pause && !row.planRemaining && !parent && !children.length) return '';
      return '<section class="companion-detail"><h3>Readiness</h3>' + (reasons.length ? text('Waiting for ' + lines(reasons.map(item => item.title))) : '') +
        (pause ? text(pause.restart ? 'Paused · restart at ' + pause.restart : 'Paused') + short('Resume task', 'companion-resume', { id: pause.id }) : '') +
        (row.planRemaining ? text(D.minutesText(row.planRemaining) + ' remaining') : '') +
        (parent && D.active(parent) ? '<div>Parent work · ' + open(parent) + '</div>' : '') +
        children.map(item => '<div class="pills">' + open(item) + chip(D.open(item) ? 'Open step' : 'Complete') + '</div>').join('') + '</section>';
    }

    function blockedPanel(plan) {
      if (!plan.blocked?.length) return '';
      return panel('Waiting for prerequisites', plan.blocked.map(({ row, reasons }) =>
        '<article class="plan-review-row"><div>' + open(row) + '<small>' + E(lines(reasons.map(item => item.title))) + '</small></div>' +
        short('Review readiness', 'companion-readiness', { id: row.id }) + '</article>').join(''));
    }

    function swapEdit({ date: day = state.date } = {}) {
      const row = current().roster.find(item => item.date === day);
      const shifts = { '': 'Clear duty', ...Object.fromEntries(Object.keys(D.SHIFT).map(key => [key, key])) };
      form('companion-swap-form', 'Preview a roster change',
        dateInput('date', 'Duty date', day) + select('shift', 'Proposed shift', shifts, row?.shift) +
        dateInput('otherDate', 'Swap with this roster date (optional)', '') +
        input('reason', 'Reason (optional)', '', { wide: true, extra: ' maxlength="200"' }),
        'Compare next duties', null, text('For a two-date swap, the diary uses the saved duties on both dates.'));
    }

    function swapPreview(element) {
      const values = new FormData(element);
      const data = current();
      const day = readDate(values, 'date', 'the duty date', true);
      const other = readDate(values, 'otherDate', 'the second duty date');
      const shift = formValue(values, 'shift');
      if (other === day) throw new Error('Choose two different dates to swap.');
      const roster = new Map(data.roster.map(row => [row.date, row]));
      if (other && (!roster.has(day) || !roster.has(other))) throw new Error('Enter both roster dates before swapping.');
      if (!other && (shift && !Object.hasOwn(D.SHIFT, shift) || (roster.get(day)?.shift || '') === shift)) {
        throw new Error('Choose a different shift to compare.');
      }
      const changes = other ? { [day]: roster.get(other).shift, [other]: roster.get(day).shift } : { [day]: shift };
      const result = C.rosterPreview(data, changes);
      const summary = text(when(result.first, '') + ' – ' + when(result.end, '') + ' · ' + result.count + ' proposed working duties in view');
      const rows = result.rows.map(row => {
        const updates = row.updates.map(item => {
          const related = task(item.entryId);
          const diff = item.before && item.after ? period(item.before) + ' → ' + period(item.after) :
            item.after ? 'Added at ' + period(item.after) : 'Leaves the proposed plan';
          return '<li>' + (related && D.active(related) ? open(related, item.title) : '<strong>' + E(item.title) + '</strong>') +
            ' <small>' + E(diff) + '</small></li>';
        }).join('');
        return '<tr><th scope="row">' + E(date(row.day)) + '</th><td>' + E(lines([row.before?.shift || 'Unrostered', row.beforeWindow && period(row.beforeWindow)])) +
          '</td><td>' + E(lines([row.after?.shift || 'Unrostered', row.afterWindow && period(row.afterWindow)])) +
          '</td><td>' + (updates || row.warnings.length || row.prepare.length ? '<ul>' + updates +
            row.warnings.map(warning => '<li class="warn">' + E(warning) + '</li>').join('') +
            row.prepare.map(item => '<li>Prepare before Rest or Leave · ' + open(item) + '</li>').join('') + '</ul>' : '—') + '</td></tr>';
      }).join('');
      openDialog('companion-swap-preview', 'Roster change preview', summary +
        '<div class="companion-table"><table><thead><tr><th>Date</th><th>Saved</th><th>Proposed</th><th>Effects</th></tr></thead><tbody>' +
        rows + '</tbody></table></div>', btn('Back', 'companion-swap', { date: day }) + btn('Apply roster change', 'companion-apply-swap', {}, { cls: 'primary' }),
        { row: { day, other, shift, rev: data.rev, reason: D.tidy(values.get('reason')) } });
    }

    async function applySwap(preview) {
      if (!preview) throw new Error('Open a roster preview first.');
      await commit(data => {
        if (preview.rev !== data.rev) throw new Error('The diary changed. Open a fresh roster preview before applying it.');
        const at = D.stamp();
        if (preview.other) D.swapDuty(data, preview.day, preview.other, preview.reason, at);
        else {
          const row = data.roster.find(item => item.date === preview.day);
          D.updateDuty(data, preview.day, preview.shift, row?.group || '', row?.note || '', preview.reason || 'Roster preview', at);
        }
        D.syncShiftStickies(data, [preview.day, preview.other].filter(Boolean), at);
      }, 'Roster change applied and plan updated.');
      closeDialog(true);
    }

    function faithEdit() {
      const prefs = current().settings.planFaith || { prayers: [], minutes: 10, offset: 0, zikrAfter: '', zikrMinutes: 5 };
      form('companion-faith-form', 'Namaz & zikr in Day Plan',
        fieldset('Reserve these prayer windows', Object.entries(D.PRAYERS).map(([key, title]) =>
          check('faith-' + key, title, prefs.prayers.includes(key))).join('')) +
        input('minutes', 'Minutes per prayer window', prefs.minutes, { type: 'number', extra: ' min="1" max="120"' }) +
        input('offset', 'Start offset from timetable (minutes)', prefs.offset, { type: 'number', extra: ' min="-120" max="120"' }) +
        select('zikrAfter', 'Add a zikr block after', { '': 'None', ...D.PRAYERS }, prefs.zikrAfter) +
        input('zikrMinutes', 'Extra zikr minutes', prefs.zikrMinutes, { type: 'number', extra: ' min="0" max="120"' }), 'Save preferences',
        null, text('Choose which windows to reserve from your saved mosque timetable. Negative offsets start before the entered time.'));
    }

    async function saveFaith(element) {
      const values = new FormData(element);
      const prayers = Object.keys(D.PRAYERS).filter(key => values.has('faith-' + key));
      const after = formValue(values, 'zikrAfter');
      const prefs = { prayers, minutes: number(values, 'minutes', 'Prayer window', 1, 120),
        offset: number(values, 'offset', 'Start offset', -120, 120), zikrAfter: prayers.includes(after) ? after : '',
        zikrMinutes: number(values, 'zikrMinutes', 'Zikr time', 0, 120) };
      await commit(data => { data.settings.planFaith = prefs; }, 'Prayer windows updated in Day Plan.');
    }

    function personalEdit({ id } = {}) {
      const row = id && D.byId(current().personalWindows, id);
      if (id && (!row || row.completedAt)) throw new Error('This personal plan is no longer open.');
      const day = state.date < now().date ? now().date : state.date;
      form('companion-personal-form', row ? 'Edit personal window' : 'Add a personal window',
        input('title', 'Commitment', row?.title, { wide: true, extra: ' maxlength="160" data-initial-focus' }) +
        select('category', 'Category', { family: 'Family', personal: 'Personal', appointment: 'Appointment' }, row?.category || 'family') +
        input('minutes', 'Minutes needed', row?.minutes ?? 45, { type: 'number', extra: ' min="1" max="1440"' }) +
        dateInput('from', 'First possible date', row?.from || day) + dateInput('through', 'Last possible date', row?.through || D.addDays(day, 1)) +
        timeInput('startTime', 'Earliest start', row?.startTime || '17:00') + timeInput('endTime', 'Latest finish', row?.endTime || '22:00'),
        'Find a time', row || null);
    }

    async function savePersonal(element, previous) {
      const values = new FormData(element);
      const title = D.tidy(values.get('title'));
      const category = formValue(values, 'category');
      const from = readDate(values, 'from', 'the first possible date', true);
      const through = readDate(values, 'through', 'the last possible date', true);
      const startTime = readTime(values, 'startTime', 'the earliest start', true);
      const endTime = readTime(values, 'endTime', 'the latest finish', true);
      const minutes = number(values, 'minutes', 'Commitment duration', 1, 1440);
      if (!title || title.length > 160 || !['family', 'personal', 'appointment'].includes(category) || through < from ||
        D.instant(from, endTime) - D.instant(from, startTime) < minutes * 60000) {
        throw new Error('Enter a name, a valid date range, and daily hours long enough for the commitment.');
      }
      await commit(data => {
        const row = previous && D.byId(data.personalWindows, previous.id);
        if (previous && (!row || row.completedAt || row.editToken !== previous.editToken)) throw new Error('This personal window changed.');
        const fields = { title, category, from, through, startTime, endTime, minutes };
        if (row) {
          Object.assign(row, fields);
          touch(row);
          const entry = task(row.entryId, data);
          if (entry && D.active(entry)) { Object.assign(entry, { title, planLockCategory: category }); touch(entry); }
        }
        else data.personalWindows.push({ id: D.uid(), ...fields, at: D.stamp(), editToken: D.uid() });
      }, 'Personal window saved.');
    }

    function personalOffer(row, result, another = false) {
      if (result.state === 'offer') return text('Available · ' + windowLabel(result.window)) +
        (result.booked ? text('Current booking · ' + when(result.booked.date, result.booked.time)) : '') +
        short(result.booked ? 'Move booking here' : 'Book this time', 'companion-book', {
          id: row.id, start: result.window.start, end: result.window.end, another: another ? 'yes' : ''
        }, { cls: 'small primary' });
      if (result.state === 'booked') return text('Booked · ' + windowLabel(result.window)) +
        short('Find a later time', 'companion-another', { id: row.id });
      return text({ expired: 'The date range has passed.', 'no-slot': 'No open slot in these dates and hours.', done: 'Completed' }[result.state]);
    }

    function personalPage() {
      const data = current();
      const rows = data.personalWindows.slice().sort((a, b) => Number(!!a.completedAt) - Number(!!b.completedAt) || a.through.localeCompare(b.through));
      return panel('Personal windows', rows.map(row => {
        const result = C.findPersonalSlot(data, row);
        return '<article class="companion-card"><div><h3>' + E(row.title) + '</h3><p class="muted">' +
          E(lines([date(row.from) + ' – ' + date(row.through), row.startTime + '–' + row.endTime, D.minutesText(row.minutes)])) +
          '</p></div><div>' + personalOffer(row, result) + '</div>' +
          (row.completedAt ? '' : '<div class="actions">' + short('Edit', 'companion-personal', { id: row.id }) +
            (result.booked ? short('Mark done', 'companion-personal-done', { id: row.id }) : '') +
            short('Remove', 'companion-personal-remove', { id: row.id }) + '</div>') + '</article>';
      }).join('') || empty('Add a commitment you can fit on more than one date.'),
      short('Add personal window', 'companion-personal', {}, { cls: 'small primary' }));
    }

    function personalAlerts(plan) {
      const data = current();
      const days = new Set(plan.days.map(row => row.date));
      const rows = data.personalWindows.filter(row => !row.completedAt && days.has(task(row.entryId, data)?.date)).flatMap(row => {
        const result = C.findPersonalSlot(data, row, Date.now(), false, plan);
        if (result.state === 'booked' || !result.booked || !['offer', 'no-slot'].includes(result.state)) return [];
        return ['<article class="plan-review-row"><div><strong>' + E(row.title) + '</strong>' +
          text('Current booking · ' + when(result.booked.date, result.booked.time)) + '</div><div>' +
          (result.state === 'offer' ? text('Next opening · ' + windowLabel(result.window)) + short('Move booking here', 'companion-book',
            { id: row.id, start: result.window.start, end: result.window.end }) : text('No opening in your selected dates and hours.')) +
          '</div></article>'];
      });
      return rows.length ? panel('Personal bookings to review', rows.join(''),
        short('Open Personal windows', 'navigate', { view: 'dayplan', sub: 'personal' })) : '';
    }

    function anotherTime({ id }) {
      const row = D.byId(current().personalWindows, id);
      if (!row || row.completedAt) throw new Error('This personal window is no longer open.');
      openDialog('companion-personal-alternative', 'Find a later time', text(row.title) +
        personalOffer(row, C.findPersonalSlot(current(), row, Date.now(), true), true), btn('Close', 'close-dialog'));
    }

    async function book({ id, start, end, another }) {
      await commit(data => {
        const row = D.byId(data.personalWindows, id);
        if (!row || row.completedAt) throw new Error('This personal window is no longer open.');
        const offer = C.findPersonalSlot(data, row, Date.now(), another === 'yes');
        if (offer.state !== 'offer' || offer.window.start !== Number(start) || offer.window.end !== Number(end)) {
          throw new Error('Availability changed. Reopen Personal windows to see the next available time.');
        }
        const begins = D.parts(offer.window.start);
        const finishes = D.parts(offer.window.end);
        const entry = offer.booked && D.active(offer.booked) ? offer.booked : { id: D.uid(), type: 'event', scope: 'personal', createdAt: D.stamp() };
        Object.assign(entry, { title: row.title, date: begins.date, time: begins.time, endDate: finishes.date, endTime: finishes.time,
          planLockCategory: row.category, body: 'Booked from Personal windows.' });
        if (!D.byId(data.entries, entry.id)) data.entries.push(entry);
        touch(entry);
        row.entryId = entry.id;
        touch(row);
      }, 'Personal time booked and plan updated.');
      closeDialog(true);
    }

    function removePersonal({ id }) {
      ask('Remove this personal window?', 'Its linked diary booking will go to Deleted items.', 'Remove', async () => {
        await commit(data => {
          const row = D.byId(data.personalWindows, id);
          if (!row || row.completedAt) throw new Error('This personal window changed.');
          const entry = task(row.entryId, data);
          if (entry && D.active(entry)) { entry.deletedAt = D.stamp(); touch(entry); }
          data.personalWindows = data.personalWindows.filter(item => !D.same(item.id, id));
        }, 'Personal window removed.');
      });
    }

    function learningEdit({ session: sessionId }) {
      const data = current();
      const session = D.byId(data.learningSessions, sessionId);
      if (!session) throw new Error('This learning session is no longer available.');
      const samples = data.entries.filter(row => D.active(row) && D.list(row.attachments).length);
      form('companion-learning-form', 'Link a takeaway to work or a personal task',
        select('taskId', 'Use on this task', { '': 'Choose a task', ...titleList(openTasks(data)) }, '') +
        textarea('takeaway', 'What to try', session.takeaway || '', '') +
        textarea('sample', 'Example or short instructions (optional)', '', '') +
        select('sampleId', 'Diary entry with a sample file (optional)', { '': 'None', ...titleList(samples) }, ''),
        'Link takeaway', session);
    }

    async function saveLearning(element, session) {
      const values = new FormData(element);
      const taskId = formValue(values, 'taskId');
      const sampleId = formValue(values, 'sampleId');
      const takeaway = formValue(values, 'takeaway').trim();
      const sample = formValue(values, 'sample').trim();
      if (!takeaway || takeaway.length > 2000 || sample.length > 4000) throw new Error('Enter a takeaway of up to 2,000 characters.');
      await commit(data => {
        const row = task(taskId, data);
        if (!C.tracked(row) || !F.availableTask(data, row) || !D.byId(data.learningSessions, session.id)) throw new Error('Choose an open work or personal task.');
        if (sampleId && (!task(sampleId, data) || !D.active(task(sampleId, data)))) throw new Error('The sample entry is no longer available.');
        if (data.learningLinks.some(item => D.same(item.taskId, taskId) && D.same(item.sessionId, session.id))) throw new Error('This takeaway is already linked to that task.');
        data.learningLinks.push({ id: D.uid(), taskId, courseId: session.courseId, sessionId: session.id,
          takeaway, sample, sampleId, status: 'ready', at: D.stamp() });
      }, 'Takeaway linked to the task.');
    }

    async function learningResult({ id, status }) {
      const taskId = await commit(data => {
        const link = D.byId(data.learningLinks, id);
        if (!link || !['used', 'practice'].includes(status)) throw new Error('The linked takeaway is no longer available.');
        if (status === 'practice') {
          const course = D.byId(data.learningCourses, link.courseId);
          if (!course) throw new Error('The course is no longer available.');
          const existing = data.practiceQueue.find(row => D.same(row.learningLinkId, id));
          const at = D.stamp();
          if (existing) { Object.assign(existing, { status: 'open', completedAt: '' }); touch(existing, at); }
          else data.practiceQueue.push({ id: D.uid(), title: link.takeaway.slice(0, 300), courseId: course.id,
            sessionId: link.sessionId, learningLinkId: link.id, minutes: Math.min(25, course.plannedMinutes), status: 'open',
            createdAt: at, updatedAt: at, editToken: D.uid() });
        }
        link.status = status;
        touch(link);
        return link.taskId;
      }, status === 'used' ? 'Skill application recorded.' : 'Takeaway added to the practice queue.');
      if (task(taskId)) viewEntry(taskId);
    }

    function learningDetails(row) {
      const linked = current().learningLinks.filter(item => D.same(item.taskId, row.id));
      return linked.length ? '<section class="companion-detail"><h3>Try a saved technique</h3>' + linked.map(item => {
        const sample = task(item.sampleId);
        const course = D.byId(current().learningCourses, item.courseId);
        return '<article class="companion-card">' + text(item.takeaway, 'companion-note') + text(item.sample, 'companion-note') +
          '<div class="pills">' + chip(course?.title) + chip({ ready: 'Ready to try', used: 'Used', practice: 'Queued for practice' }[item.status]) +
          '</div><div class="actions">' + (sample && D.active(sample) ? open(sample, 'Open sample') : '') +
          (item.status === 'used' ? '' : short('Used it', 'companion-learning-result', { id: item.id, status: 'used' })) +
          short('Practise again', 'companion-learning-result', { id: item.id, status: 'practice' }) + '</div></article>';
      }).join('') + '</section>' : '';
    }

    function courseApplications(course) {
      const links = current().learningLinks.filter(item => D.same(item.courseId, course.id));
      return links.length ? '<details class="section-actions"><summary>Applied learning (' + links.filter(item => item.status === 'used').length +
        ' used · ' + links.length + ' linked)</summary>' + links.map(item => {
          const row = task(item.taskId);
          return '<article class="plan-review-row"><div>' + (row && D.active(row) ? open(row) : E(item.takeaway)) +
            '<small>' + E({ ready: 'Ready to try', used: 'Used', practice: 'Queued for practice' }[item.status]) + '</small></div></article>';
        }).join('') + '</details>' : '';
    }

    const afterLog = (day, shift) => current().timeLogs.find(item => item.sourceType === 'cycle-after' && item.sourceId === C.afterKey(day, shift));
    function actualAfterButton(day, shift, actualDay) {
      if (actualDay > now().date || !D.SHIFT[shift]?.start) return '';
      const existing = afterLog(day, shift);
      return short(existing ? 'Edit actual time' : 'Log actual time', 'plan-time-log', { id: existing?.id, kind: 'cycle-after',
        source: C.afterKey(day, shift), title: shift + ' travel, meal & changing', category: 'meal', date: actualDay });
    }

    function baselineButton(day, preview = false) {
      const saved = D.byId(current().planBaselines, day);
      return saved ? chip('Baseline saved') : preview ? '' : short('Save plan baseline', 'companion-baseline', { date: day });
    }

    function report() {
      const data = current();
      const result = C.cycleReview(data, cycleRange?.through || state.date, cycleRange?.from);
      const prefs = D.dayPlan.preferences(data.settings);
      const samples = result.groups.map(group => {
        const allowance = prefs.afterByShift[group.shift] ?? prefs.after;
        return '<article class="plan-review-row"><div><strong>' + E(group.shift) + '</strong><small>' +
          E(lines([group.count + ' logged ' + (group.count === 1 ? 'duty' : 'duties'), 'Planned median ' + D.minutesText(group.planned),
            'Actual median ' + D.minutesText(group.actual), 'Current allowance ' + D.minutesText(allowance)])) + '</small></div>' +
          '<div class="actions">' + (allowance !== group.actual && group.actual <= 240 ? short('Use ' + group.actual + ' min for ' + group.shift,
            'companion-allowance', { shift: group.shift, minutes: group.actual }) : '') +
          (Object.hasOwn(prefs.afterByShift, group.shift) ? short('Use general allowance', 'companion-allowance', { shift: group.shift }) : '') + '</div></article>';
      }).join('');
      const rows = result.snapshots.map(row => {
        const actual = afterLog(row.date, row.shift);
        return '<tr><th scope="row">' + E(date(row.date)) + '</th><td>' + E(row.shift || 'Unrostered') +
          '</td><td>' + E(row.afterMinutes == null ? '—' : D.minutesText(row.afterMinutes)) + '</td><td>' +
          E(actual ? D.minutesText(actual.minutes) : '—') + '</td><td>' +
          (row.afterMinutes == null ? '' : actualAfterButton(row.date, row.shift, row.afterDate)) + '</td></tr>';
      }).join('');
      const moved = result.displacements.map(({ row, block, replacement }) =>
        '<article class="plan-review-row"><div><strong>' + E(block.title) + '</strong><small>' +
        E(date(row.date) + ' · ' + period(block) + (replacement ? ' → ' + period(replacement) : ' · absent from the current plan')) +
        '</small></div></article>').join('');
      const totals = result.actual.totals.map(([key, duration]) => chip(F.categories[key] + ' · ' + D.minutesText(duration))).join('');
      const comparison = Object.entries(F.categories).filter(([key]) => result.planned.has(key) || result.logged.has(key)).map(([key, title]) =>
        '<tr><th scope="row">' + E(title) + '</th><td>' + E(result.planned.has(key) ? D.minutesText(result.planned.get(key)) : '—') +
        '</td><td>' + E(result.logged.has(key) ? D.minutesText(result.logged.get(key)) : '—') + '</td></tr>').join('');
      const patterns = result.patterns.map(row => chip(row.transition + ' · changes on ' + row.changed + ' of ' + row.total + ' saved days')).join('');
      return panel('Roster cycle review', text(date(result.start) + ' – ' + date(result.through)) +
        (totals ? '<div class="pills">' + totals + '</div>' : empty('Log actual time to see totals for this period.')),
        short('Choose dates', 'companion-cycle-range') + baselineButton(state.date)) +
        (comparison ? panel('Planned and logged on baseline days', '<div class="companion-table"><table><thead><tr>' +
          '<th>Category</th><th>Planned</th><th>Logged</th></tr></thead><tbody>' + comparison + '</tbody></table></div>', '',
          result.snapshots.length + ' saved ' + (result.snapshots.length === 1 ? 'day' : 'days')) : '') +
        panel('Travel, meal & changing', (samples || empty('Save a baseline and log actual travel and meal time on the same duty.')) +
          (rows ? '<div class="companion-table"><table><thead><tr><th>Date</th><th>Duty</th><th>Planned</th><th>Logged</th><th>Action</th></tr></thead><tbody>' +
            rows + '</tbody></table></div>' : '')) +
        panel('Learning and family blocks that moved', (patterns ? '<div class="pills">' + patterns + '</div>' : '') +
          (moved || empty('No changes found in the saved baselines for this period.')), '', 'Saved baseline compared with the current plan');
    }

    function cycleEdit() {
      const result = C.cycleReview(current(), cycleRange?.through || state.date, cycleRange?.from);
      form('companion-cycle-form', 'Choose a review period', dateInput('from', 'From', result.start) +
        dateInput('through', 'Through', result.through), 'Show period', null, '',
        cycleRange ? btn('Use last eight duties', 'companion-cycle-reset') : '');
    }

    function saveCycle(element) {
      const values = new FormData(element);
      const from = readDate(values, 'from', 'the from date', true);
      const through = readDate(values, 'through', 'the through date', true);
      if (from > through) throw new Error('Choose a through date on or after the start.');
      cycleRange = { from, through };
      render();
    }

    return { peoplePage, briefPanel, readinessPanel, blockedPanel, personalPage, personalAlerts, learningDetails, courseApplications,
      actualAfterButton, baselineButton, report, lastSlotAlerts, acceptanceRows,
      forms: { 'companion-pause-form': savePause, 'companion-brief-form': saveBrief, 'companion-contact-form': saveConversation,
        'companion-accept-form': saveAcceptance,
        'companion-readiness-form': saveReadiness, 'companion-step-form': saveStep, 'companion-swap-form': swapPreview,
        'companion-faith-form': saveFaith, 'companion-personal-form': savePersonal, 'companion-learning-form': saveLearning, 'companion-cycle-form': saveCycle },
      actions: { 'companion-pause': pauseEdit, 'companion-pauses': pauseList, 'companion-resume': resume,
        'companion-last-slot': lastSlot, 'companion-book-last': bookLast, 'companion-accept': acceptanceEdit,
        'companion-clear-accept': async previous => {
          await commit(data => updateAcceptance(data, previous, null), 'Handover acceptance cleared.');
          closeDialog(true);
        },
        'companion-brief': briefing, 'companion-brief-add': briefEdit, 'companion-contact': conversation, 'companion-readiness': readiness, 'companion-step': stepEdit,
        'companion-swap': swapEdit, 'companion-apply-swap': applySwap, 'companion-faith': faithEdit,
        'companion-open-faith': ({ date: day, slot }) => { state.zikrSlot = slot; return navigate('faith', day); },
        'companion-personal': personalEdit, 'companion-another': anotherTime, 'companion-book': book, 'companion-personal-remove': removePersonal,
        'companion-personal-done': ({ id }) => commit(data => {
          const row = D.byId(data.personalWindows, id);
          if (!row || row.completedAt || !row.entryId) return false;
          row.completedAt = D.stamp();
          touch(row);
        }, 'Personal commitment completed.'),
        'companion-learning': learningEdit, 'companion-learning-result': learningResult, 'companion-cycle-range': cycleEdit,
        'companion-cycle-reset': () => { cycleRange = undefined; closeDialog(true); render(); },
        'companion-baseline': ({ date: day }) => commit(data => C.saveBaseline(data, day), 'Plan baseline saved.'),
        'companion-allowance': ({ shift, minutes }) => commit(data => {
          if (!D.SHIFT[shift]?.start || minutes != null && (!Number.isInteger(Number(minutes)) || Number(minutes) < 1 || Number(minutes) > 240)) {
            throw new Error('Choose a valid duty and allowance.');
          }
          data.settings.dayPlan ||= {};
          const allowances = data.settings.dayPlan.afterByShift ||= {};
          if (minutes != null) allowances[shift] = Number(minutes);
          else delete allowances[shift];
        }, 'Travel and meal allowance updated.') }
    };
  };
})(Diary);
