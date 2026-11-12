/* Work dashboard over the same records used by Tasks, Stickies and Assignments. */
(function (D) {
  'use strict';

  const modes = { pending: 'All pending', day: 'Day', week: 'Week', month: 'Month' };
  const kinds = { task: 'Tasks', sticky: 'Stickies', assignment: 'Assignments' };
  const dayOfStamp = value => value && Number.isFinite(Date.parse(value)) ? D.parts(value).date : '';
  const kindsText = { task: 'Task', sticky: 'Sticky', assignment: 'Assignment', followup: 'Follow-up', mwr: 'MWR' };

  function pending(data, now = Date.now()) {
    const local = D.parts(now);
    const tree = D.hierarchy.index(data);
    const rows = [];
    const point = (label, date, time = '') => date ? { label, date, time: time || '' } : null;
    const dateOrder = (a, b) => a.date.localeCompare(b.date) || (a.time || '24:00').localeCompare(b.time || '24:00');
    const passed = ({ date, time }) => date < local.date || date === local.date && time && time < local.time;
    const touched = row => {
      const value = row.updatedAt || row.createdAt;
      return value && Number.isFinite(Date.parse(value)) ? D.parts(value) : null;
    };

    function add(row, kind, planned, due, follow) {
      const flags = [due, follow].filter(Boolean);
      const late = flags.filter(passed).sort(dateOrder)[0];
      const future = [planned, ...flags].filter(item => item && !passed(item)).sort(dateOrder)[0];
      const next = late || future;
      const reopened = D.list(row.history).findLast(item => item &&
        (item.action === 'Reopened because linked work is pending' || item.action === 'Status changed' && item.from === 'Done'));
      const readyDate = kind === 'assignment' ? row.assignedDate : row.originalDate || row.date;
      const reopenDate = dayOfStamp(reopened?.at);
      const since = (reopenDate > readyDate ? reopenDate : readyDate) || dayOfStamp(row.createdAt);
      const carried = !next && (planned ? passed(planned) : since && since < local.date);
      const work = kind === 'assignment' ? D.progress.assignment(data, row, tree) : D.progress.task(row, tree);
      rows.push({ row, kind, next, planned, due, follow, late: !!late, carried: !!carried,
        since, days: since && since <= local.date ? D.daysBetween(since, local.date) : 0,
        last: touched(row), work, parent: tree.parent(row), assignment: row.portfolioId && D.portfolio.active(data, row.portfolioId) });
    }

    for (const row of data.entries) {
      if (!D.progress.supports(row) || !D.open(row)) continue;
      const kind = row.type === 'task' ? D.workflow.isSticky(row) ? 'sticky' : 'task' : row.type;
      add(row, kind, point('Planned', row.date, row.time), point('Due', row.dueDate, row.dueTime),
        point('Follow up', row.followDate, row.followTime));
    }
    for (const row of data.assignments) {
      if (row.deletedAt || row.completedAt) continue;
      add(row, 'assignment', row.assignedDate > local.date ? point('Starts', row.assignedDate) : null,
        point('Through', row.endDate), point('Follow up', row.followDate, row.followTime));
    }
    const rank = item => item.late ? 0 : item.carried ? 1 : item.next?.date === local.date ? 2 : item.next ? 3 : 4;
    rows.sort((a, b) => rank(a) - rank(b) ||
      (a.next && b.next ? dateOrder(a.next, b.next) : a.since.localeCompare(b.since)) || D.manualOrder(a.row, b.row));
    return { rows, local };
  }

  function period(data, anchor, mode, now = Date.now()) {
    const [start, end] = mode === 'month' ? D.monthRange(anchor) :
      mode === 'week' ? [D.weekStart(anchor), D.addDays(D.weekStart(anchor), 6)] : [anchor, anchor];
    const today = D.parts(now);
    const inPeriod = date => !!date && date >= start && date <= end;
    const asOf = end < today.date ? { date: end, time: '23:59' } : today;
    const tree = D.hierarchy.index(data);
    const groups = Object.fromEntries(Object.keys(kinds).map(kind => [kind, { open: [], done: [], overdue: 0 }]));
    const followups = [];

    function follow(row, kind, date = row.followDate) {
      if (!date || !inPeriod(date) && !(date < start && end >= today.date)) return;
      const time = row.followTime || '';
      followups.push({ row, kind, date, time, overdue: date < today.date || date === today.date && !!time && time < today.time });
    }

    function count(row, kind, planned, due, dueTime, closed) {
      const group = groups[kind];
      if (inPeriod(closed)) group.done.push({ row, date: closed });
      if (closed && closed <= end || ![planned, due, row.followDate].some(date => date && date <= end)) return;
      const overdue = !!due && (due < asOf.date || due === asOf.date && !!dueTime && dueTime < asOf.time);
      const history = end < today.date ? D.list(row.progressUpdates).filter(item => item.date <= end)
        .sort((a, b) => b.date.localeCompare(a.date) || b.at.localeCompare(a.at)) : null;
      const percent = history ? history[0]?.percent : kind === 'assignment' ? D.progress.assignment(data, row, tree).percent : D.progress.task(row, tree).percent;
      group.open.push({ row, due, planned, overdue, percent });
      if (overdue) group.overdue++;
    }

    for (const row of data.entries) {
      if (!D.active(row) || !D.progress.supports(row)) continue;
      if (row.type === 'task') {
        const kind = D.workflow.isSticky(row) ? 'sticky' : 'task';
        const closed = D.open(row) ? '' : row.closedDate || dayOfStamp(row.completedAt) || D.taskDay(row);
        count(row, kind, D.taskDay(row), row.dueDate, row.dueTime, closed);
        if (D.open(row)) follow(row, kind);
      } else if (D.open(row)) {
        follow(row, row.type, row.followDate || (row.type === 'followup' ? row.dueDate || row.date : ''));
      }
    }
    for (const row of data.assignments) {
      if (row.deletedAt) continue;
      count(row, 'assignment', row.assignedDate, row.endDate, '', dayOfStamp(row.completedAt));
      if (!row.completedAt) follow(row, 'assignment');
    }
    for (const group of Object.values(groups)) {
      group.open.sort((a, b) => Number(b.overdue) - Number(a.overdue) ||
        (a.due || a.row.followDate || '9999').localeCompare(b.due || b.row.followDate || '9999') ||
        a.planned.localeCompare(b.planned) || D.manualOrder(a.row, b.row));
      group.done.sort((a, b) => b.date.localeCompare(a.date) || D.manualOrder(a.row, b.row));
    }
    followups.sort((a, b) => a.date.localeCompare(b.date) || (a.time || '24:00').localeCompare(b.time || '24:00') ||
      a.row.title.localeCompare(b.row.title));
    return { start, end, groups, followups };
  }

  D.dashboard = { period, pending };

  D.createDashboard = function ({ state, current, now, E, btn, empty, page, panel, dateNav, tabs }) {
    const date = D.formatDate;
    const link = (row, kind) => btn(row.title, kind === 'assignment' ? 'portfolio-open' : 'entry-view', { id: row.id }, { cls: 'row-title' });
    const pendingKinds = { all: 'All items', task: 'Tasks', sticky: 'Stickies', assignment: 'Assignments', followup: 'Follow-ups', mwr: 'MWRs' };

    function groupCard(kind, group) {
      const label = kinds[kind];
      const stats = [['Open', group.open.length], ['Completed', group.done.length], ['Overdue', group.overdue]];
      const counts = stats.map(([name, count]) => '<span' + (name === 'Overdue' && count ? ' class="late"' : '') +
        '><strong>' + count + '</strong>' + E(name) + '</span>').join('');
      const open = group.open.map(({ row, due, planned, overdue, percent }) => {
        const text = [due ? (overdue ? 'Overdue ' : 'Due ') + date(due) : 'Planned ' + date(planned),
          percent > 0 && percent + '%', row.followDate && 'Follow up ' + date(row.followDate)].filter(Boolean).join(' · ');
        return '<li>' + link(row, kind) + '<small' + (overdue ? ' class="late"' : '') + '>' + E(text) + '</small></li>';
      }).join('');
      const done = group.done.map(({ row, date: day }) => '<li>' + link(row, kind) + '<small>' + E(date(day)) + '</small></li>').join('');
      const section = kind === 'assignment' ? btn('Open Assignments', 'navigate', { view: 'assignments' }, { cls: 'small' }) :
        btn('Open ' + label, 'navigate', kind === 'sticky' ? { view: 'stickies', sub: 'shift' } :
          { view: 'tasks', sub: 'open', kind: 'task' }, { cls: 'small' });
      return '<details class="summary-card" data-keep-open="summary-' + kind + '"><summary><strong>' + E(label) +
        '</strong><span class="summary-counts">' + counts + '</span></summary><div class="summary-card-body">' +
        (open ? '<h3>Open through this period</h3><ul class="summary-items">' + open + '</ul>' : '') +
        (done ? '<h3>Completed in this period</h3><ul class="summary-items">' + done + '</ul>' : '') +
        (!open && !done ? empty('No items for this period.') : '') + section + '</div></details>';
    }

    function agenda(rows) {
      if (!rows.length) return empty('No follow-ups scheduled for this period.');
      const dates = new Map();
      for (const item of rows) {
        if (!dates.has(item.date)) dates.set(item.date, []);
        dates.get(item.date).push(item);
      }
      return '<div class="summary-agenda">' + [...dates].map(([day, items]) => '<section><h3>' + E(date(day)) +
        '</h3><ul class="summary-items">' + items.map(({ row, kind, time, overdue }) => '<li><div>' + link(row, kind) +
        '<small' + (overdue ? ' class="late"' : '') + '>' + E([kindsText[kind], time, overdue && 'Overdue', row.followStep || row.waitingOn].filter(Boolean).join(' · ')) +
        '</small></div>' + btn('Log update', 'progress-edit', { id: row.id, type: kind === 'assignment' ? 'assignment' : 'entry' },
          { cls: 'small', label: 'Log update for ' + row.title }) + '</li>').join('') + '</ul></section>').join('') + '</div>';
    }

    function pendingPage(data, local) {
      const { rows } = pending(data, D.instant(local.date, local.time || '00:00'));
      const filter = state.summaryKind || 'all';
      const counts = [['Pending', rows.length], ['Overdue', rows.filter(item => item.late).length],
        ['Today', rows.filter(item => !item.late && item.next?.date === local.date).length],
        ['Carried forward', rows.filter(item => item.carried).length]];
      const strip = '<div class="metric-strip pending-metrics">' + counts.map(([label, count]) =>
        '<div class="metric"><span>' + E(label) + '</span><strong>' + count + '</strong></div>').join('') + '</div>';
      const visible = rows.filter(item => filter === 'all' || item.kind === filter);
      const pointText = item => [item.label, date(item.date), item.time].filter(Boolean).join(' ');
      const statusText = item => item.kind === 'assignment' ? item.work.total && !item.work.remaining ? 'Ready to close' : 'Open' :
        D.STATUS[item.row.status] || D.MWR[item.row.status] || 'Open';
      const list = visible.map(item => {
        const { row, kind, next, due, follow, last, since, planned, late, carried } = item;
        const type = kind === 'sticky' ? D.workflow.stickyLabel(row) : kindsText[kind];
        const rest = [planned, due, follow].filter(event => event && event !== next).map(pointText);
        const pendingSince = item.days > 0 ? 'Pending since ' + date(since) + ' · ' + item.days + ' ' + (item.days === 1 ? 'day' : 'days') : '';
        const state = [type, statusText(item), row.waitingOn && 'Waiting on ' + row.waitingOn,
          item.work.total ? item.work.complete + '/' + item.work.total + ' linked done' :
          item.work.percent > 0 && item.work.percent + '%'].filter(Boolean).join(' · ');
        const context = D.unique([item.parent?.title, item.assignment?.title].filter(Boolean)).join(' · ');
        const when = next ? pointText(next) : carried ? 'Carried forward' : 'No date scheduled';
        const action = kind === 'assignment' ? btn('Schedule task', 'quick-task', { assignment: row.id, schedule: 'yes' }, { cls: 'small' }) :
          btn('Plan time', 'plan-adjust-task', { id: row.id }, { cls: 'small' });
        return '<article class="pending-row"><div class="pending-title">' + link(row, kind) + '<small>' + E(state) + '</small>' +
          (context ? '<small>' + E(context) + '</small>' : '') + '</div><div class="pending-schedule">' +
          '<strong' + (late ? ' class="late"' : '') + '>' + E(late ? 'Overdue · ' + when : when) + '</strong>' +
          (rest.length ? '<small>' + E(rest.join(' · ')) + '</small>' : '') +
          (pendingSince ? '<small>' + E(pendingSince) + '</small>' : '') +
          (last ? '<small>' + E('Last updated ' + [date(last.date), last.time].filter(Boolean).join(' ')) + '</small>' : '') +
          '</div><div class="actions pending-actions">' + action + '</div></article>';
      }).join('');
      return strip + tabs(pendingKinds, 'summaryKind', 'Pending work type') +
        panel('Pending work', list ? '<div class="pending-list">' + list + '</div>' : empty('No pending items match this view.'), '',
          visible.length + ' ' + (visible.length === 1 ? 'item' : 'items') + ' · ' + D.ZONE);
    }

    return function dashboard() {
      const data = current();
      const mode = state.summaryMode || 'pending';
      const local = now();
      const planner = btn('Open planner', 'navigate', { view: 'dayplan', sub: mode === 'pending' ? 'day' : mode,
        date: mode === 'pending' ? local.date : state.date }, { cls: 'small' });
      const coach = btn('Review & Coaching', 'navigate', { view: 'coach', date: mode === 'pending' ? local.date : state.date }, { cls: 'small' });
      const tools = '<div class="workspace-switch summary-switch">' + tabs(modes, 'summaryMode', 'Dashboard period') +
        '<div class="actions">' + planner + coach + '</div></div>';
      if (mode === 'pending') return page('', 'Dashboard', date(local.date)) + tools + pendingPage(data, local);
      const { start, end, groups, followups } = period(data, state.date, mode, D.instant(local.date, local.time || '00:00'));
      const range = date(start) + (start === end ? '' : ' – ' + date(end));
      return page('', 'Dashboard', range, dateNav()) + tools + '<div class="summary-grid">' +
        Object.keys(kinds).map(kind => groupCard(kind, groups[kind])).join('') + '</div>' +
        panel('Follow-ups by date', agenda(followups));
    };
  };
})(Diary);
