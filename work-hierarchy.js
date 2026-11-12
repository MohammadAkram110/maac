/* Completion rules for assignments, tasks and their child work. */
(function (D) {
  'use strict';

  const key = row => D.str(row.id);
  const required = (row, tree) => tree?.children(row).length > 0 || !row.assignmentPlan && row.assignmentRequired !== false;

  function index(data) {
    const tasks = new Map(data.entries.filter(row => row.type === 'task' && D.active(row)).map(row => [key(row), row]));
    const parents = new Map();
    for (const row of tasks.values()) {
      const parent = tasks.get(D.str(row.planParentId));
      if (parent && parent !== row) parents.set(key(row), parent);
    }
    const visited = new Set();
    for (const row of tasks.values()) {
      const path = new Set();
      for (let node = row; node && !visited.has(key(node)); node = parents.get(key(node))) {
        const id = key(node);
        if (path.has(id)) {
          // Old imports can contain a circular link. Keep the records and cut the cycle for the tree.
          parents.delete(id);
          break;
        }
        path.add(id);
      }
      for (const id of path) visited.add(id);
    }
    const branches = new Map();
    for (const [id, parent] of parents) {
      const parentId = key(parent);
      if (!branches.has(parentId)) branches.set(parentId, []);
      branches.get(parentId).push(tasks.get(id));
    }
    for (const rows of branches.values()) rows.sort(D.manualOrder);
    const parent = row => parents.get(key(row));
    const children = row => branches.get(key(row)) || [];
    const pending = new Set();
    const queue = [...tasks.values()].filter(D.open);
    for (const row of queue) {
      const above = parent(row);
      if (above && !pending.has(key(above))) {
        pending.add(key(above));
        queue.push(above);
      }
    }
    const blocked = row => pending.has(key(row));
    const openChildren = row => children(row).filter(item => D.open(item) || blocked(item));
    return { tasks, parent, children, blocked, openChildren };
  }

  function assignmentRoots(data, id, tree = index(data)) {
    return D.portfolio.linkedEntries(data, id).filter(row => !D.same(tree.parent(row)?.portfolioId, id));
  }

  function reconcile(data, previous, at = D.stamp()) {
    const tree = index(data);
    const old = previous && new Map(previous.entries.map(row => [key(row), row]));
    let changed = false;
    const ordered = [...tree.tasks.values()].filter(row => !tree.parent(row));
    for (const row of ordered) {
      const parent = tree.parent(row);
      const oldAssignment = parent && old?.get(key(parent))?.portfolioId;
      const portfolioId = parent?.portfolioId || (oldAssignment && D.same(row.portfolioId, oldAssignment) ? '' : row.portfolioId);
      if (parent && !D.same(row.portfolioId, portfolioId)) {
        Object.assign(row, { portfolioId: D.str(portfolioId), updatedAt: at, editToken: D.uid() });
        changed = true;
      }
      ordered.push(...tree.children(row));
      if (D.open(row) || !tree.blocked(row)) continue;
      const earlier = old?.get(key(row));
      if (earlier && D.open(earlier)) {
        throw new Error('Finish the linked work before closing “' + row.title + '”. ' + tree.openChildren(row)[0].title + ' is still open.');
      }
      const closedAt = row.completedAt;
      D.setTaskStatus(row, 'todo', at);
      row.history.push({ at, action: 'Reopened because linked work is pending', closedAt });
      changed = true;
    }
    for (const row of data.assignments) {
      if (!row.completedAt || row.deletedAt) continue;
      const pending = assignmentRoots(data, row.id, tree).find(item => required(item, tree) && (D.open(item) || tree.blocked(item)));
      if (!pending) continue;
      const earlier = previous && D.byId(previous.assignments, row.id);
      if (earlier && !earlier.completedAt) throw new Error('Finish “' + pending.title + '” before closing this assignment.');
      row.history = [...D.list(row.history), { at, action: 'Reopened because linked work is pending', closedAt: row.completedAt }];
      Object.assign(row, { completedAt: '', updatedAt: at, editToken: D.uid() });
      changed = true;
    }
    return changed;
  }

  D.hierarchy = { index, required, assignmentRoots, reconcile };

  D.createHierarchyUI = function (ui) {
    const { current, now, E, btn, dateInput, textarea, readDate, openDialog, commit } = ui;

    function taskPanel(row, tree = index(current())) {
      if (row.type !== 'task' || !D.active(row) || row.virtual) return '';
      const children = tree.children(row);
      const open = tree.openChildren(row);
      const canAdd = !D.workflow.isSticky(row) || children.length > 0;
      if (!canAdd && !children.length) return '';
      const items = children.map(item => '<li>' + btn(item.title, 'entry-view', { id: item.id }, { cls: 'row-title' }) +
        '<small>' + E([D.workflow.isSticky(item) ? D.workflow.stickyLabel(item) : 'Task',
          open.includes(item) ? D.STATUS[item.status] : 'Done', D.formatDate(item.date)].filter(Boolean).join(' · ')) + '</small></li>').join('');
      const label = !children.length ? '' : open.length ? open.length + ' open of ' + children.length :
        D.open(row) ? 'Ready to close' : 'All linked work complete';
      return '<section class="work-branch"><div class="panel-head"><div><h3>Linked work</h3>' +
        (label ? '<small>' + E(label) + '</small>' : '') + '</div>' + (canAdd ? '<div class="actions">' +
          btn('Add sticky', 'sticky-new', { entry: row.id }, { cls: 'small', icon: 'plus' }) +
          btn('Add several', 'work-batch', { id: row.id, kind: 'stickies' }, { cls: 'small' }) + '</div>' : '') + '</div>' +
        (items ? '<ul class="work-branch-items">' + items + '</ul>' : '') + '</section>';
    }

    function parentFor(data, kind, id) {
      if (kind === 'tasks') return D.portfolio.active(data, id);
      const task = D.byId(data.entries, id);
      return kind === 'stickies' && task?.type === 'task' && D.active(task) &&
        (!D.workflow.isSticky(task) || index(data).children(task).length > 0) ? task : null;
    }

    function batch({ id, kind }) {
      const parent = parentFor(current(), kind, id);
      if (!parent) throw new Error('This parent item is no longer available.');
      const today = now().date;
      const day = kind === 'tasks' ? parent.assignedDate : parent.date;
      openDialog('work-batch', 'Add ' + kind, '<p class="muted">' + E(parent.title) + '</p>' +
        '<form id="work-batch-form" class="form-grid" novalidate>' + dateInput('date', 'Planned date', day > today ? day : today) +
        textarea('items', 'One title per line', '', kind === 'tasks' ? 'Enter the tasks for this assignment' : 'Enter the steps for this task') +
        '</form>', btn('Cancel', 'close-dialog') + '<button class="primary" type="submit" form="work-batch-form">Add ' + E(kind) +
        '</button>', { row: { id, kind } });
    }

    async function saveBatch(form, { id, kind }) {
      const values = new FormData(form);
      const date = readDate(values, 'date', 'the planned date', true);
      const titles = D.str(values.get('items')).split(/\r?\n/).map(D.tidy).filter(Boolean);
      if (!titles.length || titles.some(title => title.length > 500)) throw new Error('Enter one or more titles of up to 500 characters each.');
      await commit(data => {
        const parent = parentFor(data, kind, id);
        if (!parent) throw new Error('This parent item changed. Open it again.');
        const fields = kind === 'tasks' ? { portfolioId: D.str(parent.id), scope: 'work' } :
          { portfolioId: parent.portfolioId || '', planParentId: parent.id, scope: parent.scope, stickyCard: true, stickyKind: 'day', stickyColour: 'yellow' };
        const at = D.stamp();
        for (const title of titles) D.workTask(data, { ...fields, title, date, assignedBy: parent.assignedBy || '' }, at);
      }, titles.length + ' ' + (titles.length === 1 ? kind === 'tasks' ? 'task' : 'sticky' : kind) + ' added.');
    }

    return { taskPanel, batch, saveBatch };
  };
})(Diary);
