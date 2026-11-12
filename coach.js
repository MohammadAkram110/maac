/* A local review of open work, one-on-ones and recorded time. */
(function (D) {
  'use strict';

  const modes = { actions: 'Next actions', meetings: 'One-on-ones', time: 'Week review' };

  function review(data, day) {
    const tree = D.hierarchy.index(data);
    const open = data.entries.filter(row => D.progress.supports(row) && D.planning.availableTask(data, row));
    const paused = new Set(D.shiftCompanion.activePauses(data).map(row => D.str(row.taskId)));
    const priority = Object.keys(D.planning.priorities);
    const candidates = open.filter(row => [row.type === 'task' ? D.taskDay(row) : row.date, row.dueDate, row.followDate]
      .some(date => date && date <= day)).map(row => {
      const due = D.dayPlan.deadlines(row, data)[0];
      const count = tree.openChildren(row).length;
      const reasons = D.shiftCompanion.blockers(data, row).map(item => item.title);
      if (count) reasons.unshift(count + ' linked ' + (count === 1 ? 'item' : 'items') + ' open');
      if (paused.has(D.str(row.id))) reasons.push('Paused');
      if (row.status === 'waiting' && (!row.followDate || row.followDate > day)) {
        reasons.push(row.waitingOn ? 'Waiting on ' + row.waitingOn : 'Waiting for a response');
      }
      return { row, due, reasons, rank: priority.indexOf(row.priority || 'normal') };
    }).sort((a, b) => Number(!!b.row.focus) - Number(!!a.row.focus) ||
      (a.due?.at ?? Infinity) - (b.due?.at ?? Infinity) || a.rank - b.rank || D.manualOrder(a.row, b.row));
    const close = candidates.filter(({ row, reasons }) => tree.children(row).length && !reasons.length);
    const closeAssignments = data.assignments.filter(row => {
      if (row.deletedAt || row.completedAt || row.assignedDate > day) return false;
      const work = D.progress.assignment(data, row, tree);
      return work.total > 0 && work.remaining === 0;
    });
    const closeIds = new Set(close.map(item => D.str(item.row.id)));
    return { ready: candidates.filter(({ row, reasons }) => !reasons.length && !closeIds.has(D.str(row.id))),
      waiting: candidates.filter(item => item.reasons.length), close, closeAssignments };
  }

  D.coach = { review };

  D.createCoachUI = function (ui) {
    const { state, current, now, E, btn, empty, page, panel, dateNav, render } = ui;
    const date = D.formatDate;
    let mode = 'actions';

    function workRows(items, blocked = false) {
      if (!items.length) return empty(blocked ? 'No waiting or blocked work for this date.' : 'No open next actions for this date.');
      return '<div class="rows">' + items.slice(0, 8).map(({ row, due, reasons }) => {
        const next = row.followStep || (row.status === 'waiting' && row.followDate <= state.date ? 'Follow up' : '');
        const detail = [reasons.join(' · '), due && due.label + ' ' + date(due.day), next].filter(Boolean).join(' · ');
        return '<article class="row"><div class="row-main">' + btn(row.title, 'entry-view', { id: row.id }, { cls: 'row-title' }) +
          (detail ? '<small>' + E(detail) + '</small>' : '') + '</div><div class="actions">' +
          (blocked ? btn('Log update', 'progress-edit', { id: row.id }, { cls: 'small' }) :
            btn('Plan time', 'plan-adjust-task', { id: row.id }, { cls: 'small' })) + '</div></article>';
      }).join('') + '</div>' + (items.length > 8 ?
        btn('See all open work', 'navigate', { view: 'tasks', sub: 'open', kind: 'all' }, { cls: 'small text-button' }) : '');
    }

    function actions() {
      const result = review(current(), state.date);
      const close = [...result.close.map(item => ({ row: item.row, action: 'entry-view' })),
        ...result.closeAssignments.map(row => ({ row, action: 'portfolio-open' }))];
      const ready = close.length ? panel('Ready to close', '<div class="rows">' + close.slice(0, 8).map(({ row, action }) =>
        '<article class="row">' + btn(row.title, action, { id: row.id }, { cls: 'row-title' }) + '</article>').join('') + '</div>') : '';
      return '<div class="stack">' + ready + '<div class="coach-grid">' + panel('Next actions', workRows(result.ready)) +
        panel('Waiting & blocked', workRows(result.waiting, true)) + '</div></div>';
    }

    function meetings() {
      const data = current();
      const rows = data.entries.filter(row => D.active(row) && row.type === 'meeting' && D.list(row.tags).includes('one-on-one'));
      const order = (a, b) => a.date.localeCompare(b.date) || D.str(a.time).localeCompare(D.str(b.time));
      const today = now().date;
      const section = (title, list) => panel(title, list.length ? '<div class="rows">' + list.map(row => {
        const linked = data.entries.filter(item => item.type === 'task' && D.active(item) &&
          (D.list(row.links).some(id => D.same(id, item.id)) || D.list(item.links).some(id => D.same(id, row.id))));
        const detail = [date(row.date), row.time, row.person || row.participants,
          linked.length ? linked.filter(D.open).length + ' open linked actions' : ''].filter(Boolean).join(' · ');
        return '<article class="row"><div class="row-main">' + btn(row.title, 'entry-view', { id: row.id }, { cls: 'row-title' }) +
          '<small>' + E(detail) + '</small></div>' + btn('Edit agenda', 'entry-edit', { id: row.id }, { cls: 'small' }) + '</article>';
      }).join('') + '</div>' : empty('No one-on-ones here.'));
      return '<div class="coach-grid">' + section('Upcoming', rows.filter(row => row.date >= today).sort(order)) +
        section('Past', rows.filter(row => row.date < today).sort((a, b) => order(b, a))) + '</div>';
    }

    function week() {
      const data = current();
      const start = D.weekStart(state.date);
      const end = D.addDays(start, 6);
      const time = D.planning.timeReport(data, start, end);
      const summary = D.dashboard.period(data, state.date, 'week');
      const done = Object.values(summary.groups).reduce((total, group) => total + group.done.length, 0);
      const events = D.eventsIn(data, start, end).filter(D.timed)
        .sort((a, b) => a.date.localeCompare(b.date) || D.str(a.time).localeCompare(D.str(b.time)));
      const tracked = time.totals.length ? '<dl class="money-figures">' + time.totals.map(([kind, minutes]) =>
        '<div><dt>' + E(D.planning.categories[kind] || kind) + '</dt><dd>' + E(D.minutesText(minutes)) + '</dd></div>').join('') + '</dl>' :
        empty('No time logged for this week.');
      const commitments = events.length ? '<div class="rows">' + events.slice(0, 8).map(row => '<article class="row"><div class="row-main">' +
        (row.virtual ? '<strong>' + E(row.title) + '</strong>' : btn(row.title, 'entry-view', { id: row.id }, { cls: 'row-title' })) +
        '<small>' + E([date(row.date), row.time].filter(Boolean).join(' · ')) + '</small></div></article>').join('') + '</div>' :
        empty('No events or meetings on the calendar this week.');
      return '<div class="coach-grid">' + panel('Recorded time', tracked, '', D.minutesText(time.minutes) + ' · ' + done + ' completed items') +
        panel('Calendar commitments', commitments, '<div class="actions">' +
          btn('Open week planner', 'navigate', { view: 'dayplan', sub: 'week', date: state.date }, { cls: 'small' }) +
          btn('Goals', 'navigate', { view: 'planner', sub: 'goals', date: state.date }, { cls: 'small' }) + '</div>') +
        '</div>';
    }

    function pageView() {
      const tools = mode === 'meetings' ? btn('New one-on-one', 'coach-meeting', {}, { cls: 'primary', icon: 'plus' }) :
        btn('Focus', 'task-focus', {}, { cls: 'small', icon: 'focus' }) + dateNav();
      const choices = '<div class="tabs" aria-label="Review views">' + Object.entries(modes).map(([value, label]) =>
        btn(label, 'coach-view', { value }, { pressed: mode === value })).join('') + '</div>';
      const range = mode === 'time' ? date(D.weekStart(state.date)) + ' – ' + date(D.addDays(D.weekStart(state.date), 6)) :
        mode === 'actions' ? date(state.date) : '';
      return page('', 'Review & Coaching', range, tools) + choices + { actions, meetings, time: week }[mode]();
    }

    return { page: pageView, dateStep: () => mode === 'time' ? 'week' : 'day',
      view({ value }) { if (Object.hasOwn(modes, value)) { mode = value; render(); } } };
  };
})(Diary);
