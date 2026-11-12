/* Work portfolios and a diary update log. Linked work stays in the main entry list. */
(function (D) {
  'use strict';

  const levels = { unit: 'Unit · Production South', plant: 'Plant · CAN', ffl: 'FFL' };
  const statuses = { active: 'Active', upcoming: 'Upcoming', ended: 'Period ended', completed: 'Completed' };
  const linkable = row => row.type === 'task' || row.type === 'followup';
  const active = (data, id) => {
    const row = id && D.byId(data.assignments, id);
    return row && !row.deletedAt ? row : null;
  };
  const status = (row, today = D.parts().date) => row.completedAt ? 'completed' :
    row.endDate && row.endDate < today ? 'ended' : row.assignedDate > today ? 'upcoming' : 'active';
  const roleLabel = row => row.assignedRole || D.ASSIGNERS[D.workflow.personRole(row.assignedBy)] || '';
  const linkedEntries = (data, id) => data.entries.filter(row => linkable(row) && D.active(row) && D.same(row.portfolioId, id));
  const date = value => typeof value === 'string' && !!value && D.parseDate(value) === value;
  const stamp = value => typeof value === 'string' && Number.isFinite(Date.parse(value));

  function validate(data) {
    const title = row => typeof row.title === 'string' && !!D.tidy(row.title) && typeof row.body === 'string';
    for (const row of data.assignments) {
      if (!title(row) || !Object.hasOwn(levels, row.level) || !date(row.assignedDate) ||
          (row.endDate && (!date(row.endDate) || row.endDate < row.assignedDate)) ||
          (row.followDate && !date(row.followDate)) || (row.followTime && (!row.followDate || !D.timePattern.test(row.followTime))) ||
          (row.completedAt && !stamp(row.completedAt)) || typeof row.assignedBy !== 'string' || typeof row.assignedRole !== 'string') {
        throw new Error('An assignment has an invalid title, source or date.');
      }
    }
    for (const row of data.updateNotes) {
      if (!title(row) || !stamp(row.createdAt) || (row.appliedAt && !stamp(row.appliedAt))) {
        throw new Error('An Update Log entry has an invalid title or date.');
      }
    }
    for (const row of data.entries) {
      if (row.portfolioId && (!linkable(row) || typeof row.portfolioId !== 'string' || row.portfolioId.length > 500)) {
        throw new Error('An entry has an invalid assignment link.');
      }
    }
  }

  D.portfolio = { levels, statuses, status, active, roleLabel, linkedEntries, linkable, validate };

  D.createPortfolioTools = function (ui) {
    const { state, current, now, E, btn, chip, empty, page, panel, select, input, dateInput, readDate, formValue, progressPanel = () => '',
      openDialog, closeDialog, commit, render, navigate, assignerInput, copyText, removeRecord, ask } = ui;
    const N = D.notebook;
    const format = D.formatDate;
    const byTitle = (a, b) => a.title.localeCompare(b.title);

    function requireRow(data, collection, id) {
      const row = D.byId(data[collection], id);
      if (!row || row.deletedAt) throw new Error('This record is in Deleted items or is no longer available.');
      return row;
    }

    function statusChip(row) {
      const key = status(row, now().date);
      return chip(statuses[key], ({ active: 'blue', ended: 'warn', completed: 'green' })[key]);
    }

    function owner(row) {
      return [row.assignedBy, roleLabel(row)].filter(Boolean).join(' · ');
    }

    function period(row) {
      return 'Assigned ' + format(row.assignedDate) + (row.endDate ? ' · Through ' + format(row.endDate) : row.completedAt ? '' : ' · Open-ended');
    }

    function nextFollowup(rows) {
      const dates = rows.filter(D.open).map(row => row.followDate || (row.type === 'followup' ? row.dueDate : '')).filter(Boolean).sort();
      return dates.length ? '<p class="muted">Next linked follow-up ' + E(format(dates[0])) + '</p>' : '';
    }

    function entryField(row) {
      const parent = D.hierarchy.index(current()).parent(row);
      if (parent) return '<p class="muted wide">' + E('Assignment follows ' + parent.title) + '</p>';
      const assignments = current().assignments.filter(item => !item.deletedAt).sort(byTitle);
      if (!assignments.length && !row.portfolioId) return '';
      const choices = { '': 'No assignment', ...Object.fromEntries(assignments.map(item =>
        [item.id, item.title + ' · ' + levels[item.level]])) };
      if (row.portfolioId && !Object.hasOwn(choices, row.portfolioId)) {
        const old = D.byId(current().assignments, row.portfolioId);
        choices[row.portfolioId] = old ? old.title + ' (deleted)' : 'Assignment unavailable';
      }
      return select('portfolioId', 'Assignment', choices, row.portfolioId);
    }

    function entryLink(row) {
      const assignment = active(current(), row.portfolioId);
      return assignment ? btn(assignment.title, 'portfolio-open', { id: assignment.id },
        { cls: 'person-chip portfolio-link', icon: 'link', label: 'Open assignment ' + assignment.title }) : '';
    }

    function entryActions(row, tree) {
      if (row.type !== 'task' || !D.active(row) || row.virtual) return '';
      const sticky = D.workflow.isSticky(row);
      const options = [
        btn(sticky ? 'Convert to task' : 'Show as sticky', 'task-sticky', { id: row.id, show: sticky ? 'no' : 'yes' }, { cls: 'small' })
      ];
      const assignment = active(current(), row.portfolioId);
      options.push(assignment ? btn('Make a separate assignment', 'portfolio-from-task', { id: row.id }, { cls: 'small' }) :
        btn('Make an assignment', 'portfolio-from-task', { id: row.id }, { cls: 'small' }));
      const parent = tree.parent(row);
      if (parent) options.push(btn('Open parent task', 'entry-view', { id: parent.id }, { cls: 'small' }));
      return '<div class="actions work-conversion-actions">' + options.join('') + '</div>';
    }

    function scheduleAction(row, date = '', options = {}) {
      return btn('Schedule as task', 'quick-task', { assignment: row.id, schedule: 'yes', date },
        { cls: 'small', icon: 'calendar', label: 'Schedule ' + row.title + ' as a task', ...options });
    }

    function assignmentDetail(row) {
      const data = current();
      const tree = D.hierarchy.index(data);
      const items = D.hierarchy.assignmentRoots(data, row.id, tree);
      const ordered = (a, b) => Number(D.open(b)) - Number(D.open(a)) ||
        (a.followDate || a.dueDate || '9999').localeCompare(b.followDate || b.dueDate || '9999') || byTitle(a, b);
      const work = D.progress.assignment(data, row, tree);
      const context = [levels[row.level], owner(row), period(row)].filter(Boolean).join(' · ');
      const itemRow = (item, nested = false) => {
        const home = D.workflow.isSticky(item) ? D.workflow.stickyLabel(item) + ' · Stickies' : item.type === 'task' ? 'Task · Tasks' : 'Follow-up · Work Registers';
        const required = nested || D.progress.required(item, tree);
        const branch = D.progress.task(item, tree);
        const details = [home, D.STATUS[item.status], required ? 'Required' : 'Supporting',
          branch.total ? branch.complete + '/' + branch.total + ' linked done' : D.open(item) && branch.percent > 0 && branch.percent + '%',
          'Planned ' + [format(item.date), item.time].filter(Boolean).join(' '),
          item.followDate && 'Follow up ' + [format(item.followDate), item.followTime].filter(Boolean).join(' '),
          item.dueDate && 'Due ' + [format(item.dueDate), item.dueTime].filter(Boolean).join(' ')].filter(Boolean).join(' · ');
        const children = tree.children(item);
        const result = item.type === 'task' ? btn('Record result', 'progress-edit', { id: item.id, result: 'yes' }, { cls: 'small' }) :
          btn('Log update', 'progress-edit', { id: item.id }, { cls: 'small' });
        return '<article class="row assignment-linked"><div class="row-main">' + btn(item.title, 'entry-view', { id: item.id }, { cls: 'row-title' }) +
          '<small>' + E(details) + '</small></div><div class="actions">' + (item.type === 'task' && D.open(item) ?
            btn('Done', 'task-status', { id: item.id, status: 'done' }, { cls: 'small', disabled: branch.remaining > 0, label: 'Complete ' + item.title }) : '') +
          '<details class="assignment-item-options" data-keep-open="assignment-item-' + E(item.id) + '"><summary>Actions</summary><div class="actions">' +
          result + (item.type === 'task' ? btn(D.workflow.isSticky(item) ? 'Convert to task' : 'Show as sticky',
            'task-sticky', { id: item.id, show: D.workflow.isSticky(item) ? 'no' : 'yes' }, { cls: 'small' }) : '') + (D.open(item) ?
            btn('Adjust', 'plan-adjust-task', { id: item.id }, { cls: 'small', label: 'Adjust ' + item.title }) : '') +
          (nested || item.assignmentPlan || children.length ? '' : btn(required ? 'Make supporting' : 'Make required', 'portfolio-require',
            { id: row.id, entry: item.id, required: required ? 'no' : 'yes' }, { cls: 'small' })) +
          (nested ? '' : btn('Unlink', 'portfolio-unlink', { id: row.id, entry: item.id }, { cls: 'text-button small', label: 'Unlink ' + item.title })) +
          '</div></details></div></article>' +
          (children.length ? '<details class="assignment-branch" data-keep-open="assignment-branch-' + E(item.id) + '"><summary>Linked work (' +
            children.length + ')</summary>' + children.map(child => itemRow(child, true)).join('') + '</details>' : '');
      };
      const groups = [
        ['Tasks', items.filter(item => item.type === 'task' && !D.workflow.isSticky(item))],
        ['Stickies', items.filter(D.workflow.isSticky)],
        ['Follow-ups', items.filter(item => item.type === 'followup')]
      ];
      const rows = groups.filter(([, list]) => list.length).map(([label, list]) => '<section class="assignment-group"><h3>' + E(label) +
        ' <span>' + list.length + '</span></h3>' + list.sort(ordered).map(item => itemRow(item)).join('') + '</section>').join('');
      const ready = work.total && !work.remaining && !row.completedAt;
      const more = '<details class="workspace-options"><summary>Assignment options</summary><div class="actions">' +
        btn('Edit assignment', 'portfolio-edit', { id: row.id }, { cls: 'small' }) +
        (row.completedAt ? '' : btn('Plan work time', 'plan-adjust-task', { assignment: row.id }, { cls: 'small' })) +
        btn('Add follow-up item', 'add', { type: 'followup', 'portfolio-id': row.id, date: now().date, 'assigned-by': row.assignedBy }, { cls: 'small' }) +
        (ready ? '' : btn(row.completedAt ? 'Undo completion' : 'Mark assignment complete', 'portfolio-status',
          { id: row.id, complete: row.completedAt ? 'no' : 'yes' }, { cls: 'small', disabled: !row.completedAt && work.remaining > 0 })) + '</div></details>';
      return page('', row.title, context, btn('All assignments', 'navigate', { view: 'assignments' }, { icon: 'left', cls: 'small' }) +
        scheduleAction(row, '', { cls: 'primary small' }) +
        btn('Add several tasks', 'work-batch', { id: row.id, kind: 'tasks' }, { cls: 'small' }) +
        btn('Add sticky', 'sticky-new', { assignment: row.id }, { cls: 'small', icon: 'plus' })) +
        '<div class="workspace-switch">' + statusChip(row) + (ready ? chip('Ready to close', 'green') +
          btn('Close assignment', 'portfolio-status', { id: row.id, complete: 'yes' }, { cls: 'small primary' }) : '') + more + '</div>' +
        '<div class="stack">' + progressPanel(row, 'assignment', tree) + N.render(row.body, row.noteStyles?.body) + nextFollowup(linkedEntries(data, row.id)) +
        panel('Linked work', rows || empty('Add a task or sticky for this assignment.'),
          btn('Link existing work', 'portfolio-link', { id: row.id }, { cls: 'small', icon: 'link' }),
          items.length ? items.filter(D.open).length + ' of ' + items.length + ' open' : '') + '</div>';
    }

    function assignmentsPage() {
      const data = current();
      const today = state.portfolioDay = now().date;
      const selected = active(data, state.portfolioId);
      if (selected) return assignmentDetail(selected);
      const all = data.assignments.filter(row => !row.deletedAt);
      const years = D.unique(all.map(row => row.assignedDate.slice(0, 4))).sort().reverse();
      const yearOptions = { '': 'All years', ...Object.fromEntries(years.map(year => [year, year])) };
      const filters = '<form id="portfolio-filter-form" class="toolbar-filter">' +
        select('level', 'Assigned from', { '': 'All sources', ...levels }, state.portfolioLevel) +
        select('status', 'Status', { '': 'All statuses', ...statuses }, state.portfolioStatus) +
        select('year', 'Year assigned', yearOptions, state.portfolioYear) + '<button type="submit">Apply filters</button>' +
        btn('Clear', 'portfolio-clear', {}, { cls: 'text-button' }) + '</form>';
      const mode = state.portfolioView || 'open';
      const tree = D.hierarchy.index(data);
      const rows = all.filter(row => (mode === 'all' || (mode === 'completed') === !!row.completedAt) && (!state.portfolioLevel || row.level === state.portfolioLevel) &&
        (!state.portfolioStatus || status(row, today) === state.portfolioStatus) &&
        (!state.portfolioYear || row.assignedDate.startsWith(state.portfolioYear))).sort((a, b) =>
        Number(status(b, today) === 'active') - Number(status(a, today) === 'active') ||
        b.assignedDate.localeCompare(a.assignedDate) || byTitle(a, b));
      const cards = rows.map(row => {
        const work = D.progress.assignment(data, row, tree);
        const text = [levels[row.level], owner(row), row.endDate && 'Through ' + format(row.endDate),
          work.total ? work.complete + '/' + work.total + ' required done' : row.progressPercent > 0 && work.percent + '% complete',
          !row.completedAt && row.followDate && 'Follow up ' + format(row.followDate)].filter(Boolean).join(' · ');
        return '<article class="row assignment-linked"><div class="row-main">' + btn(row.title, 'portfolio-open', { id: row.id }, { cls: 'row-title' }) +
          '<small>' + E(text) + '</small></div>' + (status(row, today) !== 'active' ? statusChip(row) : '') +
          '<div class="actions">' + scheduleAction(row) +
          btn('Edit', 'portfolio-edit', { id: row.id }, { cls: 'small', label: 'Edit ' + row.title }) + '</div></article>';
      }).join('');
      const modes = Object.entries({ open: 'Open', completed: 'Completed', all: 'All' }).map(([value, label]) =>
        btn(label, 'portfolio-view', { value }, { pressed: mode === value })).join('');
      const filtered = state.portfolioLevel || state.portfolioStatus || state.portfolioYear;
      return page('', 'Assignments', 'Longer work with its tasks and stickies.', btn('New assignment', 'portfolio-edit', {}, { cls: 'primary', icon: 'plus' })) +
        '<div class="workspace-switch"><div class="tabs" aria-label="Assignment status">' + modes + '</div>' +
        '<details class="workspace-options"' + (filtered ? ' open' : '') + '><summary>Filters</summary>' + filters + '</details></div>' +
        '<div class="simple-list rows">' + (cards || empty(all.length ? 'No assignments match this view.' : 'Use New assignment to start.')) + '</div>';
    }

    function editAssignment({ id }) {
      const row = id ? requireRow(current(), 'assignments', id) : null;
      const fields = input('title', 'Assignment title', row?.title, { wide: true, extra: ' maxlength="500" data-initial-focus' }) +
        select('level', 'Assigned from', levels, row?.level || 'plant') + assignerInput(row?.assignedBy, 'portfolio-assigners') +
        input('assignedRole', 'Role or team (optional)', row?.assignedRole, { wide: true, extra: ' maxlength="120"' }) +
        dateInput('assignedDate', 'Assigned on', row?.assignedDate || now().date) + dateInput('endDate', 'Through date (optional)', row?.endDate) +
        N.field('body', 'Portfolio scope and notes', row?.body);
      openDialog('portfolio-edit', row ? 'Edit assignment' : 'New assignment', '<form id="portfolio-form" class="form-grid" novalidate>' +
        fields + '</form>', (row ? btn('Delete assignment', 'portfolio-delete', { id }, { cls: 'danger' }) : btn('Cancel', 'close-dialog')) +
        '<button type="submit" form="portfolio-form" class="primary">Save assignment</button>', { row });
    }

    function assignmentFromTask({ id }) {
      const data = current();
      const row = D.byId(data.entries, id);
      if (!row || row.type !== 'task' || !D.active(row)) throw new Error('This item is no longer available.');
      const parent = D.hierarchy.index(data).parent(row);
      const existing = active(data, row.portfolioId);
      const context = parent || existing ?
        'Creates a linked task in the new assignment. The original stays with ' + (parent?.title || existing.title) + '.' :
        'The original task and its linked work will be kept inside the new assignment.';
      const fields = input('title', 'Assignment title', row.title, { wide: true, extra: ' maxlength="500" data-initial-focus' }) +
        select('level', 'Assigned from', levels, existing?.level || 'plant') +
        dateInput('assignedDate', 'Assigned on', now().date) + dateInput('endDate', 'Through date (optional)', '') +
        N.field('body', 'Assignment notes (optional)', '');
      openDialog('portfolio-from-task', parent || existing ? 'Make a separate assignment' : 'Make an assignment', '<p class="muted">' + E(context) + '</p>' +
        '<form id="portfolio-from-task-form" class="form-grid" novalidate>' + fields + '</form>',
        btn('Cancel', 'close-dialog') + '<button type="submit" form="portfolio-from-task-form" class="primary">Create assignment</button>',
        { row });
    }

    async function saveAssignmentFromTask(form, previous) {
      const values = new FormData(form);
      const title = D.tidy(values.get('title'));
      const level = formValue(values, 'level');
      const assignedDate = readDate(values, 'assignedDate', 'the assigned date', true);
      const endDate = readDate(values, 'endDate', 'the through date');
      if (!title || title.length > 500 || !Object.hasOwn(levels, level)) throw new Error('Enter an assignment title and source.');
      if (endDate && endDate < assignedDate) throw new Error('The through date must be on or after the assigned date.');
      const id = D.uid();
      await commit(data => {
        const row = D.byId(data.entries, previous.id);
        if (!row || !D.active(row) || row.type !== 'task' || row.editToken !== previous.editToken) {
          throw new Error('This task changed. Reopen it before creating an assignment.');
        }
        const at = D.stamp();
        const parent = D.hierarchy.index(data).parent(row);
        const earlier = active(data, row.portfolioId);
        data.assignments.push({ id, title, level, assignedDate, endDate, body: formValue(values, 'body'),
          noteStyles: N.capture(values), assignedBy: row.assignedBy || '', assignedRole: '', createdAt: at, updatedAt: at, editToken: D.uid() });
        if (parent || earlier) {
          D.workTask(data, { title: row.title, body: D.str(row.body), noteStyles: row.noteStyles?.body ? { body: row.noteStyles.body } : undefined,
            scope: row.scope, date: row.date > assignedDate ? row.date : assignedDate, priority: row.priority || 'normal',
            portfolioId: id, assignedBy: row.assignedBy || '', links: [row.id], sourceTaskId: row.id,
            history: [{ at, action: 'Created from linked work · ' + row.title }] }, at);
        } else {
          row.stickyCard = false;
          row.stickyPinned = false;
          delete row.assignmentPlan;
          delete row.assignmentRequired;
          attach(row, id, title);
        }
      }, 'Assignment created from the task.', true, false);
      closeDialog(true);
      state.portfolioId = id;
      await navigate('assignments');
    }

    function linkPicker({ id }) {
      const data = current();
      const assignment = requireRow(data, 'assignments', id);
      const tree = D.hierarchy.index(data);
      const candidates = data.entries.filter(row => linkable(row) && D.active(row) && !tree.parent(row) && !active(data, row.portfolioId)).sort(byTitle);
      const rows = candidates.map(row => '<label class="check" data-link-row><input type="checkbox" name="entry" value="' + E(row.id) +
        '"><span>' + E(row.title) + ' <small>' + E([D.workflow.isSticky(row) ? D.workflow.stickyLabel(row) : D.TYPES[row.type],
          D.STATUS[row.status], format(row.date)].join(' · ')) + '</small></span></label>').join('');
      openDialog('portfolio-link', 'Link items to ' + assignment.title, rows ?
        '<form id="portfolio-link-form" novalidate>' + input('linkSearch', 'Find a task or follow-up', '', { extra: ' data-link-filter data-initial-focus' }) +
        '<div class="link-picker">' + rows + '</div></form>' : empty('All available items already belong to an assignment.'),
      btn('Close', 'close-dialog') + (rows ? '<button type="submit" form="portfolio-link-form" class="primary">Link selected items</button>' : ''),
      { row: assignment });
    }

    function attach(row, id, label) {
      const at = D.stamp();
      Object.assign(row, { portfolioId: id, updatedAt: at, editToken: D.uid(),
        history: [...D.list(row.history), { at, action: (id ? 'Linked to ' : 'Unlinked from ') + 'assignment · ' + label }] });
    }

    async function saveRecord(collection, form, previous) {
      const values = new FormData(form);
      const title = D.tidy(values.get('title'));
      if (!title || title.length > 500) throw new Error('Enter a title of up to 500 characters.');
      const at = D.stamp();
      const row = { ...previous, id: previous?.id ?? D.uid(), title, body: formValue(values, 'body'),
        noteStyles: N.capture(values, previous?.noteStyles), createdAt: previous?.createdAt || at, updatedAt: at, editToken: D.uid() };
      if (collection === 'assignments') {
        const assignedDate = readDate(values, 'assignedDate', 'the assigned date', true);
        const endDate = readDate(values, 'endDate', 'the through date');
        if (endDate && endDate < assignedDate) throw new Error('The through date must be on or after the assigned date.');
        Object.assign(row, { assignedDate, endDate, level: formValue(values, 'level'), assignedBy: D.tidy(values.get('assignedBy')),
          assignedRole: D.tidy(values.get('assignedRole')) });
      }
      await commit(data => {
        if (previous) {
          const saved = requireRow(data, collection, row.id);
          if (saved.editToken !== previous.editToken) throw new Error('This record changed in another tab. Reopen it to make your edits.');
          data[collection][data[collection].indexOf(saved)] = row;
        } else data[collection].push(row);
      }, collection === 'assignments' ? 'Assignment saved.' : 'Change saved.', true, false);
      if (collection === 'assignments') state.portfolioId = row.id;
      render();
    }

    async function setStamp(collection, id, field, set, message) {
      await commit(data => {
        const row = requireRow(data, collection, id);
        if (Boolean(row[field]) === set) return false;
        if (collection === 'assignments' && set && D.progress.assignment(data, row).remaining) {
          throw new Error('Complete the required linked work before closing this assignment.');
        }
        const at = D.stamp();
        Object.assign(row, { [field]: set ? at : '', updatedAt: at, editToken: D.uid() });
      }, message);
    }

    function updatesPage() {
      const rows = current().updateNotes.filter(row => !row.deletedAt).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      const list = items => items.map(row => '<article class="row change-row"><div class="row-main"><strong>' + E(row.title) +
        '</strong><p class="muted">' + E(row.appliedAt ? 'Applied ' + D.formatStamp(row.appliedAt) : 'Logged ' + D.formatStamp(row.createdAt)) + '</p>' +
        N.render(row.body, row.noteStyles?.body) + '</div><div class="actions">' +
        btn('Edit', 'update-edit', { id: row.id }, { cls: 'small', label: 'Edit ' + row.title }) +
        btn(row.appliedAt ? 'Reopen' : 'Mark applied', 'update-status', { id: row.id, applied: row.appliedAt ? 'no' : 'yes' },
          { cls: 'small', label: (row.appliedAt ? 'Reopen ' : 'Mark applied ') + row.title }) + '</div></article>').join('');
      const pending = rows.filter(row => !row.appliedAt);
      const applied = rows.filter(row => row.appliedAt);
      return page('DEVICE', 'Update Log', 'Record changes you want in the next diary update. Mark them applied when they are included.',
        btn('Copy pending changes', 'update-copy', {}, { disabled: !pending.length }) + btn('Add change', 'update-edit', {}, { cls: 'primary', icon: 'plus' })) +
        '<div class="stack">' + panel('For the next update', pending.length ? '<div class="rows">' + list(pending) + '</div>' : empty('No pending changes.')) +
        panel('Applied changes', applied.length ? '<div class="rows">' + list(applied) + '</div>' : empty('No applied changes.')) + '</div>';
    }

    function editUpdate({ id }) {
      const row = id ? requireRow(current(), 'updateNotes', id) : null;
      openDialog('update-edit', row ? 'Edit change' : 'Add change', '<form id="update-note-form" class="form-grid" novalidate>' +
        input('title', 'Change title', row?.title, { wide: true, extra: ' maxlength="500" data-initial-focus' }) +
        N.field('body', 'What should change', row?.body) + '</form>',
      (row ? btn('Delete change', 'update-delete', { id }, { cls: 'danger' }) : btn('Cancel', 'close-dialog')) +
        '<button type="submit" form="update-note-form" class="primary">Save change</button>', { row });
    }

    return {
      assignmentsPage, updatesPage, entryField, entryLink, entryActions,
      actions: {
        'portfolio-open': ({ id }) => {
          requireRow(current(), 'assignments', id);
          closeDialog(true);
          state.portfolioId = id;
          return navigate('assignments');
        },
        'portfolio-edit': editAssignment,
        'portfolio-from-task': assignmentFromTask,
        'portfolio-view': ({ value }) => {
          if (!['open', 'completed', 'all'].includes(value)) return;
          state.portfolioView = value;
          state.portfolioStatus = '';
          render();
        },
        'portfolio-link': linkPicker,
        'portfolio-clear': () => { state.portfolioLevel = state.portfolioStatus = state.portfolioYear = ''; render(); },
        'portfolio-status': ({ id, complete }) => setStamp('assignments', id, 'completedAt', complete === 'yes',
          complete === 'yes' ? 'Assignment completed.' : 'Assignment completion cleared.'),
        'portfolio-require': ({ id, entry, required }) => commit(data => {
          const parent = requireRow(data, 'assignments', id);
          const row = D.byId(data.entries, entry);
          const tree = D.hierarchy.index(data);
          if (!row || !D.active(row) || row.assignmentPlan || !D.same(row.portfolioId, id) || tree.parent(row) || tree.children(row).length) return false;
          const at = D.stamp();
          Object.assign(row, { assignmentRequired: required === 'yes', updatedAt: at, editToken: D.uid(),
            history: [...D.list(row.history), { at, action: (required === 'yes' ? 'Required work' : 'Supporting work') + ' · ' + parent.title }] });
        }, 'Assignment requirement saved.'),
        'portfolio-unlink': ({ id, entry }) => commit(data => {
          const parent = requireRow(data, 'assignments', id);
          const row = D.byId(data.entries, entry);
          if (!row || !D.active(row) || !D.same(row.portfolioId, id) || D.hierarchy.index(data).parent(row)) return false;
          attach(row, '', parent.title);
        }, 'Item unlinked.'),
        'portfolio-delete': ({ id }) => ask('Delete this assignment?', 'Recover the portfolio and its links from Deleted items.',
          'Delete assignment', () => removeRecord('assignments', id)),
        'update-edit': editUpdate,
        'update-status': ({ id, applied }) => setStamp('updateNotes', id, 'appliedAt', applied === 'yes',
          applied === 'yes' ? 'Change marked applied.' : 'Change reopened.'),
        'update-delete': ({ id }) => ask('Delete this change?', 'You can recover it from Deleted items.', 'Delete change', () => removeRecord('updateNotes', id)),
        'update-copy': () => copyText('Changes for the next diary update\n\n' + current().updateNotes.filter(row => !row.deletedAt && !row.appliedAt)
          .map((row, index) => (index + 1) + '. ' + row.title + (row.body ? '\n' + row.body : '')).join('\n\n'), 'Pending diary changes')
      },
      forms: {
        'portfolio-form': (form, row) => saveRecord('assignments', form, row),
        'portfolio-from-task-form': saveAssignmentFromTask,
        'update-note-form': (form, row) => saveRecord('updateNotes', form, row),
        'portfolio-link-form': (form, assignment) => {
          const ids = D.unique(new FormData(form).getAll('entry'));
          if (!ids.length) throw new Error('Choose at least one task or follow-up.');
          return commit(data => {
            const parent = requireRow(data, 'assignments', assignment.id);
            const tree = D.hierarchy.index(data);
            for (const id of ids) {
              const row = D.byId(data.entries, id);
              if (!row || !D.active(row) || !linkable(row)) throw new Error('An item is no longer available. Reopen the list.');
              if (D.same(row.portfolioId, parent.id)) continue;
              if (tree.parent(row)) throw new Error('Link the parent task to include its child work.');
              if (active(data, row.portfolioId)) throw new Error('An item already belongs to another assignment. Reopen the list.');
              attach(row, String(parent.id), parent.title);
            }
          }, 'Selected items linked.');
        }
      },
      filter(form) {
        const values = new FormData(form);
        state.portfolioLevel = formValue(values, 'level');
        state.portfolioStatus = formValue(values, 'status');
        if (state.portfolioStatus) state.portfolioView = 'all';
        state.portfolioYear = formValue(values, 'year');
        render();
      }
    };
  };
})(Diary);
