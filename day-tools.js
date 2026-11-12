/* Shift stickies, routine schedules, and the namaz and zikr diary. */
(function (D) {
  'use strict';

  D.createDayTools = function (ui) {
    const { state, current, now, viewDutyDay, E, btn, ibtn, chip, empty, page, panel, dateNav, tabs, select, input, textarea,
      check, dateInput, timeInput, readDate, readTime, formValue, openDialog, commit, rowsView, editEntry,
      blankEntry, linkButton, assignerInput, dutyWarning, personLink, showError, render } = ui;
    const related = ui.related || (() => '');
    const date = D.formatDate;
    const workShifts = { '': 'Any shift', ...Object.fromEntries(D.WORKING_SHIFTS.map(shift => [shift, shift])) };
    const assigning = { '': 'Unassigned', ...D.ASSIGNERS };
    const N = D.notebook;
    const stickyColours = { yellow: 'Yellow', sky: 'Sky blue', mint: 'Mint', lilac: 'Lilac', rose: 'Rose', peach: 'Peach' };
    const presetLabels = {
      dlevel: 'D Level Weekly', emergency: 'Emergency talk', apprentice: 'Apprentice report', audit: 'Monthly audit',
      jcc: 'Job Cycle Check', scba: 'SCBA Donning and Doffing', simis: 'SIMIS queue check',
      ecm: 'ECM queue check', safety: 'Sunday safety checklist'
    };
    const submit = (form, label) => '<button class="primary" type="submit" form="' + form + '">' + E(label) + '</button>';

    function dialogForm(id, title, fields, label, row = null, intro = '') {
      openDialog(id, title, intro + '<form id="' + id + '" class="form-grid" novalidate>' + fields + '</form>',
        btn('Cancel', 'close-dialog') + submit(id, label), { row });
    }

    function stickyDuty(data, day) {
      const duty = data.roster.find(row => row.date === day);
      return D.SHIFT[duty?.shift]?.start ? duty : null;
    }

    const stickyColour = row => Object.hasOwn(stickyColours, row.stickyColour) ? row.stickyColour : 'yellow';
    const stickyRank = row => Number.isSafeInteger(row.stickyRank) && row.stickyRank > 0
      ? row.stickyRank : Number.MAX_SAFE_INTEGER;
    const priorityRank = row => Number.isSafeInteger(row.stickyPriority) && row.stickyPriority > 0
      ? row.stickyPriority : Number.MAX_SAFE_INTEGER;
    const stickyOrder = (a, b) => priorityRank(a) - priorityRank(b) ||
      Number(!!b.shiftStickyKey) - Number(!!a.shiftStickyKey) ||
      (a.shiftStickyKey ? D.str(b.shiftStickyDay).localeCompare(D.str(a.shiftStickyDay)) ||
        (a.shiftRoutineRank ?? a.shiftSequence ?? 100) - (b.shiftRoutineRank ?? b.shiftSequence ?? 100) : 0) ||
      stickyRank(a) - stickyRank(b) || D.manualOrder(a, b);
    const stickyTasks = data => data.entries.filter(row => D.workflow.isSticky(row) && D.active(row));

    function stickyCard(row, index, rows, compact = false) {
      const done = row.status === 'done';
      const pinned = row.stickyPinned === true;
      const id = row.id;
      const title = compact ? 'h3' : 'h2';
      const duty = [row.shift, date(row.dutyDate)].filter(Boolean).join(' ');
      const end = D.eventWindow(row)?.end;
      const clock = row.time && row.time + (end ? '–' + D.parts(end).time : '');
      const planned = row.dutyDate > row.date && !row.shiftStickyKey && !row.shiftDateOverride ? row.dutyDate : row.date;
      const times = [(clock || planned !== row.dutyDate) && 'Planned ' + date(planned) + (clock ? ' ' + clock : ''),
        row.dueDate && 'Due ' + date(row.dueDate) + (row.dueTime ? ' ' + row.dueTime : '')];
      const move = (other, direction, icon, label) => ibtn(icon, 'Move ' + row.title + ' ' + label, 'sticky-move',
        { id, other: other?.id ?? '', direction }, !other);
      const pin = row.shiftStickyKey ? '<span class="sticky-routine-mark" title="Automatically pinned for this duty">' +
        (clock ? '<strong class="sticky-start">' + E(clock) + '</strong>' : 'Auto-pinned') + '</span>' :
        btn('', 'sticky-pin', { id, pin: pinned ? 'no' : 'yes' }, { cls: 'icon-button sticky-pin', icon: 'pin',
          pressed: pinned, label: (pinned ? 'Unpin from all pages: ' : 'Pin across pages: ') + row.title });
      const size = N.size(row.stickySize || current().settings.stickySize);
      const preview = compact ? '' : personLink(row) + N.render(row.body, row.noteStyles?.body);
      const grip = done || rows.length < 2 ? '' : ibtn('grip', 'Drag to reorder ' + row.title, 'sticky-drag', { id });
      return '<article class="sticky-card" data-sticky-id="' + E(id) + '" data-sticky-colour="' + stickyColour(row) +
        '" data-sticky-card-size="' + size + '"' + (compact ? '' : ' data-card-width="' + E(row.stickyWidth) +
          '" data-card-height="' + E(row.stickyHeight) + '"') + '>' +
        '<div class="sticky-card-top"><div class="pills">' + chip(D.STATUS[row.status]) +
        dutyWarning(row) + '</div><div class="actions sticky-card-controls">' + grip + pin + '</div></div>' +
        '<' + title + '>' + btn(row.title, 'entry-view', { id }, { cls: 'sticky-title row-title', label: row.title }) + '</' + title + '>' +
        '<div class="sticky-times">' + [row.shiftStickyKey && row.date === row.dutyDate ? '' : duty, ...times].filter(Boolean)
          .map(text => '<span>' + E(text) + '</span>').join('') + '</div>' +
        (preview ? '<div class="sticky-copy">' + preview + '</div>' : '') +
        '<div class="sticky-card-actions"><div class="actions">' +
        btn('Edit', 'sticky-edit', { id }, { cls: 'small', label: 'Quick edit ' + row.title }) +
        btn(done ? 'Reopen' : 'Done', 'task-status', { id, status: done ? 'todo' : 'done' }, { cls: 'small',
          label: (done ? 'Reopen ' : 'Complete ') + row.title }) +
        (compact || row.shiftStickyKey ? '' : ibtn('checklist', 'Convert ' + row.title + ' to a task', 'task-sticky', { id, show: 'no' })) + '</div>' +
        (done ? '' : '<div class="actions sticky-order" role="group" aria-label="Sticky priority order">' +
          move(rows[index - 1], -1, 'up', 'earlier') + move(rows[index + 1], 1, 'down', 'later') + '</div>') + '</div>' +
        (compact ? '' : '<button type="button" class="sticky-resize" data-sticky-resize aria-label="Resize ' + E(row.title) +
          '" title="Drag to resize, or use the arrow keys"></button>') + '</article>';
    }

    const stickyCards = (rows, compact = false) => rows.map((row, index) => stickyCard(row, index, rows, compact)).join('');
    const shiftLabel = duty => duty.shift + ' · ' + date(duty.date);

    function simpleSticky(row, index, rows, showDate, reordering) {
      const id = row.id;
      const done = row.status === 'done';
      const window = D.eventWindow(row);
      const finish = window && D.parts(window.end);
      const clock = finish ? row.time + '–' + finish.time + (finish.date > row.date ? ' next day' : '') : row.time;
      const timing = [showDate && date(D.taskDay(row)), clock, row.dueDate && 'Due ' + date(row.dueDate),
        !done && row.followDate && 'Follow up ' + date(row.followDate), !done && row.progressPercent > 0 && row.progressPercent + '%',
        !done && row.status !== 'todo' && D.STATUS[row.status]].filter(Boolean).join(' · ');
      const move = (step, icon, label) => ibtn(icon, 'Move ' + row.title + ' ' + label, 'sticky-move',
        { id, other: rows[index + step]?.id ?? '', direction: step }, !rows[index + step]);
      return '<article class="sticky-card simple-sticky" data-sticky-id="' + E(id) + '" data-sticky-colour="' + stickyColour(row) +
        '" data-sticky-card-size="' + N.size(row.stickySize || current().settings.stickySize) + '" data-card-width="' + E(row.stickyWidth) +
        '" data-card-height="' + E(row.stickyHeight) + '"><div class="simple-sticky-main">' +
        (showDate ? '<small class="sticky-type">' + E(D.workflow.stickyLabel(row)) + '</small>' : '') +
        btn(row.title, 'entry-view', { id }, { cls: 'sticky-title row-title', label: row.title }) +
        (timing ? '<small class="simple-sticky-time">' + E(timing) + '</small>' : '') +
        (D.tidy(row.body) ? '<small class="simple-sticky-note">' + E(D.tidy(row.body)) + '</small>' : '') + related(row) + '</div>' +
        '<div class="simple-sticky-actions' + (reordering ? ' is-reordering' : '') + '">' +
        (reordering ? ibtn('grip', 'Drag to reorder ' + row.title, 'sticky-drag', { id }, rows.length < 2) : '') +
        ibtn(done ? 'reopen' : 'check', (done ? 'Reopen ' : 'Complete ') + row.title, 'task-status', { id, status: done ? 'todo' : 'done' }) +
        (reordering ? move(-1, 'up', 'up') + move(1, 'down', 'down') : '') +
        '</div><button type="button" class="sticky-resize" data-sticky-resize aria-label="Resize ' + E(row.title) + '"></button></article>';
    }

    function stickyDock(open, duty, day) {
      const pinned = stickyTasks(current()).filter(row => D.workflow.openTaskOn(row, day) &&
        (row.shiftStickyKey || row.stickyPinned === true)).sort(stickyOrder);
      const count = pinned.length;
      if (!open) return { count, markup: '' };
      const heading = '<p class="sticky-dock-group-label muted">' + E(duty ? shiftLabel(duty) : date(day)) + '</p>';
      return { count, markup: heading + (stickyCards(pinned, true) || empty('Pin a task from Shift Stickies, or add a pinned sticky here.')) };
    }

    function stickyTiming(row = {}) {
      return timeInput('time', row.shiftScheduleKey ? 'Start time' : 'Planned time (optional)', row.time) +
        dateInput('dueDate', 'Due date (optional)', row.dueDate) +
        timeInput('dueTime', 'Due time (optional)', row.dueTime) +
        select('stickyColour', 'Paper colour', stickyColours, stickyColour(row)) +
        select('stickySize', 'Card size', { '': 'Use board default', ...N.sizes }, row.stickySize || '') +
        (row.stickyWidth || row.stickyHeight ? '<div class="wide">' + check('resetStickySize', 'Reset dragged size', false) + '</div>' : '');
    }

    function stickyPage(embedded = false) {
      const data = current();
      const day = state.date;
      const shiftDay = state.stickyDutyDate || viewDutyDay();
      const duty = stickyDuty(data, shiftDay);
      const completed = state.stickies === 'done';
      const today = state.stickies === 'today';
      const rows = stickyTasks(data).filter(row => completed ? row.status === 'done' : D.workflow.openTaskOn(row, day))
        .sort(completed ? (a, b) => D.str(b.completedAt).localeCompare(D.str(a.completedAt)) || stickyOrder(a, b) : stickyOrder);
      const detailed = state.stickyDetailed === true;
      const reordering = !completed && state.stickyReorder === true;
      const grid = (items, showDate) => '<div class="sticky-grid' + (detailed ? '' : ' simple-sticky-grid') + '" data-sticky-order-list>' +
        (detailed ? stickyCards(items) : items.map((row, index) => simpleSticky(row, index, items, showDate, reordering)).join('')) + '</div>';
      const group = (label, items, message) => '<section class="sticky-home-group"><h2>' + E(label) + '</h2>' +
        (items.length ? grid(items, false) : empty(message)) + '</section>';
      const shift = rows.filter(row => D.workflow.stickyKind(row) === 'shift' && D.taskDay(row) === shiftDay);
      const daily = rows.filter(row => D.workflow.stickyKind(row) === 'day' && (row.date === day || row.dueDate === day));
      const older = rows.length - shift.length - daily.length;
      const board = today && !reordering ? group(duty ? duty.shift + ' shift' + (shiftDay !== day ? ' · ' + date(shiftDay) : '') : 'Shift stickies', shift, 'No stickies for this shift.') +
        group('Day stickies', daily, 'No day stickies for this date.') + (older > 0 ?
          btn('View earlier open stickies (' + older + ')', 'tab', { key: 'stickies', value: 'shift' }, { cls: 'text-button small' }) : '') :
        (rows.length ? grid(rows, true) : empty(completed ? 'No completed stickies.' : 'No open stickies through this date.'));
      const capture = '<form id="sticky-add" class="form-grid" novalidate>' +
        input('title', 'New sticky', '', { wide: true, placeholder: 'Type a quick job', extra: ' maxlength="500"' }) +
        assignerInput('', 'capture-assigners') + select('assignment', 'Assigned by role', assigning, '') +
        dateInput('date', 'Planned date (optional)', '') +
        N.field('body', 'Notes (optional)', '', 'Details to remember') +
        '<details class="wide sticky-extra"><summary>Time, colour and size</summary><div class="form-grid">' + stickyTiming() + '</div></details>' +
        '<div class="wide">' + check('stickyPinned', 'Pin across pages', false) + '</div>' +
        '<div class="actions wide"><button type="submit" class="primary">Add sticky task</button></div></form>';
      const tools = btn('Add sticky', 'sticky-new', {}, { cls: 'small primary', icon: 'plus' }) + dateNav();
      const capturePanel = detailed ? '<details class="workspace-options"><summary>Quick capture</summary>' + capture + '</details>' : '';
      const options = '<details class="workspace-options" data-keep-open="sticky-options"><summary>Board options</summary><div class="actions">' +
        btn(detailed ? 'Use simple cards' : 'Show detailed cards', 'sticky-detail', {}, { cls: 'small' }) +
        btn('Board layout', 'sticky-layout', {}, { cls: 'small' }) + '</div></details>';
      const top = N.placement(data.settings.stickyCapturePlacement) === 'top';
      return (embedded ? '<div class="panel-head focus-sticky-head"><h2>Stickies</h2><div class="page-tools">' + tools + '</div></div>' :
        page('', 'Stickies', 'Quick jobs for the shift and the day.', tools)) + '<div class="workspace-switch">' +
        tabs({ today: 'Today', shift: 'Open & carried over', done: 'Completed' }, 'stickies', 'Sticky notes view') +
        (!completed && rows.length ? btn(reordering ? 'Done reordering' : 'Reorder', 'sticky-reorder', {},
          { cls: 'small', icon: 'grip', pressed: reordering }) : '') + options + '</div>' +
        (reordering ? '<p class="muted sticky-reorder-hint">Drag a card by its handle or use the arrows to move it.</p>' : '') +
        '<div class="sticky-board">' + (top ? capturePanel + board : board + capturePanel) + '</div>';
    }

    function stickyLayout() {
      const settings = current().settings;
      dialogForm('sticky-layout-form', 'Sticky board layout',
        select('placement', 'Quick capture position', N.placements, N.placement(settings.stickyCapturePlacement)) +
        select('stickySize', 'Default sticky size', N.sizes, N.size(settings.stickySize)), 'Save layout');
    }

    async function saveLayout(form) {
      const values = new FormData(form);
      await commit(data => {
        data.settings.stickyCapturePlacement = N.placement(values.get('placement'));
        data.settings.stickySize = N.size(values.get('stickySize'));
      }, 'Sticky layout saved.');
    }

    function readSticky(values, plannedDate, duty = null) {
      const title = D.tidy(values.get('title'));
      const colour = formValue(values, 'stickyColour');
      if (!title || title.length > 500) throw new Error('Enter a task title of up to 500 characters.');
      if (!Object.hasOwn(stickyColours, colour)) throw new Error('Choose a paper colour.');
      const time = readTime(values, 'time', 'the planned time');
      const dueTime = readTime(values, 'dueTime', 'the due time');
      const day = duty && time ? D.dutyTimeDate(duty.date, duty.shift, time) : plannedDate;
      const assignedBy = D.tidy(values.get('assignedBy'));
      if (assignedBy.length > 120) throw new Error('Enter an assigner name of up to 120 characters.');
      return { title, body: formValue(values, 'body'), assignedBy, assignment: formValue(values, 'assignment') || D.workflow.personRole(assignedBy),
        date: day, time, dueTime,
        dueDate: readDate(values, 'dueDate', 'the due date') || (dueTime ? day : ''),
        stickyCard: true, stickyColour: colour, stickySize: Object.hasOwn(N.sizes, values.get('stickySize')) ? values.get('stickySize') : '',
        stickyPinned: values.has('stickyPinned') };
    }

    async function addSticky(form, link) {
      const values = new FormData(form);
      const chosenDate = state.date;
      const local = now();
      const enteredDate = readDate(values, 'date', 'the planned date');
      await commit(data => {
        if (values.has('stickyKind')) {
          const kind = formValue(values, 'stickyKind');
          if (!['shift', 'day'].includes(kind)) throw new Error('Choose Shift or Day.');
          const day = enteredDate || (kind === 'shift' ? state.stickyDutyDate || viewDutyDay() : state.stickyDutyDate || local.date);
          const duty = kind === 'shift' ? stickyDuty(data, day) : null;
          const activeDuty = D.shiftCompanion.activeDuty(data);
          const plannedDate = !enteredDate && duty?.date === activeDuty?.date && duty?.date < local.date ? local.date : day;
          const fields = readSticky(values, plannedDate, duty);
          const parent = link?.entry && D.byId(data.entries, link.entry);
          const assignment = D.portfolio.active(data, link?.assignment || parent?.portfolioId);
          if (link?.entry && (!parent || !D.active(parent)) || link?.assignment && !assignment) throw new Error('The linked work is no longer available.');
          const scope = kind === 'shift' || assignment || parent?.scope === 'work' || values.get('scope') === 'work' ? 'work' : 'personal';
          if (!fields.assignedBy) fields.assignedBy = parent?.assignedBy || assignment?.assignedBy || '';
          D.workTask(data, { ...fields, scope, stickyKind: kind, dutyDate: kind === 'shift' ? day : '', shift: duty?.shift || '',
            ...(parent ? { planParentId: parent.id } : {}), ...(assignment ? { portfolioId: D.str(assignment.id) } : {}) });
          if (fields.stickyPinned) data.settings.stickyDockOpen = true;
          return (kind === 'shift' ? 'Shift' : 'Day') + ' sticky saved · ' + date(kind === 'shift' ? day : fields.date) + '.';
        }
        const activeDuty = D.dutyAt(data.roster).current;
        const fromDock = form.id === 'sticky-new-form';
        const duty = enteredDate ? stickyDuty(data, enteredDate) : fromDock ? activeDuty : stickyDuty(data, chosenDate);
        const plannedDate = fromDock || (D.overnight(duty?.shift) && activeDuty?.date === duty.date) ? local.date : chosenDate;
        const fields = readSticky(values, enteredDate || plannedDate, enteredDate ? null : duty);
        D.workTask(data, { ...fields, noteStyles: N.capture(values), dutyDate: duty?.date || '', shift: duty?.shift || '' });
        if (fields.stickyPinned) data.settings.stickyDockOpen = true;
      }, message => message || 'Sticky saved.');
    }

    function newSticky({ pinned, kind, assignment, entry } = {}) {
      const parent = entry && D.byId(current().entries, entry);
      const portfolio = D.portfolio.active(current(), assignment || parent?.portfolioId);
      const today = now().date;
      const parentDay = parent && D.taskDay(parent);
      const plannedDate = parent ? parentDay > today ? parentDay : today : '';
      const dutyDate = parent ? parent.dutyDate === plannedDate ? parent.dutyDate : '' : state.stickyDutyDate || viewDutyDay();
      const selected = kind || (stickyDuty(current(), dutyDate) ? 'shift' : 'day');
      const linked = [parent?.title, portfolio?.title].filter(Boolean).join(' · ');
      dialogForm('sticky-new-form', pinned ? 'Add pinned sticky' : 'Add sticky',
        input('title', 'Quick job', '', { wide: true, extra: ' maxlength="500" data-initial-focus' }) +
        select('stickyKind', 'For', { shift: 'Shift', day: 'Day' }, selected) + timeInput('time', 'Time (optional)', '') +
        '<details class="wide workspace-options"><summary>Details</summary><div class="form-grid">' +
        dateInput('date', 'Planned date', plannedDate) + select('scope', 'Day sticky type', { personal: 'Personal', work: 'Work' }, portfolio || parent?.scope === 'work' ? 'work' : 'personal') +
        textarea('body', 'Note (optional)', '') + dateInput('dueDate', 'Due date', '') + timeInput('dueTime', 'Due time', '') +
        select('stickyColour', 'Paper colour', stickyColours, 'yellow') + assignerInput('', 'sticky-assigners') + '</div></details>' +
        (pinned ? '<input type="hidden" name="stickyPinned" value="yes">' : ''), 'Save sticky', { assignment, entry },
        linked ? '<p class="muted">Linked to ' + E(linked) + '</p>' : '');
    }

    function editSticky(id) {
      const row = D.byId(current().entries, id);
      if (!D.workflow.isSticky(row) || !D.active(row)) throw new Error('This sticky is no longer available.');
      dialogForm('sticky-form', 'Quick edit sticky task',
        input('title', 'Task title', row.title, { wide: true, extra: ' maxlength="500" data-initial-focus' }) +
        (!row.shiftScheduleKey ? select('stickyKind', 'For', { shift: 'Shift', day: 'Day' }, D.workflow.stickyKind(row)) : '') +
        select('status', 'Status', D.STATUS, row.status) + assignerInput(row.assignedBy, 'sticky-edit-assigners') +
        select('assignment', 'Assigned by role', assigning, D.assignmentOf(row)) +
        dateInput('date', 'Planned date', row.date) +
        N.field('body', 'Notes', row.body) + stickyTiming(row) +
        (row.shiftStickyKey ? '<input type="hidden" name="stickyPinned" value="yes">' :
          '<div class="wide">' + check('stickyPinned', 'Pin across pages', row.stickyPinned === true) + '</div>'), 'Save task', row,
        '<p class="muted">Use 24-hour Karachi time. With a due time and a blank due date, the task is due on its planned date.</p>' +
        (row.shiftScheduleKey ? '<p class="muted">Saving a new start time here updates future occurrences of this routine.</p>' : '') +
        '<div class="actions">' + btn('Adjust time in Day Planner', 'plan-adjust-task', { id: row.id }, { cls: 'small' }) + '</div>');
    }

    async function saveSticky(form, previous) {
      const values = new FormData(form);
      const status = formValue(values, 'status');
      const kind = formValue(values, 'stickyKind');
      if (kind && !['shift', 'day'].includes(kind)) throw new Error('Choose Shift or Day.');
      const plannedDate = values.has('date') ? readDate(values, 'date', 'the planned date', true) : previous.date;
      const movedDate = plannedDate !== previous.date;
      const changedKind = kind && kind !== D.workflow.stickyKind(previous);
      const duty = changedKind ? (kind === 'shift' ? stickyDuty(current(), plannedDate) : null) :
        !movedDate && previous.dutyDate && previous.shift && !previous.shiftReminderKey && !previous.shiftDateOverride && D.tidy(values.get('time')) !== (previous.time || '')
        ? { date: previous.dutyDate, shift: previous.shift } : null;
      const fields = readSticky(values, plannedDate, duty);
      if (!Object.hasOwn(D.STATUS, status)) throw new Error('Choose a task status.');
      await commit(data => {
        const row = D.byId(data.entries, previous.id);
        if (!row || !D.active(row) || row.editToken !== previous.editToken) throw new Error('This task changed. Open it again to see the latest version.');
        if (movedDate) Object.assign(fields, D.workflow.taskPlanChange(data, row, plannedDate));
        if (changedKind) Object.assign(fields, { stickyKind: kind, dutyDate: kind === 'shift' ? plannedDate : '', shift: duty?.shift || '',
          scope: kind === 'shift' ? 'work' : row.scope });
        const original = { ...row, assignment: D.assignmentOf(row), stickyColour: stickyColour(row),
          stickyCard: D.workflow.isSticky(row), stickyPinned: row.stickyPinned === true };
        const resetSize = values.has('resetStickySize') || fields.stickySize !== (row.stickySize || '');
        const noteStyles = N.capture(values, row.noteStyles);
        if (!resetSize && row.status === status && Object.entries(fields).every(([key, value]) => value === (original[key] ?? '')) &&
          JSON.stringify(noteStyles) === JSON.stringify(row.noteStyles)) return false;
        const at = D.stamp();
        D.setTaskStatus(row, status, at);
        if (fields.stickyPinned && !original.stickyPinned && status !== 'done') data.settings.stickyDockOpen = true;
        Object.assign(row, fields, { noteStyles, editToken: D.uid(), updatedAt: at });
        D.shiftSchedule.saveRoutineStart(data, previous, row, at);
        if (resetSize) { delete row.stickyWidth; delete row.stickyHeight; }
        row.originalDueDate ||= row.dueDate;
        row.history = [...D.list(row.history), { at, action: 'Edited on Shift Stickies', changes: movedDate ?
          [{ field: 'Planned date', before: previous.date, after: row.date }] : [] }];
      }, 'Task saved.');
    }

    function focusSticky(region, id, selector) {
      const card = [...region.querySelectorAll('[data-sticky-id]')].find(node => D.same(node.dataset.stickyId, id));
      const control = card?.querySelector(selector) || card?.querySelector('[data-action="sticky-edit"]') ||
        card?.querySelector('[data-action="sticky-drag"]:enabled') ||
        region.querySelector('[data-action="sticky-new"]');
      control?.focus({ preventScroll: true });
      control?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }

    async function pinSticky({ id, pin }, button) {
      const region = button.closest('#sticky-dock, main');
      const pinned = pin === 'yes';
      await commit(data => {
        const row = D.byId(data.entries, id);
        if (!D.workflow.isSticky(row) || row.shiftStickyKey || !D.active(row) || (row.stickyPinned === true) === pinned) return false;
        const at = D.stamp();
        Object.assign(row, { stickyPinned: pinned, editToken: D.uid(), updatedAt: at });
        if (pinned && D.open(row)) data.settings.stickyDockOpen = true;
      }, pinned ? 'Sticky pinned across pages.' : 'Sticky unpinned.');
      focusSticky(region, id, '[data-action="sticky-pin"]');
    }

    async function moveSticky({ id, other, direction }, button) {
      const step = Number(direction);
      if (step !== -1 && step !== 1) return;
      const region = button.closest('#sticky-dock, main');
      const dock = region.id === 'sticky-dock';
      const day = dock ? viewDutyDay() : state.date;
      await commit(data => {
        const ordered = stickyTasks(data).sort(stickyOrder);
        const from = ordered.findIndex(row => D.same(row.id, id));
        const to = ordered.findIndex(row => D.same(row.id, other));
        const visible = row => row && D.workflow.openTaskOn(row, day) && (!dock || row.shiftStickyKey || row.stickyPinned === true);
        if (!visible(ordered[from]) || !visible(ordered[to]) || from === to || to - from === -step) return false;
        const [moved] = ordered.splice(from, 1);
        ordered.splice(to - Number(from < to) + Number(step > 0), 0, moved);
        const at = D.stamp();
        ordered.forEach((row, index) => {
          if (row.stickyPriority !== index + 1) Object.assign(row, { stickyPriority: index + 1, updatedAt: at });
        });
      }, 'Sticky order saved.');
      const action = button.dataset.action === 'sticky-drag' ? '[data-action="sticky-drag"]' :
        '[data-action="sticky-move"][data-direction="' + step + '"]:enabled';
      focusSticky(region, id, action);
    }

    function setSize(card, width, height) {
      for (const [axis, value, max] of [['width', width, 620], ['height', height, 520]]) {
        const pixels = Number(value);
        if (Number.isInteger(pixels) && pixels > 0 && pixels <= max) card.style.setProperty('--card-' + axis, pixels + 'px');
        else card.style.removeProperty('--card-' + axis);
      }
    }

    function applyStickySizes(region) {
      for (const card of region.querySelectorAll('[data-card-width]')) setSize(card, card.dataset.cardWidth, card.dataset.cardHeight);
    }

    const bounded = (value, min, max) => Math.max(min, Math.min(max, Math.round(value)));
    function boardSize(card, width, height) {
      return { width: bounded(width, 180, Math.min(620, card.parentElement.clientWidth)), height: bounded(height, 144, 520) };
    }

    async function saveSize(card, size) {
      const id = card.dataset.stickyId;
      try {
        await commit(data => {
          const row = D.byId(data.entries, id);
          if (!D.workflow.isSticky(row) || !D.active(row)) return false;
          Object.assign(row, { stickyWidth: size.width, stickyHeight: size.height, updatedAt: D.stamp(), editToken: D.uid() });
        }, null, false, false);
      } finally {
        const row = D.byId(current().entries, id);
        card.dataset.cardWidth = row?.stickyWidth || '';
        card.dataset.cardHeight = row?.stickyHeight || '';
        setSize(card, card.dataset.cardWidth, card.dataset.cardHeight);
      }
    }

    let resize;
    document.addEventListener('pointerdown', event => {
      const grip = event.target.closest('[data-sticky-resize]');
      if (!grip || event.button !== 0 || resize) return;
      const card = grip.closest('[data-sticky-id]');
      const { width, height } = card.getBoundingClientRect();
      resize = { card, width, height, x: event.clientX, y: event.clientY, pointer: event.pointerId };
      grip.setPointerCapture(event.pointerId);
    });
    document.addEventListener('pointermove', event => {
      if (resize?.pointer !== event.pointerId) return;
      if (!resize.card.isConnected) { resize = null; return; }
      const dx = event.clientX - resize.x;
      const dy = event.clientY - resize.y;
      if (!resize.size && Math.hypot(dx, dy) < 4) return;
      resize.size = boardSize(resize.card, resize.width + dx, resize.height + dy);
      setSize(resize.card, resize.size.width, resize.size.height);
    });
    function finishResize(event) {
      if (resize?.pointer !== event.pointerId) return;
      const { card, size } = resize;
      resize = null;
      if (size && card.isConnected && event.type === 'pointerup') saveSize(card, size).catch(showError);
      else setSize(card, card.dataset.cardWidth, card.dataset.cardHeight);
    }
    document.addEventListener('pointerup', finishResize);
    document.addEventListener('pointercancel', finishResize);
    document.addEventListener('lostpointercapture', finishResize);
    document.addEventListener('keydown', event => {
      const grip = event.target.closest('[data-sticky-resize]');
      const step = { ArrowLeft: [-16, 0], ArrowRight: [16, 0], ArrowUp: [0, -16], ArrowDown: [0, 16] }[event.key];
      if (!grip || !step) return;
      event.preventDefault();
      const card = grip.closest('[data-sticky-id]');
      const { width, height } = card.getBoundingClientRect();
      const size = boardSize(card, width + step[0], height + step[1]);
      setSize(card, size.width, size.height);
      saveSize(card, size).catch(showError);
    });

    function workPage() {
      const data = current();
      const first = D.weekStart(state.date);
      const last = D.addDays(first, 13);
      const slots = D.workSlots(data, first, last);
      const scheduled = data.entries.filter(row => row.routineId && D.active(row) && row.date >= first && row.date <= last)
        .sort((a, b) => a.date.localeCompare(b.date));
      const presets = Object.entries(presetLabels).map(([key, label]) =>
        btn(label, 'work-edit', { preset: key }, { cls: 'small' })).join('');
      const templates = data.workRules.slice().sort((a, b) => a.heading.localeCompare(b.heading) || a.title.localeCompare(b.title));
      const groups = D.unique(templates.map(row => row.heading));
      const ruleRows = groups.map(heading => '<section class="work-group"><h3>' + E(heading) + '</h3><div class="rows">' +
        templates.filter(row => row.heading === heading).map(rule => '<article class="row"><div class="row-main"><strong>' + E(rule.title) +
          '</strong><div class="pills">' + chip(D.CADENCES[rule.cadence]) + chip(rule.enabled ? 'Enabled' : 'Paused') +
          chip(D.hasWeekday(rule.cadence) ? D.WEEKDAYS[rule.weekday] : '') +
          chip(D.hasMonthDay(rule.cadence) ? 'Day ' + rule.monthDay : '') + chip(rule.shift) +
          chip([rule.time, rule.endTime].filter(Boolean).join('–')) + '</div></div><div class="actions">' +
          btn('Edit routine', 'work-edit', { id: rule.id }, { cls: 'small', label: 'Edit ' + rule.title }) +
          (rule.enabled && rule.cadence === 'manual' ? btn('Add task', 'work-manual', { id: rule.id }, { cls: 'small' }) : '') +
          '</div></article>').join('') + '</div></section>').join('');
      const plan = slots.map(({ rule, date: slotDate, number, manual }) => '<article class="row"><div class="row-main"><strong>' +
        E(rule.title) + '</strong><p class="muted">' + E([date(slotDate), rule.shift, number ? 'Night ' + number : '',
          [rule.time, rule.endTime].filter(Boolean).join('–')].filter(Boolean).join(' · ')) + '</p></div>' +
        btn(manual ? 'Choose this night' : 'Add to tasks', 'work-plan', { id: rule.id, date: slotDate },
          { cls: 'small', label: 'Plan ' + rule.title + ' for ' + date(slotDate) }) + '</article>').join('');
      return page('WORK', 'Work Routines', 'Use a heading for a group and a separate title for the task. Enable the schedules you want.', dateNav()) +
        '<div class="two-cols"><div class="stack">' +
        panel('Routine templates', (ruleRows || empty('Start with a preset or create a routine.')) +
          '<details class="section-actions"><summary>Work presets</summary><div class="actions section-actions">' + presets + '</div></details>',
          btn('New routine', 'work-edit', {}, { cls: 'primary' })) +
        panel('SIMIS and ECM queues', '<p class="muted">Record items you find in either queue. Add a queue-check preset to schedule reminders.</p><div class="actions">' +
          btn('Log SIMIS task', 'work-queue', { heading: 'SIMIS' }) + btn('Log ECM task', 'work-queue', { heading: 'ECM' }) + '</div>') +
        '</div><div class="stack">' +
        panel('Upcoming and unplanned', '<p class="muted">Date rules add tasks when due. For the emergency talk, choose either of the first two nights shown for the week. Shift-specific routines use your saved roster.</p>' +
          (plan ? '<div class="rows">' + plan + '</div>' : empty('No unplanned dates in this period.')),
          '', date(first) + ' – ' + date(last)) +
        panel('Tasks already created', rowsView(scheduled, { showDate: true, empty: 'No routine tasks created in this period.' }),
          linkButton('All tasks', 'tasks')) + '</div></div>';
    }

    function workEdit(id, preset) {
      const old = id ? D.byId(current().workRules, id) : null;
      if (id && !old) throw new Error('This routine is no longer available.');
      const today = now().date;
      const quarterMonth = Math.floor((Number(today.slice(5, 7)) - 1) / 3) * 3 + 1;
      const quarterStart = today.slice(0, 4) + '-' + String(quarterMonth).padStart(2, '0') + '-01';
      const endDate = preset === 'jcc' ? D.addDays(D.addMonths(quarterStart, 3), -1) : '';
      const rule = { heading: '', title: '', body: '', cadence: 'weekly', startDate: today, endDate,
        shift: '', time: '', endTime: '', assignment: '', night: 'choose', enabled: true, ...D.PRESETS[preset], ...old };
      const frequency = (name, inner, show) => '<div data-work-fields="' + name + '"' + (show ? '' : ' hidden') + '>' + inner + '</div>';
      const weekdays = { '': 'Choose day', ...Object.fromEntries(D.WEEKDAYS.map((name, index) => [index, name])) };
      dialogForm('work-rule-form', old ? 'Edit work routine' : 'New work routine',
        input('heading', 'Heading', rule.heading, { extra: ' maxlength="100" data-initial-focus' }) +
        input('title', 'Task title', rule.title, { extra: ' maxlength="500"' }) +
        select('cadence', 'Repeat', D.CADENCES, rule.cadence, ' data-work-cadence') +
        select('assignment', 'Assigned by role', assigning, rule.assignment) +
        dateInput('startDate', 'Starts', rule.startDate) + dateInput('endDate', 'Ends (optional)', rule.endDate) +
        frequency('weekday', select('weekday', 'Day of week', weekdays, rule.weekday), D.hasWeekday(rule.cadence)) +
        frequency('monthday', input('monthDay', 'Day of month', rule.monthDay, { type: 'number', extra: ' min="1" max="31"' }),
          D.hasMonthDay(rule.cadence)) +
        frequency('shift', select('shift', 'Only on this rostered shift', workShifts, rule.shift), rule.cadence !== 'night-weekly') +
        frequency('night', select('night', 'Night-duty choice', D.NIGHT_OPTIONS, rule.night), rule.cadence === 'night-weekly') +
        timeInput('time', 'Start / due time (optional)', rule.time) + timeInput('endTime', 'End of time block (optional)', rule.endTime) +
        N.field('body', 'Task notes (optional)', rule.body) + '<div class="wide">' +
        check('enabled', 'Enable this routine', rule.enabled) + '</div>',
        'Save routine', old, '<p class="muted">Monthly dates use the last day when the chosen day is missing. A fortnightly rule uses the week of its start date. Edits apply to future creation and keep tasks you already have.</p>');
    }

    function change(control) {
      if (!control.matches('[data-work-cadence]')) return false;
      const cadence = control.value;
      const visible = { weekday: D.hasWeekday(cadence), monthday: D.hasMonthDay(cadence),
        shift: cadence !== 'night-weekly', night: cadence === 'night-weekly' };
      for (const node of control.form.querySelectorAll('[data-work-fields]')) node.hidden = !visible[node.dataset.workFields];
      return true;
    }

    async function saveWork(form, old) {
      const values = new FormData(form);
      const cadence = formValue(values, 'cadence');
      const at = D.stamp();
      const rule = D.validateWorkRule({
        id: old?.id ?? D.uid(), heading: D.tidy(values.get('heading')), title: D.tidy(values.get('title')),
        body: formValue(values, 'body'), noteStyles: N.capture(values, old?.noteStyles), cadence, assignment: formValue(values, 'assignment'),
        startDate: readDate(values, 'startDate', 'the start date', true), endDate: readDate(values, 'endDate', 'the end date'),
        effectiveFrom: D.parts(at).date, updatedAt: at, enabled: values.has('enabled'),
        weekday: formValue(values, 'weekday') === '' ? null : Number(values.get('weekday')),
        monthDay: Number(values.get('monthDay')) || null, night: formValue(values, 'night'),
        shift: cadence === 'night-weekly' ? 'Night' : formValue(values, 'shift'),
        time: readTime(values, 'time', 'the start time'), endTime: readTime(values, 'endTime', 'the end time')
      });
      await commit(data => {
        const latest = old && D.byId(data.workRules, old.id);
        if (old && (!latest || latest.updatedAt !== old.updatedAt)) throw new Error('This routine changed. Open it again before saving.');
        if (latest && D.isAuditTemplate(latest) && latest.title !== rule.title) {
          for (const row of data.entries.filter(row => D.open(row) && row.routineId === latest.id && row.title === latest.title)) {
            Object.assign(row, { title: rule.title, updatedAt: at, editToken: D.uid(), history: [...D.list(row.history),
              { at, action: 'Renamed from the audit routine' }] });
          }
        }
        if (latest) Object.assign(latest, rule);
        else data.workRules.push(rule);
      }, 'Work routine saved.');
    }

    async function planWork({ id, date: slotDate }) {
      await commit(data => {
        const slot = D.workSlots(data, slotDate, slotDate).find(row => D.same(row.rule.id, id));
        if (!slot || !D.addWorkSlot(data, slot)) throw new Error('This date is already planned or the roster has changed.');
      }, 'Task added from work routine.');
    }

    function manualWork(id, heading) {
      const rule = id ? D.byId(current().workRules, id) : null;
      if (id && !rule?.enabled) throw new Error('This routine is no longer enabled.');
      const duty = D.dutyAt(current().roster).current;
      editEntry(blankEntry('task', { title: rule?.title || '', body: rule?.body || '', noteStyles: rule?.noteStyles, scope: 'work', date: now().date,
        routineHeading: rule?.heading || heading, assignment: rule?.assignment || '',
        shift: duty?.shift || '', dutyDate: duty?.date || '' }));
    }

    function faithSummary(day, local = null) {
      const data = current();
      const prayed = data.namazLog.filter(row => row.date === day).length;
      const recited = data.zikrLog.filter(row => row.date === day && row.count >= row.target).length;
      const required = data.zikrItems.filter(item => item.required && !item.archived)
        .flatMap(item => Object.keys(D.ZIKR_SLOTS).filter(slot => D.zikrFor(item, slot))
          .map(slot => D.byId(data.zikrLog, D.zikrLogId(day, slot, item.id))));
      const next = local && D.nextNamaz(data, local);
      const note = D.byId(data.faithNotes, day);
      return '<p>' + E(prayed + ' of 5 prayers logged · ' + recited + ' zikr targets reached') + '</p>' +
        (required.length ? '<p class="muted">' + E('My required zikr · ' +
          required.filter(log => log && log.count >= log.target).length + ' of ' + required.length + ' complete') + '</p>' : '') +
        (next ? '<p class="muted">' + E('Next prayer · ' + next.title + ' ' + next.time + (next.date !== day ? ' · ' + date(next.date) : '')) + '</p>' :
          local && !D.byId(data.namazTimes, day) ? '<p class="muted">Add your mosque’s timetable to see prayer times.</p>' : '') +
        (!local ? N.render(note?.body, note?.noteStyles?.body) : '');
    }

    function faithPage() {
      const data = current();
      const day = state.date;
      const schedule = D.byId(data.namazTimes, day);
      const logs = new Map(data.zikrLog.filter(row => row.date === day && row.slot === state.zikrSlot).map(row => [row.itemId, row]));
      const prayers = Object.entries(D.TIMETABLE).map(([key, title]) => {
        const logged = !!D.byId(data.namazLog, day + ':' + key);
        return '<div class="row"><div class="row-main"><strong>' + E(title) + '</strong><p class="muted">' +
          E(schedule?.times[key] || '—') + '</p></div>' +
          (key === 'sunrise' ? '' : btn(logged ? 'Prayed' : 'Log prayer', 'namaz-check', { key, date: day },
            { cls: 'small', pressed: logged, label: (logged ? 'Clear ' : 'Log ') + title })) + '</div>';
      }).join('');
      const slots = Object.fromEntries(Object.entries(D.ZIKR_SLOTS).map(([key, title]) =>
        [key, Object.hasOwn(D.PRAYERS, key) ? 'After ' + title : title]));
      const items = data.zikrItems.filter(item => logs.has(item.id) || !item.archived && D.zikrFor(item, state.zikrSlot))
        .sort((a, b) => Number(b.required) - Number(a.required));
      const zikr = items.map(item => {
        const log = logs.get(item.id);
        const count = log?.count || 0;
        const target = log?.target || item.target;
        const source = item.source ? '<a href="' + E(item.source) + '" target="_blank" rel="noopener noreferrer">' + E(item.reference) + '</a>' : E(item.reference);
        return '<article class="zikr-card"><div class="pills">' + chip(item.required ? 'My required zikr' : '', 'blue') +
          chip(item.archived ? 'Archived' : '') + chip(count + ' / ' + target, count >= target ? 'green' : '') +
          '</div><h3>' + E(item.title) + '</h3><p class="zikr-arabic" dir="auto">' + E(item.arabic) +
          '</p><p class="muted">' + E(item.meaning) + (source ? '<br>' + source : '') + '</p><div class="actions">' +
          btn('+1', 'zikr-count', { id: item.id, step: 'one', date: day, slot: state.zikrSlot },
            { cls: 'small', disabled: count >= target, label: 'Count one ' + item.title }) +
          btn('Done', 'zikr-count', { id: item.id, step: 'done', date: day, slot: state.zikrSlot },
            { cls: 'small', disabled: count >= target, label: 'Mark ' + item.title + ' done' }) +
          btn('Reset', 'zikr-count', { id: item.id, step: 'reset', date: day, slot: state.zikrSlot },
            { cls: 'small text-button', disabled: !count, label: 'Reset ' + item.title }) +
          btn('Edit zikr', 'zikr-edit', { id: item.id }, { cls: 'small text-button', label: 'Edit ' + item.title }) + '</div></article>';
      }).join('');
      const archived = data.zikrItems.filter(item => item.archived);
      const journal = '<form id="faith-note-form" class="form-grid" novalidate>' +
        N.field('body', 'Daily reflection', D.byId(data.faithNotes, day)?.body, 'Write a note about today') +
        '<div class="actions wide"><button type="submit" class="primary">Save reflection</button></div></form>';
      return page('PERSONAL', 'Namaz & Zikr', date(day) + ' · Asia/Karachi',
        btn('Reserve in Day Plan', 'companion-faith', {}, { cls: 'small' }) + dateNav()) +
        '<div class="two-cols"><div class="stack">' +
        panel('Namaz timetable', (schedule ? '<p class="muted">' + E(schedule.source || 'My saved timetable') + '</p>' :
          '<p class="muted">Enter the times from your local mosque for this date or paste a dated timetable.</p>') +
          '<div class="rows prayer-rows">' + prayers + '</div>',
          '<div class="actions">' + btn('Enter times', 'namaz-edit', {}, { cls: 'small' }) +
          btn('Paste timetable', 'namaz-paste', {}, { cls: 'small' }) + '</div>') +
        panel('Faith diary', faithSummary(day) + journal) +
        '</div><div class="stack">' +
        panel('Written zikr checklist', '<p class="muted">Each session has its own count. Edit any zikr to mark it as required for your routine. Logged counts keep their recorded target.</p>' +
          tabs(slots, 'zikrSlot', 'Zikr session') +
          (zikr || empty('No zikr set for this session. Add one with the timing you want.')) +
          (archived.length ? '<details><summary>Archived zikr</summary><div class="actions">' + archived.map(item =>
            btn(item.title, 'zikr-edit', { id: item.id }, { cls: 'small' })).join('') + '</div></details>' : ''),
          btn('Add zikr', 'zikr-edit', {}, { cls: 'small primary' })) + '</div></div>';
    }

    function editNamaz() {
      const saved = D.byId(current().namazTimes, state.date);
      dialogForm('namaz-form', 'Enter mosque timetable',
        dateInput('start', 'From date', state.date) + dateInput('end', 'Through date', state.date) +
        Object.entries(D.TIMETABLE).map(([key, title]) => timeInput(key, title + (key === 'sunrise' ? ' (optional)' : ''), saved?.times[key])).join('') +
        input('source', 'Mosque or timetable name (optional)', saved?.source, { wide: true }), 'Save timetable', null,
        '<p class="muted">Use a date range only where the same times apply. Saving replaces the timings for those dates.</p>');
    }

    function pasteNamaz() {
      dialogForm('namaz-paste-form', 'Paste a dated timetable',
        textarea('table', 'Timetable rows', '', 'date,fajr,dhuhr,asr,maghrib,isha') +
        input('source', 'Mosque or timetable name (optional)', '', { wide: true }), 'Save timetable', null,
        '<p class="muted">Paste comma-separated rows or spreadsheet cells with a header. Use YYYY-MM-DD or DD-MMM-YYYY and 24-hour HH:mm. The sunrise column is optional. Saving replaces the timings for the pasted dates.</p>');
    }

    async function saveNamaz(form) {
      const values = new FormData(form);
      const source = D.tidy(values.get('source'));
      let rows;
      if (form.id === 'namaz-paste-form') rows = D.parseNamazTable(formValue(values, 'table'), source);
      else {
        const start = readDate(values, 'start', 'the first date', true);
        const end = readDate(values, 'end', 'the last date', true);
        const days = D.daysBetween(start, end);
        if (days < 0 || days > 365) throw new Error('Enter a date range of 1 to 366 days.');
        const times = Object.fromEntries(Object.entries(D.TIMETABLE).map(([key, title]) =>
          [key, readTime(values, key, title, key !== 'sunrise')]));
        rows = Array.from({ length: days + 1 }, (_, index) => {
          const day = D.addDays(start, index);
          return D.validateNamaz({ id: day, date: day, source, times });
        });
      }
      await commit(data => {
        const days = new Set(rows.map(row => row.date));
        data.namazTimes = [...data.namazTimes.filter(row => !days.has(row.date)), ...rows];
      }, 'Timetable saved for ' + rows.length + (rows.length === 1 ? ' day.' : ' days.'));
    }

    async function markPrayer({ key, date: day }) {
      if (!Object.hasOwn(D.PRAYERS, key) || !D.parseDate(day)) return;
      const id = day + ':' + key;
      await commit(data => {
        if (D.byId(data.namazLog, id)) data.namazLog = data.namazLog.filter(row => row.id !== id);
        else data.namazLog.push({ id, date: day, prayer: key, at: D.stamp() });
      }, null, false);
    }

    function editZikr(id) {
      const old = id && D.byId(current().zikrItems, id);
      const defaultWhen = Object.hasOwn(D.PRAYERS, state.zikrSlot) ? 'after' : state.zikrSlot;
      const item = { title: '', arabic: '', meaning: '', target: 1, when: defaultWhen, reference: '', ...old };
      dialogForm('zikr-form', old ? 'Edit written zikr' : 'Add written zikr',
        input('title', 'Name or transliteration', item.title, { wide: true, extra: ' maxlength="200" data-initial-focus' }) +
        textarea('arabic', 'Written zikr words', item.arabic) + textarea('meaning', 'Meaning (optional)', item.meaning) +
        select('when', 'Session', D.ZIKR_WHEN, item.when) +
        input('target', 'Count', item.target, { type: 'number', extra: ' min="1" max="' + D.ZIKR_MAX + '"' }) +
        input('reference', 'Reference (optional)', item.reference, { wide: true }) +
        '<div class="wide">' + check('required', 'Required for my routine', item.required) +
        (old ? check('archived', 'Archive for future days', item.archived) : '') + '</div>', 'Save zikr', old || null);
    }

    async function saveZikr(form, old) {
      const values = new FormData(form);
      const arabic = formValue(values, 'arabic').trim();
      const reference = D.tidy(values.get('reference'));
      const row = D.validateZikr({
        id: old?.id ?? D.uid(), title: D.tidy(values.get('title')), arabic, meaning: formValue(values, 'meaning').trim(),
        target: Number(values.get('target')), when: formValue(values, 'when'), reference,
        source: old?.arabic === arabic && old?.reference === reference ? old.source || '' : '',
        required: values.has('required'), archived: values.has('archived'), updatedAt: D.stamp()
      });
      await commit(data => {
        const latest = old && D.byId(data.zikrItems, old.id);
        if (old && (!latest || latest.updatedAt !== old.updatedAt)) throw new Error('This zikr changed. Open it again before saving.');
        if (latest) Object.assign(latest, row);
        else data.zikrItems.push(row);
      }, 'Written zikr saved.');
    }

    async function countZikr({ id, step, date: day, slot }) {
      if (!Object.hasOwn(D.ZIKR_SLOTS, slot) || !D.parseDate(day)) return;
      await commit(data => {
        const item = D.byId(data.zikrItems, id);
        const logId = D.zikrLogId(day, slot, id);
        const log = D.byId(data.zikrLog, logId);
        if (!item || !log && (item.archived || !D.zikrFor(item, slot))) return false;
        if (step === 'reset') {
          data.zikrLog = data.zikrLog.filter(row => row.id !== logId);
          return;
        }
        const target = log?.target || item.target;
        const count = step === 'done' ? target : Math.min(target, (log?.count || 0) + 1);
        if (log) Object.assign(log, { count, at: D.stamp() });
        else data.zikrLog.push({ id: logId, date: day, slot, itemId: item.id, title: item.title, count, target, at: D.stamp() });
      }, null, false);
    }

    async function saveFaithNote(form) {
      const values = new FormData(form);
      const day = state.date;
      const noteStyles = N.capture(values);
      const text = formValue(values, 'body');
      const body = noteStyles ? text : text.trim();
      await commit(data => {
        data.faithNotes = data.faithNotes.filter(row => row.date !== day);
        if (body || noteStyles) data.faithNotes.push({ id: day, date: day, body, noteStyles, updatedAt: D.stamp() });
      }, 'Faith diary saved.');
    }

    return {
      stickyPage, stickyDock, workPage, faithPage, faithSummary, change, applyStickySizes,
      forms: { 'sticky-add': addSticky, 'sticky-new-form': addSticky, 'sticky-form': saveSticky, 'sticky-layout-form': saveLayout, 'work-rule-form': saveWork,
        'namaz-form': saveNamaz, 'namaz-paste-form': saveNamaz, 'zikr-form': saveZikr, 'faith-note-form': saveFaithNote },
      actions: {
        'sticky-edit': data => editSticky(data.id), 'sticky-new': newSticky, 'sticky-pin': pinSticky, 'sticky-move': moveSticky,
        'sticky-reorder': (_, button) => {
          const region = button.closest('main');
          state.stickyReorder = !state.stickyReorder;
          render();
          region.querySelector('[data-action="sticky-reorder"]')?.focus({ preventScroll: true });
        },
        'sticky-layout': stickyLayout, 'sticky-detail': () => { state.stickyDetailed = !state.stickyDetailed; render(); },
        'sticky-capture': newSticky,
        'work-edit': data => workEdit(data.id, data.preset), 'work-plan': planWork,
        'work-manual': data => manualWork(data.id), 'work-queue': data => manualWork(null, data.heading),
        'namaz-edit': editNamaz, 'namaz-paste': pasteNamaz, 'namaz-check': markPrayer,
        'zikr-edit': data => editZikr(data.id), 'zikr-count': countZikr
      }
    };
  };
})(Diary);
