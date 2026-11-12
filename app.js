Diary.deviceDB.openFile().then(() => {
/* The diary UI. All writes go through storage.transact or the backup workflow. */
(function (D) {
  'use strict';
  const $ = (selector, base = document) => base.querySelector(selector);
  const $$ = (selector, base = document) => [...base.querySelectorAll(selector)];
  const E = value => D.str(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
  const L = D.list;
  const now = () => D.parts();
  const main = $('#main');
  const stickyDock = $('#sticky-dock');
  const stickyToggle = $('#sticky-toggle');
  const taskDock = $('#task-dock');
  const taskToggle = $('#task-toggle');
  const focusToggle = $('#focus-toggle');
  const dialog = $('#dialog');
  const confirmBox = $('#confirm');
  const Z = D.storage;
  const N = D.notebook;
  const W = D.workflow;
  const S = D.shiftSchedule;
  const R = D.rosterSupport;
  const P = D.portfolio;
  const SCOPES = { '': 'All', work: 'Work', personal: 'Personal' };
  const WEEK = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const PRIORITY = { critical: 'Critical', high: 'High', normal: 'Normal', low: 'Low' };
  const dutyViews = new Set(['shift', 'stickies']);
  const taskViews = new Set(['tasks', 'stickies']);
  const workingShifts = Object.fromEntries(D.WORKING_SHIFTS.map(shift => [shift, shift]));
  const NAV = {
    dashboard: ['Dashboard', 'chart'], today: ['Today', 'home'], diary: ['Daily Diary', 'book'], tasks: ['Tasks', 'checklist'],
    dayplan: ['Day Planner', 'calendar'], planner: ['Calendar', 'calendar'], shift: ['Shift Desk', 'clock'], registers: ['Work Registers', 'folder'],
    stickies: ['Stickies', 'pin'], work: ['Work Routines', 'checklist'], assignments: ['Assignments', 'folder'], faith: ['Namaz & Zikr', 'book'],
    highlights: ['Shift Highlights', 'book'], coach: ['Review & Coaching', 'chart'], finance: ['Expenses & Budget', 'wallet'], reviews: ['Reviews', 'chart'],
    updates: ['Update Log', 'book'], settings: ['Settings & Backups', 'settings'], search: ['Search', 'search']
  };
  const ICONS = {
    home: '<path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z"/><path d="M9 21v-7h6v7"/>',
    book: '<path d="M4 4h13a3 3 0 0 1 3 3v13H6a2 2 0 0 1-2-2zm0 13a2 2 0 0 1 2-2h14M8 8h7m-7 3h5"/>',
    checklist: '<rect x="4" y="3" width="16" height="18" rx="2"/><path d="m7 8 1 1 2-2m2 1h5M7 14l1 1 2-2m2 1h5"/>',
    calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18m-13 5h2m4 0h2"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    folder: '<path d="M3 19V6a1 1 0 0 1 1-1h6l2 2h8a1 1 0 0 1 1 1v11z"/>',
    chart: '<path d="M4 3v17h17M9 16v-4m5 4V8m5 8V5"/>',
    wallet: '<rect x="3" y="5" width="18" height="14" rx="3"/><path d="M21 9h-6a3 3 0 0 0 0 6h6m-6-3h.01"/>',
    settings: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3m0 14v3M2 12h3m14 0h3M5 5l2 2m10 10 2 2M5 19l2-2M17 7l2-2"/><circle cx="12" cy="12" r="7"/>',
    search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>',
    bell: '<path d="M18 8a6 6 0 0 0-12 0c0 8-3 8-3 10h18c0-2-3-2-3-10m-8 13h4"/>',
    plus: '<path d="M12 5v14M5 12h14"/>', menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
    close: '<path d="m6 6 12 12M18 6 6 18"/>', left: '<path d="m15 6-6 6 6 6"/>', right: '<path d="m9 6 6 6-6 6"/>',
    up: '<path d="m6 15 6-6 6 6"/>', down: '<path d="m6 9 6 6 6-6"/>',
    check: '<path d="m5 12 4 4L19 6"/>', edit: '<path d="M4 20h4L20 8l-4-4L4 16zM14 6l4 4"/>',
    more: '<path d="M5 12h.01M12 12h.01M19 12h.01" stroke-width="3.5"/>',
    reopen: '<path d="M4 11a8 8 0 1 1 2 7M4 5v6h6"/>',
    grip: '<path d="M9 5h.01M15 5h.01M9 12h.01M15 12h.01M9 19h.01M15 19h.01" stroke-width="3.5"/>',
    focus: '<path d="M9 4H4v5m11-5h5v5M4 15v5h5m11-5v5h-5"/><rect x="8" y="8" width="8" height="8" rx="1"/>',
    link: '<path d="M10 13a3 3 0 0 0 4 0l4-4a3 3 0 0 0-4-4l-2 2m2 4a3 3 0 0 0-4 0l-4 4a3 3 0 0 0 4 4l2-2"/>',
    paperclip: '<path d="m8 13 6-6a3 3 0 0 1 4 4l-8 8a5 5 0 0 1-7-7l8-8m-3 9a2 2 0 0 0 3 3l5-5"/>',
    pin: '<path d="m9 4 7 3-2 4 3 4-3 1-3-1-4 5 2-6-3-2 1-3h3z"/>',
    download: '<path d="M12 3v12m-4-4 4 4 4-4M4 16v4h16v-4"/>'
  };
  const svg = key => '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (ICONS[key] || '') + '</svg>';
  const dataAttrs = data => Object.entries(data).map(([key, value]) => ' data-' + key + '="' + E(value) + '"').join('');
  function btn(label, action, data = {}, options = {}) {
    return '<button type="button" class="' + E(options.cls || '') + '" data-action="' + action + '"' + dataAttrs(data) +
      (options.label ? ' aria-label="' + E(options.label) + '" title="' + E(options.label) + '"' : '') +
      (options.pressed === undefined ? '' : ' aria-pressed="' + !!options.pressed + '"') +
      (options.disabled ? ' disabled' : '') + '>' + (options.icon ? svg(options.icon) : '') + E(label) + '</button>';
  }
  const ibtn = (icon, label, action, data, disabled = false) => btn('', action, data, { icon, label, disabled, cls: 'icon-button' + (action === 'drag' ? ' drag' : '') });
  const chip = (label, color = '') => label ? '<span class="chip ' + color + '">' + E(label) + '</span>' : '';
  const empty = text => '<p class="empty">' + E(text) + '</p>';
  const note = (text, color = '') => '<p class="notice ' + color + '">' + E(text) + '</p>';
  const dated = D.formatDate;
  const viewDate = (date = state.date) => WEEK[(new Date(date + 'T00:00:00Z').getUTCDay() + 6) % 7] + ', ' + dated(date);
  const joined = items => items.filter(Boolean).join(' · ');
  const truncate = (value, size = 220) => D.str(value).length > size ? D.str(value).slice(0, size - 1) + '…' : D.str(value);
  const statuses = row => row.type === 'mwr' ? D.MWR : D.STATUS;
  const named = (record, name) => D.byId(record, name)?.name ?? '';
  const code = row => D.str(row.id);
  const order = D.manualOrder;
  const scope = row => !state.scope || row.scope === state.scope;
  const taskRows = () => db.entries.filter(row => D.active(row) && row.type === 'task');
  const selectedDuty = () => db.roster.find(row => row.date === state.date);
  const historyDate = item => D.formatStamp(item?.at || item?.timestamp || item?.date);

  let db = D.empty();
  let opening = true;
  let blocked = '';
  let modal = null;
  let undo = null;
  let confirmCallback = null;
  let toastTimer;
  let installPrompt;
  let offlineReady = false;
  let waitingWorker;
  let reloadingApp = false;
  let stickyDockMarkup = '';
  let taskDockMarkup = '';
  let mealPopupMarkup = '';
  let workUpdateMarkup = '';
  let alarmMarkup = '';
  let shiftAlarms = [];
  let dutyAlerts = new Map();
  let focusOrigin;
  const mainViews = ['dashboard', 'stickies', 'tasks', 'assignments', 'dayplan', 'highlights', 'finance'];
  const alerted = new Set();
  const state = {
    view: 'stickies', date: now().date, summaryMode: 'pending', summaryKind: 'all', scope: '', tasks: 'list', taskCollection: 'week', taskKind: 'all', sort: 'manual', taskStatus: '', planner: 'week',
    taskPriority: '', taskArea: '', taskShift: '', taskWindow: '', taskQuery: '', taskAssignment: '', taskHeading: '',
    stickies: 'today', stickyDutyDate: '', stickyDetailed: false, dock: '', taskFocus: '', taskPerson: '', zikrSlot: 'morning', moneyView: 'overview', moneyType: '', moneyCategory: '', moneyQuery: '',
    register: 'mwr-planned', role: '', phase: 'start', handoverShift: '', review: 'week',
    portfolioId: '', portfolioView: 'open', portfolioLevel: '', portfolioStatus: '', portfolioYear: '',
    search: {}, searchError: '', visibleRows: new Map()
  };
  const currentDutyDay = (data = db) => D.shiftCompanion.activeDuty(data)?.date || now().date;
  const stickyDutyDay = () => state.stickyDutyDate || currentDutyDay();

  function page(eyebrow, title, desc, controls = '') {
    return '<div class="page-header"><div>' + (eyebrow ? '<span class="eyebrow">' + E(eyebrow) + '</span>' : '') + '<h1>' + E(title) +
      '</h1>' + (desc ? '<p class="muted">' + E(desc) + '</p>' : '') +
      '</div>' + (controls ? '<div class="page-tools">' + controls + '</div>' : '') + '</div>';
  }

  function panel(title, body, tools = '', subtitle = '', id = '') {
    return '<section class="panel"' + (id ? ' id="' + E(id) + '"' : '') + '><header class="panel-head"><div><h2>' +
      E(title) + '</h2>' + (subtitle ? '<p class="muted">' + E(subtitle) + '</p>' : '') + '</div>' + tools + '</header>' + body + '</section>';
  }

  function tabs(items, key, name) {
    return '<div class="tabs" aria-label="' + E(name) + '">' +
      Object.entries(items).map(([value, text]) => btn(text, 'tab', { key, value }, { pressed: state[key] === value })).join('') + '</div>';
  }

  const scopedTabs = () => tabs(SCOPES, 'scope', 'Filter by category');
  const linkButton = (label, view, data = {}) => btn(label, 'navigate', { view, ...data }, { cls: 'text-button small' });

  function options(items, value) {
    const entries = Array.isArray(items) ? items.map(item => [item, item]) : Object.entries(items);
    return entries.map(([key, text]) => '<option value="' + E(key) + '"' +
      (String(key) === String(value ?? '') ? ' selected' : '') + '>' + E(text) + '</option>').join('');
  }

  function select(name, label, items, value, extra = '') {
    return '<label>' + E(label) + '<select name="' + name + '"' + extra + '>' + options(items, value) + '</select></label>';
  }
  function input(name, label, value, { type = 'text', placeholder = '', wide = false, extra = '' } = {}) {
    return '<label' + (wide ? ' class="wide"' : '') + '>' + E(label) + '<input name="' + name + '" type="' +
      type + '" value="' + E(value) + '" placeholder="' + E(placeholder) + '"' + extra + '></label>';
  }
  function textarea(name, label, value, placeholder = '') {
    return '<label class="wide">' + E(label) + '<textarea name="' + name + '" placeholder="' + E(placeholder) + '">' + E(value) + '</textarea></label>';
  }
  const check = (name, label, value) => '<label class="check"><input type="checkbox" name="' + name + '"' + (value ? ' checked' : '') + '>' + E(label) + '</label>';
  function dateControl(name, value, label, attribute = '') {
    return '<span class="date-control"><input type="text" name="' + name + '" aria-label="' + E(label) + '" value="' +
      E(dated(value) || value) + '" placeholder="dd-mmm-yyyy" autocomplete="off" data-date-field' + attribute +
      '><span class="native-date">' + svg('calendar') + '<input type="date" data-date-picker value="' +
      E(D.parseDate(value)) + '" aria-label="Calendar for ' + E(label.toLowerCase()) + '"></span></span>';
  }
  const dateInput = (name, label, value) => '<label>' + E(label) + dateControl(name, value, label) + '</label>';
  const timeInput = (name, label, value) => D.clock.field(name, label, value, E, svg('clock'));
  function assignerInput(value, id) {
    const names = W.assigners(db);
    return input('assignedBy', 'Assigned by name', value, { placeholder: 'Choose or type a name', extra: ' list="' + id + '" maxlength="120"' }) +
      '<datalist id="' + id + '">' + names.map(name => '<option value="' + E(name) + '">' + E(D.ASSIGNERS[W.personRole(name)]) + '</option>').join('') + '</datalist>';
  }
  function dateNav() {
    return '<div class="date-nav">' + ibtn('left', 'Previous ' + dateStep(), 'date-step', { direction: -1 }) +
      dateControl('navigateDate', state.date, 'Selected date', ' data-navigate-date') +
      ibtn('right', 'Next ' + dateStep(), 'date-step', { direction: 1 }) + btn('Today', 'date-today', {}, { cls: 'small' }) + '</div>';
  }
  const dateStep = () => state.view === 'dashboard' ? (state.summaryMode === 'pending' ? 'day' : state.summaryMode) :
    state.view === 'finance' ? 'month' : state.view === 'work' ? 'week' :
    state.view === 'planner' && ['week', 'month'].includes(state.planner) ? state.planner : state.view === 'reviews' ? state.review :
      state.view === 'dayplan' ? planTools.dateStep() : state.view === 'coach' ? coachUI.dateStep() : 'day';

  function dutyLabel(row) {
    if (!row) return '';
    const window = D.planning.dutyWindow(db, row);
    const end = window && D.parts(window.end);
    return joined([window ? D.parts(window.start).time + '–' + end.time + (end.date !== row.date ? ' next day' : '') : '', row.group]);
  }

  function setTheme() {
    const requested = db.settings.theme;
    document.documentElement.dataset.theme = requested === 'dark' ||
      (requested === 'system' && matchMedia('(prefers-color-scheme: dark)').matches) ? 'dark' : 'light';
    document.documentElement.dataset.palette = db.settings.palette;
    document.documentElement.dataset.diaryFont = N.font(db.settings.diaryFont) || 'system';
    document.documentElement.dataset.stickySize = N.size(db.settings.stickySize);
  }
  function renderNav() {
    const navigation = $('#navigation');
    const link = view => {
      const [label, icon] = NAV[view];
      return '<a class="nav-link" href="#' + view + '" data-action="navigate" data-view="' + view + '"' +
        (state.view === view ? ' aria-current="page"' : '') + '>' + svg(icon) + '<span>' + E(label) + '</span></a>';
    };
    const more = navigation.querySelector('details');
    const expanded = !mainViews.includes(state.view) || more?.open;
    navigation.innerHTML = mainViews.map(link).join('') + '<details class="nav-more"' + (expanded ? ' open' : '') +
      '><summary>More tools</summary>' + ['coach', 'shift', 'today', 'diary', 'planner', 'work', 'registers', 'faith', 'reviews', 'updates', 'settings'].map(link).join('') + '</details>';
    $('#mobile-navigation').innerHTML = mainViews.filter(view => !['finance', 'highlights'].includes(view)).map(view => {
      const [label, icon] = NAV[view];
      return btn(view === 'dayplan' ? 'Planner' : label, 'navigate', { view }, { icon, pressed: state.view === view });
    }).join('') + btn('More', 'menu', { tools: 'yes' }, { icon: 'more', label: 'More tools' });
    $('.side-footer span:last-child').textContent = blocked ? 'Storage unavailable' :
      D.deviceDB.fileName ? 'Saved to diary file' : 'Saved on this device';
  }

  function workUpdateCards(items) {
    return '<ul class="work-update-items">' + items.map(item => '<li>' +
      btn(item.row.title, item.type === 'assignment' ? 'portfolio-open' : item.row.forecast ? 'plan-adjust-task' : 'entry-view',
        { id: item.row.id, 'forecast-day': item.row.forecast ? item.row.routineDate : '' }, { cls: 'row-title' }) +
      '<small><strong>' + E(item.label) + '</strong> · ' + E(item.detail) + '</small></li>').join('') + '</ul>';
  }

  function renderWorkUpdatePopup(updates) {
    const target = $('#work-update-popup');
    const pending = updates.filter(item => !item.dismissed);
    target.hidden = !!blocked || !pending.length;
    if (target.hidden) return;
    const highlights = [pending.find(item => item.priority === 0), pending.find(item => item.priority === 3),
      pending.find(item => item.priority === 1 || item.priority === 2)].filter(Boolean);
    const preview = [...new Set([...highlights, ...pending])].slice(0, 3);
    const markup = '<div class="panel-head"><h2 id="work-update-title">Work & diary updates</h2>' +
      ibtn('close', 'Hide these updates until the next day', 'work-updates-hide') + '</div>' + workUpdateCards(preview) +
      btn('Review all (' + updates.length + ')', 'reminders', {}, { cls: 'small' });
    if (workUpdateMarkup !== markup || !target.firstElementChild) {
      target.innerHTML = markup;
      workUpdateMarkup = markup;
    }
  }

  async function hideWorkUpdates() {
    const seen = new Map(R.reminderState(db).updates.filter(item => !item.dismissed).map(item => [item.key, item]));
    await commit(data => {
      let saved = false;
      for (const item of R.reminderState(data).updates) {
        const prior = seen.get(item.key);
        if (item.dismissed || prior?.day !== item.day || prior.signature !== item.signature) continue;
        data.reminders[item.key] = { day: item.day, signature: item.signature };
        saved = true;
      }
      return saved;
    }, null, false);
    if (modal?.kind === 'reminders') remindersDialog();
    else $('#reminder-button').focus({ preventScroll: true });
  }

  function updateReminders({ due, alarms, warnings, quiet, updates } = R.reminderState(db)) {
    renderWorkUpdatePopup(updates);
    const count = new Set([...warnings.keys(), ...alarms.map(item => code(item.row)), ...due.map(item => code(item.row)),
      ...updates.filter(item => !item.dismissed).map(item => item.type === 'assignment' ? item.key : code(item.row))]).size;
    $('#reminder-button').innerHTML = svg('bell') + (count ? '<span class="badge">' + Math.min(count, 99) + '</span>' : '');
    const label = (count ? 'Reminders, ' + count + ' to review' : 'Reminders') + (quiet ? ' · Roster quiet is active' : '');
    $('#reminder-button').setAttribute('aria-label', label);
    $('#reminder-button').title = label;
    if (!db.settings.notifications || !('Notification' in window) || Notification.permission !== 'granted') return;
    for (const item of due.slice(0, 5)) {
      const tag = item.key + ':' + (item.state.snooze || 0);
      if (alerted.has(tag)) continue;
      alerted.add(tag);
      // Only tell the user that a reminder exists. Keep work and personal details off the lock screen.
      if (navigator.serviceWorker?.controller) {
        navigator.serviceWorker.ready.then(reg => reg.showNotification('Diary reminder', { body: 'Open your diary to review a due reminder.', tag })).catch(() => {});
      } else {
        try { new Notification('Diary reminder', { body: 'Open your diary to review a due reminder.', tag }); } catch { /* In-app reminder remains available. */ }
      }
    }
  }

  function alarmCards(alarms) {
    return '<div class="shift-alarm-list">' + alarms.map(item => '<article class="shift-alarm-card" data-alarm-id="' + E(code(item.row)) + '">' +
      '<div class="shift-alarm-info"><small class="alarm-label"><span aria-hidden="true"></span>' + E(item.label) + '</small>' +
      btn(item.row.title, 'entry-view', { id: code(item.row) }, { cls: 'alarm-task-title', label: 'Open ' + item.row.title }) +
      '<small>' + E(item.detail) + '</small></div>' +
      btn('Acknowledge', 'shift-ack', { key: item.key }, { cls: 'small', label: 'Acknowledge ' + item.row.title }) + '</article>').join('') + '</div>';
  }

  function renderShiftAlarms(alarms) {
    shiftAlarms = blocked ? [] : alarms;
    const target = $('#shift-alarms');
    target.hidden = !shiftAlarms.length;
    if (!shiftAlarms.length) return;
    const markup = alarmCards(shiftAlarms);
    if (alarmMarkup !== markup || !target.firstElementChild) {
      const expanded = target.querySelector('details')?.open;
      target.innerHTML = '<details' + (expanded ? ' open' : '') + '><summary id="shift-alarms-title">Shift alarms <span>' +
        shiftAlarms.length + '</span></summary>' + markup + '</details>';
      alarmMarkup = markup;
    }
  }

  async function acknowledgeShift({ key }) {
    await commit(data => {
      const alarm = S.alarms(data).find(item => item.keys.includes(key));
      if (!alarm) return false;
      for (const id of alarm.keys) data.reminders[id] = { ack: D.stamp() };
    }, null, false);
    if (modal?.kind === 'reminders') remindersDialog();
  }

  function renderDocks() {
    const day = stickyDutyDay();
    const duty = db.roster.find(row => row.date === day);
    const canDock = !blocked && !state.taskFocus && state.view !== 'stickies';
    const open = canDock && state.dock === 'stickies';
    const { count, markup } = dayTools.stickyDock(open, duty, day);
    stickyToggle.disabled = !canDock;
    stickyToggle.setAttribute('aria-expanded', String(open));
    stickyToggle.setAttribute('aria-label', (open ? 'Hide' : 'Show') + ' pinned stickies' + (count ? ' (' + count + ')' : ''));
    $('#sticky-count').textContent = count;
    $('#sticky-count').hidden = !count;
    stickyDock.hidden = !open;
    if (markup !== stickyDockMarkup) {
      $('#sticky-dock-list').innerHTML = markup;
      stickyDockMarkup = markup;
    }
    const tasksOpen = canDock && state.dock === 'tasks';
    taskToggle.disabled = !canDock;
    taskToggle.setAttribute('aria-expanded', String(tasksOpen));
    taskToggle.setAttribute('aria-label', tasksOpen ? 'Hide pinned Tasks panel' : 'Pin Tasks panel');
    taskDock.hidden = !tasksOpen;
    $('#page-dock').hidden = !open && !tasksOpen;
    const tasks = tasksOpen ? taskDockRows() : '';
    if (tasks !== taskDockMarkup) {
      $('#task-dock-list').innerHTML = tasks;
      taskDockMarkup = tasks;
    }
  }

  function render() {
    setTheme();
    renderNav();
    if (opening) { $('#quick-add').disabled = true; return; }
    if (state.view === 'shift') state.date = stickyDutyDay();
    if (state.view === 'stickies') state.date = state.stickyDutyDate || now().date;
    document.body.classList.toggle('task-focus', !!state.taskFocus);
    focusToggle.disabled = !!blocked;
    focusToggle.setAttribute('aria-pressed', String(!!state.taskFocus));
    focusToggle.setAttribute('aria-label', state.taskFocus ? 'Exit focus' : 'Focus');
    focusToggle.title = state.taskFocus ? 'Exit focus (Esc)' : 'Choose a focus view';
    $('span', focusToggle).textContent = state.taskFocus ? 'Exit focus' : 'Focus';
    const pauses = D.shiftCompanion.activePauses(db).length;
    const pauseToggle = $('#pause-toggle');
    pauseToggle.disabled = !!blocked;
    pauseToggle.dataset.active = String(!!pauses);
    pauseToggle.dataset.action = pauses ? 'companion-pauses' : 'companion-pause';
    pauseToggle.title = pauses ? 'Resume paused work' : 'Pause & capture';
    pauseToggle.setAttribute('aria-label', pauseToggle.title);
    pauseToggle.innerHTML = svg('clock') + '<span>' + E(pauses ? 'Resume (' + pauses + ')' : 'Pause & capture') + '</span>';
    state.visibleRows.clear();
    const openDetails = new Set($$('details[data-keep-open][open]', main).map(item => item.dataset.keepOpen));
    main.dataset.workspace = state.view;
    const reminders = R.reminderState(db);
    dutyAlerts = reminders.warnings;
    renderShiftAlarms(reminders.alarms);
    if (blocked) {
      main.innerHTML = page('DEVICE STORAGE', 'Diary could not open', 'The browser’s saved data is still in place.') +
        panel('Check storage', note(blocked, 'error') + btn('Download raw saved data', 'raw-export', {}, { icon: 'download' }));
      $('#quick-add').disabled = true;
    } else {
      main.innerHTML = state.taskFocus === 'both' ? focusBothPage() : pages[state.view]();
      for (const detail of $$('details[data-keep-open]', main)) {
        if (openDetails.has(detail.dataset.keepOpen)) detail.open = true;
      }
      dayTools.applyStickySizes(main);
      N.mount(main, state.view === 'faith' ? D.byId(db.faithNotes, state.date)?.noteStyles : undefined);
      $('#quick-add').disabled = false;
    }
    renderDocks();
    renderMealPopup();
    updateReminders(reminders);
  }

  async function prepareShiftStickies() {
    const day = stickyDutyDay();
    if (blocked || !D.hasMissingShiftStickies(db, day)) return;
    await commit(data => D.syncShiftStickies(data, [day]), null, false, false);
  }

  async function navigate(view, date) {
    if (!Object.hasOwn(NAV, view)) return;
    const day = D.parseDate(date);
    if (dutyViews.has(view)) {
      if (day) state.stickyDutyDate = day;
      state.date = view === 'stickies' ? state.stickyDutyDate || now().date : stickyDutyDay();
    } else if (day) state.date = day;
    else if (view === 'highlights' && state.view !== view) state.date = currentDutyDay();
    else if (['finance', 'dayplan', 'coach'].includes(view) && state.view !== view) state.date = now().date;
    if (!taskViews.has(view)) { state.taskFocus = ''; focusOrigin = null; }
    state.view = view;
    const hash = '#' + view;
    if (location.hash !== hash) history.pushState(null, '', hash);
    menu(false);
    if (dutyViews.has(view)) await prepareShiftStickies();
    render();
    if (state.view !== view) return;
    window.scrollTo(0, 0);
    main.focus({ preventScroll: true });
    if (view === 'search') $('[name="words"]', main)?.focus();
  }

  async function selectViewDate(day, followDuty = false) {
    state.date = day;
    if (dutyViews.has(state.view)) {
      state.stickyDutyDate = followDuty ? '' : day;
      await prepareShiftStickies();
    }
    render();
  }

  async function toggleTaskFocus({ mode } = {}) {
    if (state.taskFocus && !mode) {
      const origin = focusOrigin;
      focusOrigin = null;
      state.taskFocus = '';
      if (origin) {
        state.stickyDutyDate = origin.stickyDutyDate;
        await navigate(origin.view, dutyViews.has(origin.view) ? '' : origin.date);
      } else render();
    } else if (mode && ['tasks', 'stickies', 'both'].includes(mode)) {
      closeDialog(true);
      focusOrigin ||= { view: state.view, date: state.date, stickyDutyDate: state.stickyDutyDate };
      state.taskFocus = mode;
      await navigate(mode === 'tasks' ? 'tasks' : 'stickies');
    } else {
      openDialog('focus', 'Choose a focus view', '<p class="muted">Focus hides the sidebars and keeps the controls for your chosen view.</p><div class="entry-choices">' +
        ['Stickies', 'Tasks', 'Both'].map(label => btn('Focus on ' + label.toLowerCase(), 'task-focus', { mode: label.toLowerCase() })).join('') + '</div>',
      btn('Cancel', 'close-dialog'));
      return;
    }
    focusToggle.focus({ preventScroll: true });
  }

  function menu(force) {
    const on = force ?? !document.body.classList.contains('menu-open');
    document.body.classList.toggle('menu-open', on);
    $('#menu').setAttribute('aria-expanded', String(on));
    $('#nav-overlay').hidden = !on;
    if (on) $('.nav-link[aria-current="page"]')?.focus();
  }

  function toast(text, canUndo = false) {
    const target = $('#toast');
    clearTimeout(toastTimer);
    target.innerHTML = '<span>' + E(text) + '</span>' + (canUndo ? btn('Undo', 'undo', {}, { cls: 'small' }) : '') +
      ibtn('close', 'Dismiss message', 'dismiss-toast');
    target.hidden = false;
    toastTimer = setTimeout(() => { target.hidden = true; }, canUndo ? 12000 : 6000);
  }

  async function commit(change, message, undoable = true, redraw = true) {
    const result = await Z.transact(change);
    db = result.data;
    if (result.result !== false && undoable) undo = { data: result.before, rev: result.data.rev };
    if (redraw) {
      try { render(); } catch (error) { showError(error); }
    }
    if (message && result.result !== false) toast(typeof message === 'function' ? message(result.result) : message, undoable);
    return result.result;
  }

  function remember(row) {
    if (row.virtual) state.visibleRows.set(code(row), row);
    return code(row);
  }

  function duration(row) {
    const window = D.eventWindow(row);
    if (!window) return '';
    const mins = Math.round((window.end - window.start) / 60000);
    return [mins >= 60 ? Math.floor(mins / 60) + ' h' : '', mins % 60 ? mins % 60 + ' min' : ''].filter(Boolean).join(' ');
  }

  function rowTime(row, date) {
    if (date && row.date !== date) {
      if (row.time && row.date < date && D.calendarEnd(row) >= date) return '00:00';
      return row.dueDate === date ? row.dueTime || '' : row.followDate === date ? row.followTime || '' : '';
    }
    return row.time || (row.dueDate === row.date ? row.dueTime : '') || '';
  }

  function dutyWarning(row) {
    const alert = dutyAlerts.get(code(row));
    return alert ? '<span class="chip danger" title="' + E(alert.detail) + '">' + E(alert.label) + '</span>' : '';
  }

  function personLink(row) {
    const name = W.personName(row);
    return name ? btn(name, 'tasks-by-person', { name }, { cls: 'person-chip', label: 'Tasks assigned by ' + name }) : '';
  }

  function entryMeta(row, { showDate = false, overlap = false, hidePortfolio = false, taskSummary = false } = {}) {
    const status = statuses(row)[row.status];
    const late = D.isOverdue(row, now());
    return '<div class="pills">' + (taskSummary ? chip(row.scope === 'personal' ? 'Personal' : '', 'blue') :
      chip(D.TYPES[row.type], row.scope === 'personal' ? 'blue' : 'green')) +
      (status ? chip(status, row.status === 'done' || row.status === 'closed' ? 'green' : row.status === 'waiting' ? 'warn' :
        taskSummary && row.status === 'doing' ? 'blue' : '') : '') +
      (row.type === 'task' && ['critical', 'high'].includes(row.priority)
        ? chip(PRIORITY[row.priority] + ' priority', row.priority === 'critical' ? 'danger' : 'warn') : '') +
      (['task', 'followup'].includes(row.type) ? chip(row.routineHeading) + chip(D.ASSIGNERS[D.assignmentOf(row)]) : '') +
      (row.type === 'task' ? personLink(row) + dutyWarning(row) : '') +
      (row.portfolioId && !hidePortfolio ? portfolioTools.entryLink(row) : '') +
      (showDate ? chip(dated(row.date)) : '') +
      (row.dueDate && !taskSummary ? chip('Due ' + joined([dated(row.dueDate), row.dueTime]), late ? 'danger' : '') : '') +
      (row.followDate ? chip('Follow up ' + joined([dated(row.followDate), row.followTime])) : '') +
      (row.number ? chip(/^MWR\b/i.test(row.number) ? row.number : 'MWR ' + row.number) : '') +
      (row.mwrStatus && row.mwrStatus !== 'none' ? chip(MWR_TASK[row.mwrStatus]) : '') +
      (row.kind ? chip(row.kind) : '') +
      (row.endTime ? chip('Ends ' + joined([row.endDate && row.endDate !== row.date ? dated(row.endDate) : '', row.endTime])) : '') +
      (overlap ? chip('Overlap', 'warn') : '') + (duration(row) ? chip(duration(row)) : '') +
      (row.pinned ? chip('Pinned') : '') + (row.sample ? chip('Sample', 'blue') : '') +
      (row.draft ? chip('Draft', 'warn') : '') + '</div>';
  }

  function rowView(row, options = {}) {
    const id = remember(row);
    const time = options.timeline ? (rowTime(row, options.date) || '—') : '';
    const field = options.preview && ['body', 'readings', 'agenda'].find(key => row[key] || row.noteStyles?.[key]);
    const detail = field && truncate(row[field]);
    const styled = field && row.noteStyles?.[field] && N.render(row[field], row.noteStyles[field]);
    const preview = styled ? '<div class="notebook-preview">' + styled + '</div>' : detail ? '<p class="row-body">' + E(detail) + '</p>' : '';
    return '<article class="row">' + (time ? '<span class="row-time">' + E(time) + '</span>' : '') +
      '<div class="row-main">' + btn(row.title || 'Untitled draft', 'entry-view', { id }, { cls: 'row-title' }) +
      entryMeta(row, options) + preview + '</div>' +
      (options.more ? ibtn('edit', 'Edit ' + (row.title || 'entry'), 'entry-edit', { id }) : '') + (options.tools || '') + '</article>';
  }

  function rowsView(rows, options = {}) {
    if (!rows.length) return empty(options.empty || 'No entries here.');
    const limited = options.limit ? rows.slice(0, options.limit) : rows;
    return '<div class="' + (options.timeline ? 'rows timeline' : 'rows') + '">' +
      limited.map(row => rowView(row, options)).join('') + '</div>' +
      (limited.length < rows.length ? '<p class="muted">Showing ' + limited.length + ' of ' + rows.length + '.</p>' : '');
  }

  function rosterAlertPanel(rows = taskRows(), showDetails = true) {
    const flagged = rows.filter(row => dutyAlerts.has(code(row)));
    if (!flagged.length) return '';
    const list = flagged.map(row => '<div class="row"><div class="row-main">' + btn(row.title, 'entry-view', { id: code(row) }, { cls: 'row-title' }) +
      '<div class="pills">' + dutyWarning(row) + '</div>' + (showDetails ? '<small>' + E(dutyAlerts.get(code(row)).detail) + '</small>' : '') + '</div></div>').join('');
    return panel('Roster alerts', '<div class="rows roster-alert-list">' + list + '</div>', '', 'Review these tasks ahead of your roster.');
  }

  function mealActions(date, meal, log) {
    return '<div class="actions">' + ['in', 'out'].map(event => {
      const label = event === 'in' ? 'In' : 'Out';
      const saved = log?.[event + 'At'];
      const time = saved && Number.isFinite(Date.parse(saved)) ? D.parts(saved).time : '';
      return btn(time ? label + ' · ' + time : 'Log ' + label, 'meal-record', { date, meal, event },
        { cls: 'small' + (time ? '' : ' primary'), disabled: !!time, label: (time ? label + ' at ' + time : 'Log ' + label) + ' for ' + meal });
    }).join('') + '</div>';
  }

  function renderMealPopup(local = now()) {
    const target = $('#meal-popup');
    const prompt = !blocked && W.mealPrompt(db, local);
    target.hidden = !prompt;
    if (!prompt) return;
    const { date, meal, log } = prompt;
    const { label, time } = W.meals[meal];
    const markup = '<div class="panel-head"><div><span class="eyebrow">DAILY MEAL · ' + time + '</span><h2>' + label + '</h2></div>' +
      ibtn('close', 'Dismiss this meal reminder', 'meal-record', { date, meal, event: 'dismissed' }) + '</div>' +
      '<p class="muted">' + E(dated(date)) + ' · Sadiqabad time</p>' + mealActions(date, meal, log) +
      btn('Meal log', 'meal-log', {}, { cls: 'small text-button' });
    if (mealPopupMarkup !== markup) {
      target.innerHTML = markup;
      mealPopupMarkup = markup;
    }
  }

  function openMealLog() {
    const date = now().date;
    const rows = Object.entries(W.meals).map(([meal, { label, time }]) => '<div class="row meal-log-row"><div class="row-main"><strong>' +
      label + '</strong><p class="muted">Reminder at ' + time + '</p></div>' + mealActions(date, meal, D.byId(db.mealLogs, W.mealId(date, meal))) + '</div>').join('');
    const past = db.mealLogs.filter(row => row.date !== date && (row.inAt || row.outAt) && Object.hasOwn(W.meals, row.meal))
      .sort((a, b) => D.str(b.date).localeCompare(D.str(a.date)) || W.meals[b.meal].time.localeCompare(W.meals[a.meal].time));
    const at = value => D.formatStamp(value).split(' ').at(-1) || '—';
    openDialog('meal-log', 'Meal log', '<p class="muted">' + E(dated(date)) + ' · Sadiqabad time</p><div class="rows">' + rows + '</div>' +
      (past.length ? '<details class="section-actions"><summary>Previous days (' + past.length + ')</summary><div class="rows">' +
        past.map(row => '<div class="row"><div class="row-main"><strong>' + E(joined([dated(row.date), W.meals[row.meal].label])) +
          '</strong><p class="muted">' + E('In ' + at(row.inAt) + ' · Out ' + at(row.outAt)) + '</p></div></div>').join('') + '</div></details>' : ''),
    btn('Close', 'close-dialog'));
  }

  async function recordMeal({ date, meal, event }) {
    const at = D.stamp();
    if (date !== D.parts(at).date || !Object.hasOwn(W.meals, meal) || !['in', 'out', 'dismissed'].includes(event)) return;
    const field = event + 'At';
    await commit(data => {
      const id = W.mealId(date, meal);
      const existing = D.byId(data.mealLogs, id);
      const log = existing || { id, date, meal };
      if (log[field]) return false;
      if (!existing) data.mealLogs.push(log);
      Object.assign(log, { [field]: at, updatedAt: at });
    }, event === 'dismissed' ? null : (event === 'in' ? 'In' : 'Out') + ' time saved.', false, false);
    renderMealPopup();
    if (modal?.kind === 'meal-log') openMealLog();
  }

  const chronological = (a, b, date) => (rowTime(a, date) || '99:99').localeCompare(rowTime(b, date) || '99:99') || a.title.localeCompare(b.title);
  function scheduledDay(date) {
    return D.eventsIn(db, date, date).filter(row => scope(row) && (row.type !== 'task' || D.taskDay(row) <= date))
      .sort((a, b) => chronological(a, b, date));
  }

  function checklistsFor(date, shift = null, onlyScope = '') {
    return db.checklists.filter(row => !row.deletedAt && row.date === date &&
      (shift === null || !row.shift || row.shift === shift) && (!onlyScope || row.scope === onlyScope));
  }

  const routineMatches = (template, shift) => template.frequency === 'day' ||
    (template.frequency === 'shift' ? Object.hasOwn(D.SHIFT, shift) : template.frequency === shift);

  function routinesFor(date, shift, onlyScope) {
    const runs = checklistsFor(date, shift, onlyScope);
    const available = db.templates.filter(row => !row.deletedAt && (!onlyScope || row.scope === onlyScope) &&
      routineMatches(row, shift) && !runs.some(run => D.same(run.templateId, row.id)));
    return (runs.length ? '<div class="stack">' + runs.map(checklistCard).join('') + '</div>' : '') +
      (available.length ? '<div class="actions section-actions">' + available.map(row =>
        btn('Start ' + row.name, 'checklist-run', { id: row.id, date }, { icon: 'plus' })).join('') + '</div>' : '') +
      (!runs.length && !available.length ? empty('No routines for this date and duty.') : '');
  }

  function checklistCard(run) {
    return '<article class="panel"><div class="panel-head"><h3>' + E(run.name) + '</h3>' +
      chip(joined([dated(run.date), run.shift, SCOPES[run.scope]])) + '</div><div class="block-list">' +
      L(run.items).map((item, i) => '<label class="check"><input type="checkbox" data-check-run="' + E(run.id) +
      '" data-index="' + i + '"' + (item.done ? ' checked' : '') + '>' + E(item.title) + '</label>').join('') +
      '</div></article>';
  }

  function todayPage() {
    const local = now();
    const { current, next, today } = D.dutyAt(db.roster);
    const routineDate = current?.date || local.date;
    const tasks = taskRows().filter(scope).filter(D.open).sort(order);
    const available = tasks.filter(row => W.openTaskOn(row, routineDate));
    const schedule = scheduledDay(local.date);
    const overlaps = D.overlaps(schedule);
    const priorities = available.filter(row => row.focus);
    const overdue = available.filter(row => D.isOverdue(row, local));
    const carrying = available.filter(row => D.taskDay(row) < routineDate && !overdue.includes(row));
    const dueSoon = tasks.filter(row => row.dueDate && !overdue.includes(row) &&
      row.dueDate >= local.date && row.dueDate <= D.addDays(local.date, db.settings.soonDays))
      .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
    const waiting = db.entries.filter(row => scope(row) && D.open(row) && ['task', 'followup', 'mwr'].includes(row.type) && row.status === 'waiting');
    const follow = db.entries.filter(row => scope(row) && D.open(row) && ['mwr', 'followup'].includes(row.type) && row.followDate &&
      row.followDate <= D.addDays(local.date, db.settings.soonDays)).sort((a, b) => a.followDate.localeCompare(b.followDate));
    const timeline = schedule.filter(row => row.type === 'log' || D.timed(row) || rowTime(row, local.date));
    const nightLogs = current && D.overnight(current.shift) && current.date !== local.date && state.scope !== 'personal'
      ? db.entries.filter(row => D.active(row) && row.type === 'log' && row.dutyDate === current.date && row.date !== local.date)
        .sort((a, b) => a.date.localeCompare(b.date) || D.str(a.time).localeCompare(D.str(b.time))) : [];
    const notes = schedule.filter(row => row.type === 'note').sort((a, b) => Number(b.pinned) - Number(a.pinned));
    const duty = current || today;
    const todays = available.filter(row => D.taskDay(row) === routineDate || row.dueDate === local.date);
    const blocks = D.eventsIn(db, local.date, D.addDays(local.date, db.settings.soonDays)).filter(row => scope(row) &&
      (D.timed(row) || row.type === 'task' && D.open(row) && row.time) && (row.date > local.date ||
      row.date === local.date && (!row.time || row.time >= local.time) || D.eventWindow(row)?.end > Date.now()))
      .sort((a, b) => a.date.localeCompare(b.date) || chronological(a, b, a.date));
    const pending = state.scope === 'personal' ? [] : D.pendingHandover(db, routineDate, duty?.shift || '');
    const quick = '<div class="quick-capture actions">' + btn('Add task', 'add', { type: 'task' }, { icon: 'plus', cls: 'primary' }) +
      btn('Add note', 'add', { type: 'note' }, { icon: 'book' }) + btn('Add expense', 'money-edit', {}, { icon: 'wallet' }) +
      btn('Day Plan', 'navigate', { view: 'dayplan', date: local.date, sub: 'plan' }, { icon: 'calendar' }) +
      btn('Shift Stickies', 'navigate', { view: 'stickies', date: routineDate }, { icon: 'pin' }) +
      btn('Meal log', 'meal-log', {}, { icon: 'clock' }) + '</div>';
    const listPanel = (title, records, message, id, tools = '') => panel(title, rowsView(records, { empty: message, limit: 6 }), tools, '', id);
    const metric = (value, label, target, warn) => '<button type="button" class="metric' + (warn && value ? ' warn' : '') +
      '" data-action="jump" data-id="' + target + '"><strong>' + value + '</strong><span>' + E(label) + '</span></button>';
    return page('TODAY · ASIA/KARACHI', dated(local.date), viewDate(local.date).split(',')[0] + ' · ' + local.time,
      linkButton('Open daily diary', 'diary', { date: local.date })) +
      '<div class="hero"><section class="duty-card"><div><span class="eyebrow">' + (current ? 'CURRENT DUTY' : 'TODAY’S ROSTER') +
      '</span><h2>' + E(duty?.shift || 'Duty not set') + '</h2><p class="muted">' +
      E(duty ? joined([dutyLabel(duty), D.overnight(current?.shift) ? 'Started ' + dated(duty.date) : '']) : 'Add a duty to your roster.') +
      '</p></div>' + ibtn('clock', 'Open Shift Desk', 'navigate', { view: 'shift', date: duty?.date || local.date }) + '</section>' +
      '<section class="panel next-card"><div><span class="eyebrow">NEXT DUTY</span><h2>' + E(next?.shift || 'No duty entered') +
      '</h2><p class="muted">' + E(next ? joined([dated(next.date), dutyLabel(next)]) : 'Roster dates are set by you.') +
      '</p></div></section></div>' + quick + scopedTabs() +
      '<div class="metric-strip">' + metric(overdue.length, 'Overdue', 'home-overdue', true) +
      metric(blocks.length, 'Time blocks', 'home-appointments') + metric(dueSoon.length, 'Due soon', 'home-soon') +
      metric(waiting.length, 'Waiting', 'home-waiting', true) + '</div>' +
      '<div class="split"><div class="stack">' +
      rosterAlertPanel(tasks) +
      listPanel('My priorities', priorities, 'Open a task and choose Top priority to put it here.', 'home-focus', linkButton('Tasks', 'tasks')) +
      listPanel('Today’s tasks', todays, 'No tasks are planned or due today.', 'home-tasks') +
      panel('Daily timeline', rowsView(timeline, { timeline: true, date: local.date, limit: 6, empty: 'No timed entries today.' }) +
        (overlaps.size ? note('Some appointments overlap. Check their times in Planner.', 'warn') : '') +
        (nightLogs.length ? '<h3>Earlier in this duty</h3>' + rowsView(nightLogs, { timeline: true, showDate: true, limit: 8 }) : ''),
      linkButton('Planner', 'planner'), '', 'home-timeline') +
      listPanel('Overdue', overdue, 'No overdue tasks.', 'home-overdue') +
      '</div><div class="stack">' +
      panel('Upcoming time blocks', rowsView(blocks, { timeline: true, showDate: true, limit: 5, empty: 'No upcoming blocks or appointments.' }),
        linkButton('Planner', 'planner'), '', 'home-appointments') +
      panel('Routines', routinesFor(routineDate, duty?.shift || '', state.scope),
        linkButton('Checklists', 'planner', { sub: 'templates', date: routineDate }) + linkButton('Work Routines', 'work'), viewDate(routineDate)) +
      (state.scope !== 'work' ? panel('Namaz & Zikr', dayTools.faithSummary(local.date, local),
        linkButton('Open faith diary', 'faith', { date: local.date })) : '') +
      (state.scope !== 'personal' ? panel('Pending handover', handoverRows(pending, 5),
        linkButton('Open handover', 'shift', { sub: 'handover', date: routineDate })) : '') +
      listPanel('Quick notes', notes, 'No notes for today.', 'home-notes', btn('New note', 'add', { type: 'note' }, { cls: 'text-button small', icon: 'plus' })) +
      '</div></div><details class="section-actions"><summary>More work to review</summary><div class="two-cols">' +
      listPanel('Due soon', dueSoon, 'No upcoming deadlines.', 'home-soon') +
      listPanel('Waiting for a response', waiting, 'No items waiting for a response.', 'home-waiting') +
      listPanel('Carried forward', carrying, 'No other unfinished tasks from earlier dates.', 'home-carry') +
      listPanel('MWR and other follow-ups', follow, 'No follow-ups due soon.', 'home-follow') + '</div></details>';
  }

  function diaryPage() {
    const date = state.date;
    const entries = scheduledDay(date);
    const clashes = D.overlaps(entries);
    const pinned = entries.filter(row => row.pinned);
    const duty = selectedDuty();
    const work = entries.filter(row => row.scope === 'work');
    const personal = entries.filter(row => row.scope === 'personal');
    const onTimeline = new Set(entries.map(code));
    const carried = taskRows().filter(row => scope(row) && W.openTaskOn(row, date) &&
      D.taskDay(row) < date && !onTimeline.has(code(row))).sort(order);
    const journal = rows => rowsView(rows.filter(row => row.type === 'note'), { preview: true, empty: 'No journal notes for this date.' });
    const dayRows = rows => {
      if (!rows.length) return empty('No entries for this date.');
      return '<div class="rows timeline">' + rows.map(row => rowView(row, {
        timeline: true, date, preview: true, overlap: clashes.has(code(row))
      })).join('') + '</div>';
    };
    return page('DAILY DIARY', dated(date), joined([viewDate().split(',')[0], duty ? duty.shift + ' · ' + dutyLabel(duty) : '']), dateNav()) +
      scopedTabs() +
      (pinned.length ? panel('Pinned entries', rowsView(pinned)) : '') +
      '<div class="two-cols diary-columns">' +
      (state.scope !== 'personal' ? panel('Work', dayRows(work) + '<details><summary>Work journal</summary>' + journal(work) + '</details>') : '') +
      (state.scope !== 'work' ? panel('Personal', dayRows(personal) + '<details><summary>Personal journal</summary>' + journal(personal) + '</details>') : '') +
      '</div>' + (state.scope !== 'work' ? panel('Faith diary', dayTools.faithSummary(date), linkButton('Namaz & Zikr', 'faith', { date })) : '') +
      '<div class="actions section-actions">' +
      btn('Write a note', 'add', { type: 'note', date }, { icon: 'plus' }) + btn('Print this day', 'print-day', { date }) +
      '</div>' + (carried.length ? panel('Carried forward', rowsView(carried, { showDate: true }),
        linkButton('Tasks', 'tasks'), 'Unfinished tasks from earlier dates.') : '');
  }

  const MWR_TASK = { none: 'No MWR', 'to-raise': 'MWR to raise', raised: 'MWR raised', closed: 'MWR closed' };

  function matchesTask(row) {
    const local = now();
    const find = D.tidy(state.taskQuery).toLocaleLowerCase('en');
    const window = state.taskWindow;
    const sticky = W.isSticky(row);
    return (state.taskKind !== 'task' || !sticky) && (state.taskKind !== 'sticky' || sticky) &&
      scope(row) && (!state.taskStatus || row.status === state.taskStatus) &&
      (!state.taskPriority || row.priority === state.taskPriority) && (!state.taskArea || row.area === state.taskArea) &&
      (!state.taskShift || row.shift === state.taskShift) &&
      (!state.taskAssignment || (D.assignmentOf(row) || '_none') === state.taskAssignment) &&
      (state.tasks !== 'assignments' || !state.taskPerson || W.personKey(W.personName(row)) === state.taskPerson) &&
      (!state.taskHeading || row.routineHeading === state.taskHeading) &&
      (!window || (window === 'today' && W.openTaskOn(row, stickyDutyDay())) ||
        (window === 'overdue' && D.isOverdue(row, local)) || (window === 'upcoming' && D.open(row) &&
          (D.taskDay(row) > local.date || row.dueDate > local.date))) &&
      (!find || [row.title, row.body, row.number, row.area, row.equipment, row.person, row.handover,
        row.department, W.personName(row), row.routineHeading, D.ASSIGNERS[D.assignmentOf(row)], row.contactDetails,
        named(db.contacts, row.contactId)].join(' ').toLocaleLowerCase('en').includes(find));
  }

  const routineTask = row => W.isSticky(row) && (row.shiftStickyKey || row.shiftReminderKey);
  const taskFiltersActive = () => state.scope || state.taskStatus || state.taskPriority || state.taskArea || state.taskShift ||
    state.taskWindow || state.taskQuery || state.taskAssignment || state.taskHeading;
  const collapseTaskRoutines = () => !taskFiltersActive() && state.taskKind !== 'sticky';
  function inTaskList(row) {
    if (state.taskCollection === 'done') return !D.open(row);
    const end = D.addDays(D.weekStart(now().date), 6);
    return D.open(row) && (state.taskCollection === 'open' || D.taskDay(row) <= end ||
      row.dueDate && row.dueDate <= end || row.followDate && row.followDate <= end);
  }
  function taskOrderVisible(row, current, column) {
    return matchesTask(row) && (column ? row.status === current.status : inTaskList(row) &&
      (!collapseTaskRoutines() || !routineTask(row)));
  }

  function relatedWork(row) {
    const parent = row.planParentId && D.byId(db.entries, row.planParentId);
    const assignment = D.portfolio.active(db, row.portfolioId);
    const links = [parent && D.active(parent) ? btn('Task · ' + parent.title, 'entry-view', { id: parent.id }, { cls: 'workspace-link' }) : '',
      assignment ? btn('Assignment · ' + assignment.title, 'portfolio-open', { id: assignment.id }, { cls: 'workspace-link' }) : ''].join('');
    return links ? '<div class="workspace-links">' + links + '</div>' : '';
  }

  function whereItAppears(row) {
    if (!D.active(row) || !D.dayPlan.tracked(row) && !D.timed(row)) return '';
    const id = row.id;
    const local = now().date;
    const sticky = W.isSticky(row) ? btn(W.stickyLabel(row) + ' · Stickies', 'navigate', {
      view: 'stickies', sub: D.open(row) ? 'today' : 'done', date: W.stickyKind(row) === 'shift' ? D.taskDay(row) : row.date, item: id
    }, { cls: 'workspace-link' }) : '';
    const home = row.type === 'task' ? btn('Tasks', 'navigate', { view: 'tasks', sub: D.open(row) ? 'open' : 'done', item: id },
      { cls: 'workspace-link' }) : ['followup', 'mwr'].includes(row.type) ? btn('Work Registers', 'navigate',
      { view: 'registers', sub: row.type === 'followup' ? 'followup' : row.status === 'planned' ? 'mwr-planned' : 'mwr-raised' },
      { cls: 'workspace-link' }) : '';
    const base = D.open(row) && row.date < local ? local : row.date;
    const plan = D.dayPlan.build(db, base);
    const block = plan.busy.find(item => item.row && D.same(item.row.id, id) && D.parts(item.start).date >= base);
    const start = block && D.parts(block.start);
    const place = start ? btn('Day Planner · ' + dated(start.date) + ' ' + start.time, 'navigate', { view: 'dayplan', date: start.date, item: id },
      { cls: 'workspace-link' }) : D.open(row) && D.dayPlan.tracked(row) ? '<small class="muted">Day Planner when scheduled</small>' : '';
    const related = relatedWork(row);
    return home || place || related ? '<section class="where-shown"><h3>Where it appears</h3><div class="workspace-links">' + home + sticky + place +
      '</div>' + related + '</section>' : '';
  }

  function taskCard(row, movement = false) {
    const id = remember(row);
    const completed = row.status === 'done';
    const late = D.isOverdue(row, now());
    const plan = joined([dated(row.date), row.time]);
    const due = joined([dated(row.dueDate), row.dueTime]);
    const dateLine = (label, value, tone = '') => '<div class="task-date ' + tone + '"><small>' + label + '</small><span>' + E(value) + '</span></div>';
    const dates = (due ? dateLine(late ? 'Overdue' : plan === due ? 'Planned &amp; due' : 'Due', due, late ? 'late' : 'deadline') : '') +
      (plan !== due ? dateLine('Planned', plan) : '');
    return '<article class="taskcard" data-taskcard="' + E(id) + '" data-status="' + E(row.status) + '" data-priority="' + E(row.priority) + '">' +
      '<div class="task-card-main">' + btn(row.title, 'entry-view', { id }, { cls: 'task-card-title' }) +
      entryMeta(row, { taskSummary: true }) + (row.focus ? '<small class="task-top-priority">Top priority</small>' : '') + '</div>' +
      '<div class="task-dates">' + dates + '</div><div class="task-actions">' +
      (movement ? ibtn('grip', 'Drag ' + row.title, 'drag', { id }) : '') +
      ibtn(completed ? 'reopen' : 'check', (completed ? 'Reopen ' : 'Complete ') + row.title, 'task-status', { id, status: completed ? 'todo' : 'done' }) +
      ibtn('more', 'Task actions for ' + row.title, 'task-options', { id, manual: movement ? 'yes' : 'no' }) + '</div></article>';
  }

  function taskOptions({ id, manual }) {
    const row = fetchRow(id);
    if (!row || row.type !== 'task' || !D.active(row)) throw new Error('This task is no longer available.');
    const linkedOpen = D.hierarchy.index(db).openChildren(row);
    const column = state.tasks === 'board';
    const ordered = manual === 'yes' ? taskRows().filter(item => taskOrderVisible(item, row, column)).sort(order) : [];
    const index = ordered.findIndex(item => D.same(item.id, id));
    const statuses = Object.entries(D.STATUS).map(([status, label]) => btn(label, 'task-status', { id, status },
      { cls: 'small', pressed: row.status === status, disabled: row.status === status || status === 'done' && linkedOpen.length > 0 })).join('');
    const movement = index < 0 ? '' : '<fieldset><legend>Manual order</legend><div class="actions">' +
      btn('Move up', 'task-move', { id, direction: 'up' }, { icon: 'up', disabled: index === 0 }) +
      btn('Move down', 'task-move', { id, direction: 'down' }, { icon: 'down', disabled: index === ordered.length - 1 }) + '</div></fieldset>';
    openDialog('task-options', 'Task actions', '<div class="stack"><strong>' + E(row.title) + '</strong>' +
      '<fieldset><legend>Status</legend><div class="actions">' + statuses + '</div></fieldset>' + movement +
      (linkedOpen.length ? '<p class="muted">' + E(linkedOpen.length + ' linked items still open.') + ' ' +
        btn('Open linked work', 'entry-view', { id }, { cls: 'small' }) + '</p>' : '') +
      '<div class="actions">' + btn('Record result', 'progress-edit', { id, result: 'yes' }, { cls: 'small' }) +
      btn('Closure details', 'follow-edit', { id }, { cls: 'small' }) + '</div></div>',
      btn('Close', 'close-dialog') + btn('Progress & follow-up', 'progress-edit', { id }) + btn('Move date', 'reschedule', { id }, { icon: 'calendar' }) +
      btn('Adjust task timing', 'plan-adjust-task', { id }) +
      btn('Edit task', 'entry-edit', { id }, { cls: 'primary', icon: 'edit' }));
  }

  function taskCards(rows, movement = false, message = 'No tasks match this view.') {
    return rows.length ? rows.map(row => taskCard(row, movement)).join('') : empty(message);
  }

  function compactTaskRow(row, { canConvert = false, showPlan = false } = {}) {
    const id = code(row);
    return '<article class="dock-task-row"><div>' + btn(row.title, 'entry-view', { id }, { cls: 'row-title', label: row.title }) +
      '<div class="pills">' + dutyWarning(row) + chip(row.dueDate && 'Due ' + joined([dated(row.dueDate), row.dueTime])) +
      (showPlan ? chip(D.STATUS[row.status]) + chip('Planned ' + joined([dated(row.date), row.time])) : '') +
      (row.taskPinned ? chip('Pinned') : '') + '</div>' +
      (canConvert ? btn('Make sticky', 'task-sticky', { id, show: 'yes' }, { cls: 'small text-button', label: 'Make sticky ' + row.title }) : '') + '</div>' +
      ibtn('check', 'Complete ' + row.title, 'task-status', { id, status: 'done' }) + '</article>';
  }

  function taskDockRows() {
    const day = stickyDutyDay();
    const rows = taskRows().filter(row => W.openTaskOn(row, day) && !W.isSticky(row) && row.taskPinned).sort((a, b) => Number(b.taskPinned === true) - Number(a.taskPinned === true) ||
      Number(dutyAlerts.has(code(b))) - Number(dutyAlerts.has(code(a))) || order(a, b));
    return rows.map(row => compactTaskRow(row)).join('') || empty('No open tasks.');
  }

  function focusBothPage() {
    const openTasks = taskRows().filter(row => W.openTaskOn(row, state.date) && !W.isSticky(row)).sort(order);
    return page('FOCUS', 'Stickies & Tasks', '', btn('New task', 'add', { type: 'task' }, { cls: 'primary', icon: 'plus' })) +
      '<div class="focus-columns"><section class="focus-sticky-board" aria-label="Stickies">' + dayTools.stickyPage(true) + '</section>' +
      panel('Tasks', '<div class="focus-task-list">' + (openTasks.map(row => compactTaskRow(row, { canConvert: true, showPlan: true })).join('') ||
        empty('No other open tasks.')) + '</div>') + '</div>';
  }

  function namedAssignments(visible, compare) {
    const names = W.assigners(db);
    const selected = names.find(name => W.personKey(name) === state.taskPerson);
    const nameButtons = btn('All names', 'tasks-by-person', { directory: 'yes' }, { cls: 'small', pressed: !selected }) +
      names.map(name => btn(name, 'tasks-by-person', { name, directory: 'yes' }, { cls: 'small', pressed: W.personKey(name) === state.taskPerson,
        label: 'Show tasks from ' + name })).join('');
    const directory = panel('People', '<div class="actions">' + nameButtons + '</div>', btn('Add name', 'add-assigner', {}, { cls: 'small', icon: 'plus' }));
    return directory + (selected ? panel(selected, taskCards(visible.sort(compare), false, 'No tasks for this person match the current filters.'),
      btn('New task', 'add', { type: 'task', 'assigned-by': selected, assignment: W.personRole(selected) }, { cls: 'small primary', icon: 'plus' }),
      D.ASSIGNERS[W.personRole(selected)] || '') : '');
  }

  function tasksPage() {
    const visible = taskRows().filter(matchesTask);
    const compare = state.sort === 'priority'
      ? (a, b) => Object.keys(PRIORITY).indexOf(a.priority) - Object.keys(PRIORITY).indexOf(b.priority) || order(a, b)
      : state.sort === 'due'
        ? (a, b) => (a.dueDate || '9999').localeCompare(b.dueDate || '9999') || D.str(a.dueTime).localeCompare(D.str(b.dueTime)) || order(a, b)
        : order;
    const board = state.tasks === 'board';
    const layout = tabs({ list: 'Simple list', board: 'Board', assignments: 'By assigner' }, 'tasks', 'Task layout');
    const areas = D.unique([...D.taskDesk.AREAS, ...taskRows().map(row => row.area)].filter(Boolean));
    const headings = D.unique(taskRows().map(row => row.routineHeading).filter(Boolean)).sort();
    const choices = (values, all) => ({ '': all, ...Object.fromEntries(values.map(value => [value, value])) });
    const filters = '<form id="task-filter-form" class="task-filters"><div class="toolbar-filter">' +
      input('taskQuery', 'Find tasks', state.taskQuery, { placeholder: 'Task, person or MWR' }) +
      select('taskWindow', 'When', { '': 'Any date', today: 'Selected duty & carryover', upcoming: 'Upcoming', overdue: 'Overdue' }, state.taskWindow) +
      '<button type="submit">Apply filters</button>' + btn('Clear', 'task-clear', {}, { cls: 'text-button' }) +
      '</div><details' + (state.taskStatus || state.taskPriority || state.taskArea || state.taskShift || state.taskAssignment || state.taskHeading ? ' open' : '') +
      '><summary>More task filters</summary><div class="toolbar-filter">' +
      select('taskStatus', 'Status', { '': 'All statuses', ...D.STATUS }, state.taskStatus, ' data-setting-tab="taskStatus"') +
      select('taskPriority', 'Priority', { '': 'All priorities', ...PRIORITY }, state.taskPriority, ' data-setting-tab="taskPriority"') +
      select('taskArea', 'Area', choices(areas, 'All areas'), state.taskArea, ' data-setting-tab="taskArea"') +
      select('taskShift', 'Shift', choices(Object.keys(D.SHIFT), 'All shifts'), state.taskShift, ' data-setting-tab="taskShift"') +
      select('taskAssignment', 'Assigned by role', { '': 'All assigners', ...D.ASSIGNERS, _none: 'Unassigned' },
        state.taskAssignment, ' data-setting-tab="taskAssignment"') +
      select('taskHeading', 'Work heading', choices(headings, 'All headings'), state.taskHeading, ' data-setting-tab="taskHeading"') +
      '</div></details></form>';
    const grouped = () => '<div class="assignment-grid">' + Object.entries({ ...D.ASSIGNERS, _none: 'Unassigned' })
      .filter(([key]) => !state.taskAssignment || key === state.taskAssignment).map(([key, label]) => {
        const records = visible.filter(row => (D.assignmentOf(row) || '_none') === key).sort(compare);
        return panel(label, taskCards(records, false, 'No tasks in this group.'),
          btn('New task', 'add', { type: 'task', assignment: key === '_none' ? '' : key }, { cls: 'small', label: 'New task from ' + label }));
      }).join('') + '</div>';
    const open = visible.filter(D.open).length;
    const overdue = visible.filter(row => D.isOverdue(row, now())).length;
    const summary = open + ' open · ' + (visible.length - open) + ' done' + (overdue ? ' · ' + overdue + ' overdue' : '');
    const heading = page('', 'Tasks', '', btn('New task', 'quick-task', {}, { cls: 'primary', icon: 'plus' }));
    const kinds = tabs({ all: 'Tasks & stickies', task: 'Tasks only', sticky: 'Stickies only' }, 'taskKind', 'Work type');
    if (state.tasks === 'list') {
      const done = state.taskCollection === 'done';
      const rows = visible.filter(inTaskList).sort(done ? (a, b) => D.str(b.completedAt).localeCompare(D.str(a.completedAt)) : compare);
      const sorting = select('sort', 'Sort', { manual: 'Manual position', priority: 'Priority', due: 'Due date' }, state.sort, ' data-setting-tab="sort"');
      const filtered = taskFiltersActive();
      const regular = collapseTaskRoutines() ? rows.filter(row => !routineTask(row)) : rows;
      const routines = collapseTaskRoutines() ? rows.filter(routineTask) : [];
      const tree = D.hierarchy.index(db);
      const list = (items, movement) => items.map(row => {
        const id = row.id;
        const late = D.isOverdue(row, now());
        const branch = D.progress.task(row, tree);
        const progress = branch.total ? (branch.remaining ? branch.complete + '/' + branch.total + ' linked done' : 'Ready to close') :
          branch.percent > 0 && branch.percent + '%';
        const timing = joined([row.dueDate && (late ? 'Overdue ' : 'Due ') + joined([dated(row.dueDate), row.dueTime]),
          (!row.dueDate || row.time) && row.date && 'Planned ' + joined([dated(row.date), row.time]), W.isSticky(row) && W.stickyLabel(row),
          D.open(row) && row.status !== 'todo' && D.STATUS[row.status], D.open(row) && progress,
          D.open(row) && row.followDate && 'Follow up ' + joined([dated(row.followDate), row.followTime])]);
        return '<article class="simple-task-row taskcard" data-taskcard="' + E(id) + '" data-status="' + E(row.status) + '">' +
          ibtn(done ? 'reopen' : 'check', (done ? 'Reopen ' : 'Complete ') + row.title, 'task-status', { id, status: done ? 'todo' : 'done' }) +
          '<div>' + btn(row.title, 'entry-view', { id }, { cls: 'row-title' }) + (timing ? '<small' + (late ? ' class="late"' : '') + '>' + E(timing) + '</small>' : '') +
          relatedWork(row) + '</div><div class="actions">' + (movement && state.sort === 'manual' && !done && items.length > 1 ? ibtn('grip', 'Drag ' + row.title, 'drag', { id }) : '') +
          ibtn('more', 'Task actions for ' + row.title, 'task-options', { id, manual: movement && state.sort === 'manual' && !done ? 'yes' : 'no' }) + '</div></article>';
      }).join('');
      return heading + '<div class="workspace-switch">' + tabs({ week: 'This week', open: 'All open', done: 'Completed' }, 'taskCollection', 'Tasks view') +
        '<details class="workspace-options" data-keep-open="task-options"' + (filtered ? ' open' : '') + '><summary>Task options</summary>' + layout + scopedTabs() + filters + sorting + '</details></div>' +
        '<div class="task-kind-tabs">' + kinds + '</div><section class="simple-list" aria-label="Tasks"><div data-task-list>' +
        (list(regular, true) || (!routines.length ? empty(done ? 'No completed items.' :
          state.taskCollection === 'week' ? 'No open items for this week.' : 'No open items.') : '')) + '</div>' +
        (routines.length ? '<details class="task-routines" data-keep-open="task-routines"><summary>Shift routine stickies (' + routines.length +
          ')</summary>' + list(routines, false) + '</details>' : '') + '</section>';
    }
    return heading + '<div class="task-view-bar">' + kinds + scopedTabs() + layout + '</div>' + filters +
      rosterAlertPanel(visible, false) +
      (state.tasks === 'assignments' ? namedAssignments(visible, compare) + (state.taskPerson ? '' : grouped()) : board ? '<p class="task-board-help">' + E(summary) +
        ' · Drag between columns or set a status in Task actions.</p><div class="board" data-board>' +
        Object.entries(D.STATUS).map(([status, label]) => {
          const column = visible.filter(row => row.status === status).sort(order);
          return '<section class="lane" data-lane="' + status + '"><h2>' + label + chip(String(column.length)) + '</h2>' +
            taskCards(column, true, 'No tasks in this column.') + '</section>';
        }).join('') + '</div>'
        : '<section class="task-list" aria-label="Task list"><header class="task-list-head"><div><h2>Task list</h2><p>' + E(summary) + '</p></div>' +
        select('sort', 'Sort', { manual: 'Manual position', priority: 'Priority', due: 'Due date' }, state.sort, ' data-setting-tab="sort"') + '</header>' +
        (visible.length ? '<div class="task-list-columns" aria-hidden="true"><span>Task</span><span>Schedule</span><span>Actions</span></div>' : '') +
        '<div data-task-list>' + taskCards(visible.sort(compare), state.sort === 'manual') + '</div></section>');
  }

  function quickTask({ assignment, date: target, schedule } = {}) {
    const parent = D.portfolio.active(db, assignment);
    if (assignment && !parent) throw new Error('This assignment is no longer available.');
    const scheduled = !!parent && schedule === 'yes';
    const date = D.parseDate(target) || (parent?.assignedDate > now().date ? parent.assignedDate : now().date);
    const fields = input('title', 'Task', scheduled ? parent.title : '', { wide: true, extra: ' maxlength="500" data-initial-focus' }) +
      dateInput('date', 'Planned date', date) + (scheduled ? timeInput('time', 'Start time (optional)', '') +
        input('minutes', 'Estimated minutes', 25, { type: 'number', extra: ' min="1" max="1440" step="1"' }) : '') +
      dateInput('dueDate', 'Due date (optional)', '') +
      '<details class="workspace-options wide"><summary>Details</summary><div class="form-grid">' +
      (parent ? '' : select('scope', 'Type', { work: 'Work', personal: 'Personal' }, 'work')) + textarea('body', 'Note (optional)', '') + '</div></details>';
    openDialog('quick-task', scheduled ? 'Schedule a task from assignment' : 'New task', (parent ? '<p class="muted">Linked to ' + E(parent.title) + '</p>' : '') +
      '<form id="quick-task-form" class="form-grid" novalidate>' + fields + '</form>', btn('Cancel', 'close-dialog') +
      '<button type="submit" form="quick-task-form" class="primary">' + (scheduled ? 'Schedule task' : 'Save task') + '</button>',
      { row: { assignment, scheduled } });
  }

  async function saveQuickTask(form, link) {
    const values = new FormData(form);
    const title = D.tidy(values.get('title'));
    const date = readDate(values, 'date', 'the planned date', true);
    const dueDate = readDate(values, 'dueDate', 'the due date');
    const time = link?.scheduled ? readTime(values, 'time', 'the start time') : '';
    const minutes = link?.scheduled && D.tidy(values.get('minutes')) ? Number(values.get('minutes')) : null;
    if (!title || title.length > 500) throw new Error('Enter a task title of up to 500 characters.');
    if (minutes !== null && (!Number.isInteger(minutes) || minutes < 1 || minutes > 1440)) {
      throw new Error('Enter a whole duration from 1 to 1440 minutes.');
    }
    await commit(data => {
      const parent = D.portfolio.active(data, link?.assignment);
      if (link?.assignment && !parent) throw new Error('This assignment is no longer available.');
      D.workTask(data, { title, date, dueDate, body: formValue(values, 'body'), scope: !parent && values.get('scope') === 'personal' ? 'personal' : 'work',
        ...(link?.scheduled ? { time, planMinutes: minutes, planFlexible: !time, planNotBefore: true } : {}),
        ...(parent ? { portfolioId: D.str(parent.id), assignedBy: parent.assignedBy } : {}) });
    }, link?.scheduled ? 'Task scheduled for ' + joined([dated(date), time]) + '.' : 'Task saved.');
  }

  function plannerPage() {
    const view = state.planner;
    const modes = tabs({ day: 'Day', week: 'Week', month: 'Month', templates: 'Checklists', goals: 'Goals' }, 'planner', 'Planner view');
    const heading = page('DIARY', 'Planner', 'Appointments, time blocks and work deadlines.', dateNav());
    if (view === 'templates') return heading + modes + templatesPage();
    if (view === 'goals') return heading + modes + goalsPage();
    const date = state.date;
    const [first, last] = view === 'month' ? D.monthRange(date) : [D.weekStart(date), D.addDays(D.weekStart(date), 6)];
    const start = view === 'day' ? date : D.weekStart(first);
    const end = view === 'day' ? date : D.addDays(D.weekStart(last), 6);
    const rows = D.eventsIn(db, start, end).filter(scope);
    const clashes = D.overlaps(rows);
    const description = view === 'day' ? viewDate(date) : dated(first) + ' – ' + dated(last);
    function onDay(day) {
      return rows.filter(row => row.date === day || (row.date < day && D.calendarEnd(row) >= day) ||
        row.dueDate === day || row.followDate === day || row.dutyDate === day).sort((a, b) => chronological(a, b, day));
    }
    const add = btn('New event', 'add', { type: 'event', date }, { cls: 'text-button', icon: 'plus' });
    if (view === 'day') {
      const day = onDay(date);
      return heading + modes + scopedTabs() + panel(description, (clashes.size ? note('Check the appointments marked Overlap.', 'warn') : '') +
        (day.length ? '<div class="rows timeline">' + day.map(row => rowView(row, {
          date, timeline: true, preview: true, overlap: clashes.has(code(row))
        })).join('') + '</div>' : empty('Nothing scheduled for this date.')), add);
    }
    const current = now().date;
    const cells = [];
    for (let day = start; day <= end; day = D.addDays(day, 1)) {
      const items = onDay(day);
      const duty = db.roster.find(row => row.date === day);
      const dayName = view === 'week' ? viewDate(day) : day.slice(-2);
      cells.push('<div class="cal-day' + (day < first || day > last ? ' outside' : '') + (day === current ? ' is-today' : '') + '">' +
        btn(dayName, 'planner-day', { date: day }, { cls: 'text-button small', label: 'Open ' + dated(day) }) +
        (duty ? '<small class="cal-duty">' + E(duty.shift) + '</small>' : '') +
        items.slice(0, view === 'week' ? 8 : 3).map(row => btn(joined([rowTime(row, day), row.title, clashes.has(code(row)) ? 'Overlap' : '']),
          'entry-view', { id: remember(row) }, { cls: 'cal-item' + (clashes.has(code(row)) ? ' overlap' : '') })).join('') +
        (items.length ? '<small class="cal-summary">' + items.length + (items.some(row => clashes.has(code(row))) ? ' · overlap' : '') + '</small>' : '') +
        '</div>');
    }
    return heading + modes + scopedTabs() + panel(description,
      (clashes.size ? note('Check the appointments marked Overlap.', 'warn') : '') +
      '<div class="calendar ' + view + '">' + WEEK.map(label => '<div class="cal-head">' + label + '</div>').join('') + cells.join('') + '</div>', add);
  }

  function openDialog(kind, title, body, footer = '', details = {}) {
    modal = { kind, dirty: false, ...details };
    dialog.innerHTML = '<header class="dialog-head"><h2 id="dialog-title">' + E(title) + '</h2>' +
      ibtn('close', 'Close dialog', 'close-dialog') + '</header><div class="dialog-content"><p id="dialog-error" class="notice error" role="alert" hidden></p>' +
      body + '</div>' + (footer ? '<footer class="dialog-footer">' + footer + '</footer>' : '');
    N.mount(dialog, Object.hasOwn(details, 'noteStyles') ? details.noteStyles : details.row?.noteStyles);
    if (!dialog.open) dialog.showModal();
    const first = $('[data-initial-focus]', dialog);
    if (first) first.focus();
    dialog.scrollTop = 0;
  }

  function showError(error) {
    const text = error instanceof Error ? error.message : String(error);
    const target = dialog.open && $('#dialog-error');
    if (target) {
      target.textContent = text;
      target.hidden = false;
      target.scrollIntoView({ block: 'nearest' });
    } else toast(text);
  }

  function ask(title, message, label, callback) {
    confirmCallback = callback;
    confirmBox.innerHTML = '<div class="dialog-head"><h2 id="confirm-title">' + E(title) + '</h2></div>' +
      '<div class="dialog-content"><p>' + E(message) + '</p></div><div class="dialog-footer">' +
      btn('Cancel', 'confirm-no') + btn(label, 'confirm-yes', {}, { cls: 'primary' }) + '</div>';
    if (!confirmBox.open) confirmBox.showModal();
    $('[data-action="confirm-no"]', confirmBox).focus();
  }

  function closeDialog(force = false) {
    if (!dialog.open || modal?.busy) return;
    if (!force && modal?.dirty) {
      ask('Discard edits?', 'This form contains unsaved changes.', 'Discard edits', () => closeDialog(true));
      return;
    }
    dialog.close();
    modal = null;
  }

  function fetchRow(id) {
    return D.byId(db.entries, id) || state.visibleRows.get(String(id));
  }

  function blankEntry(type, attrs = {}) {
    const local = now();
    const date = D.parseDate(attrs.date) || (state.view === 'today' ? local.date : state.date);
    const duty = D.dutyAt(db.roster).current;
    const work = ['log', 'mwr', 'followup'].includes(type);
    const dutyDate = attrs.dutyDate || (state.view === 'shift' ? state.date : duty?.date || date);
    const shift = attrs.dutyShift || db.roster.find(row => row.date === dutyDate)?.shift;
    const shiftWindow = D.dutyWindow({ date: dutyDate, shift });
    const logDate = type === 'log' && !attrs.date && shiftWindow && Date.now() >= shiftWindow.start && Date.now() < shiftWindow.end
      ? local.date : date;
    return {
      id: D.uid(), type, title: '', body: '', date: logDate, time: type === 'log' ? (logDate === local.date ? local.time : D.SHIFT[shift]?.start) || '' :
        type === 'note' && date === local.date ? local.time : '', scope: work ? 'work' : state.scope || 'work',
      status: type === 'mwr' ? (state.register === 'mwr-raised' ? 'raised' : 'planned') :
        ['task', 'followup'].includes(type) ? 'todo' : '',
      priority: 'normal', role: 'Routine', assignment: '', tags: [], links: [], attachments: [], subtasks: [],
      phase: state.view === 'shift' && Object.hasOwn(D.PHASES, state.phase) ? state.phase : 'during', dutyDate: type === 'log' ? dutyDate : '',
      dutyShift: type === 'log' && D.SHIFT[shift]?.start ? shift : '', ...attrs
    };
  }

  function chooseEntry() {
    openDialog('choose', 'Add Entry', '<p class="muted">Choose what you want to record.</p><div class="entry-choices">' +
      Object.entries(D.TYPES).map(([type, label]) => btn(label, 'add', { type }, { icon: {
        task: 'checklist', note: 'book', event: 'calendar', meeting: 'calendar', log: 'clock', mwr: 'folder', followup: 'link'
      }[type] })).join('') + btn('Expense or income', 'money-edit', {}, { icon: 'wallet' }) + '</div>', btn('Cancel', 'close-dialog'));
  }

  function subtaskRow(item = {}, index = 0) {
    return '<div class="subtask-row" data-subtask="' + index + '"><input type="hidden" name="subId" value="' +
      E(item.id ?? D.uid()) + '"><input type="checkbox" name="subDone-' + index + '" aria-label="Subtask ' + (index + 1) +
      ' complete"' + (item.done ? ' checked' : '') + '><input name="subTitle" value="' + E(item.title) +
      '" aria-label="Subtask ' + (index + 1) + ' title" placeholder="Subtask">' +
      ibtn('close', 'Remove subtask', 'subtask-remove') + '</div>';
  }

  function entryFields(row) {
    const type = row.type;
    const task = type === 'task';
    const log = type === 'log';
    const follow = type === 'followup';
    const mwr = type === 'mwr';
    const meeting = type === 'meeting';
    const timed = D.timed(row);
    const advanced = task || follow || mwr || log;
    const statusOptions = mwr ? D.MWR : D.STATUS;
    const choices = (rows, id, label) => Object.fromEntries([['', label], ...rows
      .filter(item => !item.deletedAt || D.same(item.id, id))
      .map(item => [item.id, item.name + (item.deletedAt ? ' (deleted)' : '')])]);
    const people = choices(db.contacts, row.contactId, 'Choose a saved contact');
    const notebooks = choices(db.notebooks, row.notebookId, 'Choose a notebook');
    const bodyLabel = ({ note: 'Journal note', log: 'Observation or activity', mwr: 'Description', followup: 'What needs follow-up' })[type] || 'Details';
    const dateLabel = task ? 'Planned date' : log ? 'Log date' : timed ? 'Start date' : 'Entry date';
    let fields = input('title', type === 'note' ? 'Note title' : 'Title', row.title, { wide: true, extra: ' maxlength="500" data-initial-focus' }) +
      (log || mwr ? '' : select('scope', 'Category', { work: 'Work', personal: 'Personal' }, row.scope)) +
      dateInput('date', dateLabel, row.date) +
      (type === 'note' || log || timed ? timeInput('time', log ? 'Log time' : timed ? 'Start time' : 'Time (optional)', row.time) : '') +
      (timed ? dateInput('endDate', 'End date (optional)', row.endDate) + timeInput('endTime', 'End time (optional)', row.endTime) : '') +
      (type === 'event' ? select('kind', 'Event type', ['Appointment', 'Time block', 'Deadline', 'Personal date', 'Other'], row.kind || 'Appointment') : '') +
      (task || follow ? dateInput('dueDate', 'Due date (optional)', row.dueDate) + timeInput('dueTime', 'Due time (optional)', row.dueTime) : '') +
      (task ? select('priority', 'Priority', PRIORITY, row.priority) : '') +
      (task || follow || mwr ? select('status', 'Status', statusOptions, row.status, ' data-entry-status') : '') +
      (task || follow ? assignerInput(row.assignedBy, 'entry-assigners') +
        select('assignment', 'Assigned by role', { '': 'Unassigned', ...D.ASSIGNERS }, D.assignmentOf(row)) + portfolioTools.entryField(row) : '') +
      (mwr ? input('number', 'MWR number', row.number) + dateInput('raisedDate', 'Date raised', row.raisedDate) : '') +
      (mwr || follow ? dateInput('followDate', 'Next follow-up', row.followDate) + timeInput('followTime', 'Follow-up time (optional)', row.followTime) : '') +
      N.field('body', bodyLabel, row.body);
    if (log) fields += dateInput('dutyDate', 'Duty starting date', row.dutyDate) +
      select('dutyShift', 'Duty', { '': 'Choose duty', ...workingShifts }, row.dutyShift) +
      select('phase', 'Shift phase', D.PHASES, row.phase) + N.field('readings', 'Readings as entered (optional)', row.readings);
    if (meeting) fields += input('participants', 'Participants', row.participants, { wide: true }) +
      N.field('agenda', 'Agenda', row.agenda) + N.field('minutes', 'Minutes', row.minutes) + N.field('decisions', 'Decisions', row.decisions);
    if (advanced) {
      const workFields = input('area', 'Area', row.area, { extra: ' list="plant-areas"' }) +
        '<datalist id="plant-areas">' + D.taskDesk.AREAS.filter(Boolean).map(area => '<option value="' + E(area) + '"></option>').join('') +
        '</datalist>' + input('equipment', 'Equipment / tag', row.equipment) +
        (log ? '' : input('person', 'Responsible person', row.person) + input('department', 'Department', row.department) +
          select('contactId', 'Saved contact', people, row.contactId)) +
        (task || follow ? input('contactDetails', 'Contact details', row.contactDetails) +
          select('role', 'Responsibility group', D.ROLES, row.role || 'Routine') : '') +
        (task ? (row.shiftStickyKey || row.shiftReminderKey ? '<p class="wide muted">' + E(joined([row.shift, dated(row.dutyDate)])) + ' · Roster duty</p>' :
          select('shift', 'Assigned shift', { '': 'No shift', ...Object.fromEntries(Object.keys(D.SHIFT).map(key => [key, key])) }, row.shift)) +
          input('routineHeading', 'Work heading (optional)', row.routineHeading, { extra: ' maxlength="100"' }) +
          (row.shiftStickyKey || row.shiftReminderKey ? '' : dateInput('dutyDate', 'Duty starting date (optional)', row.dutyDate)) +
          input('number', 'MWR number', row.number) + select('mwrStatus', 'MWR status', MWR_TASK, row.mwrStatus || 'none') +
          N.field('handover', 'Handover notes', row.handover) + N.field('closingComment', 'Closing comment', row.closingComment) : '');
      fields += '<details class="wide"' + (mwr || follow || log ? ' open' : '') + '><summary>Work details</summary><div class="form-grid">' + workFields + '</div></details>';
    }
    if (mwr || follow) {
      fields += input('waitingOn', 'Waiting on (optional)', row.waitingOn, { extra: ' maxlength="120"' }) +
        N.field('waitingReason', 'Waiting reason (optional)', row.waitingReason) +
        N.field('updateText', 'Add a dated update (optional)', '') +
        '<div class="wide form-grid" data-closure' + ((mwr ? row.status === 'closed' : row.status === 'done') ? '' : ' hidden') + '>' +
        input('verifiedBy', mwr ? 'Closing verified by' : 'Closure confirmed by', row.verifiedBy) +
        dateInput('closedDate', 'Closure date', row.closedDate) + N.field('closeNotes', 'Closure confirmation', row.closeNotes) + '</div>';
    }
    if (task) {
      const mins = ' min="1" max="1440" step="1"';
      fields += '<details class="wide"' + (row.time || row.planMinutes || row.actualMinutes ? ' open' : '') +
        '><summary>Plan time or record time spent</summary><div class="form-grid">' +
        timeInput('time', 'Planned start', row.time) +
        (row.shiftScheduleKey ? '<p class="muted">Changing the start time updates future occurrences of this routine.</p>' : '') +
        input('planMinutes', 'Planned minutes', row.planMinutes, { type: 'number', extra: mins }) +
        (row.shiftScheduleKey ? '' : '<div class="wide">' + check('planFlexible', 'Let Day Plan move this time', row.planFlexible || !row.time) + '</div>') +
        input('actualMinutes', 'Actual minutes spent', row.actualMinutes, { type: 'number', extra: mins }) +
        dateInput('actualDate', 'Date spent (defaults to today)', row.actualDate) + '</div></details>' +
        '<details class="wide"' + (L(row.subtasks).length ? ' open' : '') + '><summary>Subtasks</summary><div data-subtasks>' +
        L(row.subtasks).map(subtaskRow).join('') + '</div>' + btn('Add subtask', 'subtask-add', {}, { cls: 'text-button', icon: 'plus' }) + '</details>';
    }
    if (task || timed || mwr || follow) {
      fields += '<details class="wide"' + (row.remind ? ' open' : '') + '><summary>Reminder</summary><div class="form-grid">' +
        check('remind', 'Remind me while the diary is open', row.remind) +
        input('remindMinutes', 'Minutes before', row.remindMinutes ?? 0, { type: 'number', extra: ' min="0" max="10080" step="1"' }) +
        '</div><p class="muted">Items with a date only use the default reminder time in Settings.</p></details>';
    }
    if (row.shiftStickyKey) {
      fields += '<p class="wide muted">The roster adds a fresh set of shift routine tasks for each duty date.</p>';
    } else if (row.routineId) {
      fields += '<p class="wide muted">This task came from Work Routines. Edit its schedule there.</p>';
    } else if ((task || timed) && (!row.seriesId || row.legacySeries)) {
      const modes = task ? { '': 'No repeat', fixed: 'Fixed schedule', completion: 'After completion' } : { '': 'No repeat', fixed: 'Fixed schedule' };
      fields += '<details class="wide"' + (row.recurrence ? ' open' : '') + '><summary>Repeat</summary><div class="form-grid">' +
        select('repeatMode', 'Repeat mode', modes, row.recurrence?.mode) +
        input('repeatEvery', 'Every', row.recurrence?.interval ?? 1, { type: 'number', extra: ' min="1" max="365" step="1"' }) +
        select('repeatUnit', 'Interval unit', { day: 'Days', week: 'Weeks', month: 'Months', year: 'Years' }, row.recurrence?.unit || 'month') +
        dateInput('repeatUntil', 'Repeat until (optional)', row.recurrence?.until) + '</div>' +
        '<p class="muted">' + (task ? 'Completing the task schedules one next occurrence. ' : '') +
        'Fixed repeats keep the date pattern. Short months use the last day.</p></details>';
    } else if (row.seriesId) {
      fields += '<p class="wide muted">This is one repeat occurrence. Open the original entry to change the repeat rule.</p>';
    }
    const linked = new Map(L(row.links).map(id => [D.str(id), null]));
    for (const candidate of db.entries.filter(candidate => D.active(candidate) && !D.same(row.id, candidate.id))) linked.set(code(candidate), candidate);
    const linkList = [...linked].sort((a, b) => Number(L(row.links).some(id => D.same(id, b[0]))) - Number(L(row.links).some(id => D.same(id, a[0]))));
    const links = linkList.map(([id, other]) => '<label class="check" data-link-row><input type="checkbox" name="links" value="' +
      E(id) + '"' + (L(row.links).some(value => D.same(id, value)) ? ' checked' : '') + '><span>' +
      E(other ? joined([other.title, D.TYPES[other.type]]) : 'Saved link ' + id) + '</span></label>').join('');
    fields += '<details class="wide"><summary>Tags, links and attachments</summary><div class="form-grid">' +
      input('tags', 'Tags (separate with commas)', L(row.tags).join(', ')) +
      select('notebookId', 'Project or notebook', notebooks, row.notebookId) +
      check('pinned', 'Pin on diary day', row.pinned) + (task ? check('focus', 'Top priority for Today', row.focus) : '') +
      '<fieldset class="wide"><legend>' + (meeting ? 'Linked actions and entries' : 'Link related entries') + '</legend>' +
      (links ? input('linkSearch', 'Find an entry to link', '', { extra: ' data-link-filter' }) + '<div class="link-picker">' + links + '</div>' :
        empty('Add another entry first to link it here.')) + '</fieldset><fieldset class="wide"><legend>Attachments</legend>' +
      L(row.attachments).map((file, index) => '<label class="check"><input type="checkbox" name="keepFile" value="' + index +
        '" checked><span>' + E(file.name + (file.missing ? ' · file bytes missing' : '')) + '</span></label>').join('') +
      '<label>Add files<input type="file" name="files" multiple><span class="hint">Up to 15 MB per file.</span></label></fieldset></div></details>';
    return fields;
  }

  function editEntry(row) {
    if (!row || row.deletedAt) throw new Error('This entry is in Deleted items or is no longer available.');
    const title = (row.editToken && !row.virtual ? (row.draft ? 'Review draft' : 'Edit entry') : 'Add entry') + ' · ' + D.TYPES[row.type];
    openDialog('entry', title, '<form id="entry-form" class="form-grid" novalidate>' + entryFields(row) + '</form>',
      btn('Cancel', 'close-dialog') + (!row.editToken || row.draft || row.virtual ? btn('Save draft', 'entry-save', { draft: 'yes' }) : '') +
      '<button type="submit" form="entry-form" class="primary">Save entry</button>', { row });
  }

  function readDate(formData, name, label, required = false) {
    const value = D.tidy(formData.get(name));
    const result = D.parseDate(value);
    if ((value && !result) || (!result && required)) throw new Error('Enter ' + label + ' as dd-mmm-yyyy.');
    return result;
  }

  function readTime(formData, name, label, required = false) {
    const value = D.tidy(formData.get(name));
    if ((value && !D.timePattern.test(value)) || (!value && required)) throw new Error('Enter ' + label + ' in 24-hour HH:mm format.');
    return value;
  }

  function formValue(formData, name) {
    return D.str(formData.get(name));
  }

  function entryInput(form, base, draft) {
    const values = new FormData(form);
    const current = { ...base };
    const noteStyles = N.capture(values, base.noteStyles);
    const updateStyle = noteStyles?.updateText;
    if (updateStyle) delete noteStyles.updateText;
    current.noteStyles = noteStyles && Object.keys(noteStyles).length ? noteStyles : undefined;
    const has = name => values.has(name);
    const value = name => formValue(values, name);
    const type = base.type;
    for (const field of ['title', 'scope', 'kind', 'priority', 'status', 'number', 'dutyShift', 'phase', 'participants', 'area', 'equipment',
      'person', 'department', 'contactId', 'assignedBy', 'assignment', 'routineHeading', 'contactDetails', 'role',
      'verifiedBy', 'waitingOn', 'notebookId', 'shift', 'mwrStatus', 'portfolioId']) {
      if (has(field)) current[field] = D.tidy(value(field));
    }
    if (has('assignedBy') && !current.assignment) current.assignment = W.personRole(current.assignedBy);
    for (const field of ['body', 'readings', 'agenda', 'minutes', 'decisions', 'waitingReason', 'closeNotes', 'handover', 'closingComment']) {
      if (has(field)) current[field] = value(field);
    }
    const dateFields = { date: 'the entry date', endDate: 'the end date', dueDate: 'the due date', followDate: 'the follow-up date',
      raisedDate: 'the date raised', dutyDate: 'the duty starting date', closedDate: 'the closure date', actualDate: 'the date spent' };
    for (const [name, label] of Object.entries(dateFields)) {
      if (has(name)) current[name] = readDate(values, name, label, !draft && (name === 'date' || type === 'log' && name === 'dutyDate'));
    }
    current.date ||= base.date;
    for (const [name, label] of Object.entries({ time: 'the start or entry time', endTime: 'the end time', dueTime: 'the due time', followTime: 'the follow-up time' })) {
      if (has(name)) current[name] = readTime(values, name, label, !draft && type === 'log' && name === 'time');
    }
    current.draft = draft;
    for (const [name, label] of [['planMinutes', 'planned minutes'], ['actualMinutes', 'actual minutes']]) {
      if (!has(name)) continue;
      const raw = D.tidy(value(name));
      const number = raw ? Number(raw) : null;
      if (number !== null && (!Number.isInteger(number) || number < 1 || number > 1440)) {
        throw new Error('Use a whole number between 1 and 1440 for ' + label + '.');
      }
      current[name] = number;
    }
    if (type === 'task') {
      if (!current.shiftScheduleKey) current.planFlexible = has('planFlexible');
      if (current.actualMinutes) current.actualDate ||= now().date;
      else current.actualDate = '';
      if (current.number && current.mwrStatus === 'none') current.mwrStatus = 'raised';
    }
    current.pinned = has('pinned');
    current.focus = has('focus');
    current.remind = has('remind');
    current.remindMinutes = Number(value('remindMinutes')) || 0;
    if (current.remindMinutes < 0 || current.remindMinutes > 10080 || !Number.isInteger(current.remindMinutes)) {
      throw new Error('Set reminder minutes to a whole number between 0 and 10080.');
    }
    current.tags = D.unique(value('tags').split(',').map(D.tidy).filter(Boolean));
    current.links = D.unique(values.getAll('links')).map(id => fetchRow(id)?.id ?? id);
    current.attachments = values.getAll('keepFile').map(index => L(base.attachments)[Number(index)]).filter(Boolean);
    current.subtasks = $$('[data-subtask]', form).flatMap(node => {
      const title = D.tidy($('[name="subTitle"]', node).value);
      if (!title) return [];
      const id = $('[name="subId"]', node).value;
      const prior = D.byId(L(base.subtasks), id);
      return [{ ...prior, id: prior?.id ?? id, title, done: $('input[type="checkbox"]', node).checked }];
    });
    if (has('repeatMode')) {
      current.recurrence = value('repeatMode') ? {
        mode: value('repeatMode'), interval: Number(value('repeatEvery')), unit: value('repeatUnit'),
        until: readDate(values, 'repeatUntil', 'the repeat end date')
      } : null;
      if (current.recurrence) {
        if (!D.validRule(current.recurrence)) throw new Error('Use a repeat interval from 1 to 365.');
        const anchor = current.occurrenceDate || current.dueDate || current.date;
        if (current.recurrence.until && current.recurrence.until < anchor) throw new Error('Choose a repeat end date on or after the first occurrence.');
        current.occurrenceDate = anchor;
        if (type === 'task') {
          current.recurrence.planOffset = base.recurrence?.planOffset ?? D.daysBetween(anchor, base.recurrence ? base.originalDate || base.date : current.date);
          current.recurrence.hasDeadline = base.recurrence?.hasDeadline ?? !!(base.recurrence ? base.dueDate : current.dueDate);
          current.recurrence.anchorDay = base.recurrence?.anchorDay ?? Number(anchor.slice(-2));
        }
      }
    }
    if (!draft) {
      if (!current.title) throw new Error('Enter a title for this entry.');
      if (current.planMinutes && !current.time && !current.planFlexible) throw new Error('Enter a planned start time or allow Day Plan to find one.');
      if (current.dueTime && !current.dueDate) throw new Error('Add a due date for this due time.');
      if (current.followTime && !current.followDate) throw new Error('Add a follow-up date for this follow-up time.');
      if (D.timed(current) && (current.endDate || current.endTime)) {
        current.endDate ||= current.date;
        if (current.endDate < current.date) throw new Error('Choose an end date on or after the start date.');
        if (current.time || current.endTime) {
          if (!current.time || !current.endTime || !D.eventWindow(current)) {
            throw new Error('Add start and end times with the end after the start. Use the next date for a booking across midnight.');
          }
        }
      }
      if (type === 'log') {
        const duty = D.dutyWindow({ date: current.dutyDate, shift: current.dutyShift });
        const entered = D.instant(current.date, current.time);
        if (!duty) throw new Error('Choose a working duty.');
        if (entered < duty.start || entered > duty.end) {
          throw new Error('The log time is outside this duty. Check the log date, time and duty starting date.');
        }
      }
      if (type === 'mwr' && current.status !== 'planned' && (!current.number || !current.raisedDate)) {
        throw new Error('Add the MWR number and date raised for this status.');
      }
      if ((type === 'mwr' && current.status === 'closed') || (type === 'followup' && current.status === 'done')) {
        if (!current.verifiedBy || !current.closedDate || !D.tidy(current.closeNotes)) {
          throw new Error('Enter the person, date and details of the closure confirmation.');
        }
        if (current.raisedDate && current.closedDate < current.raisedDate) throw new Error('The closure date comes before the date raised.');
      }
      if (current.remind && !D.deadline(current, db.settings)) throw new Error('Choose a date for this reminder.');
    }
    const update = value('updateText');
    if (D.tidy(update) || updateStyle) current.updates = [...L(current.updates), { id: D.uid(), at: D.stamp(), text: update,
      noteStyles: updateStyle ? { text: updateStyle } : undefined }];
    const files = values.getAll('files').filter(file => file instanceof File && file.name);
    return { current, files };
  }

  function changedFields(before, row) {
    const fields = { title: 'Title', body: 'Details', scope: 'Category', date: 'Planned / entry date', dueDate: 'Due date',
      dueTime: 'Due time', time: 'Time', status: 'Status', priority: 'Priority', followDate: 'Follow-up date', number: 'MWR number',
      raisedDate: 'Date raised', area: 'Area', equipment: 'Equipment', person: 'Person', readings: 'Readings',
      actualMinutes: 'Actual minutes', actualDate: 'Date spent', planMinutes: 'Planned minutes', assignment: 'Assigning role', routineHeading: 'Work heading',
      handover: 'Handover notes', closingComment: 'Closing comment', mwrStatus: 'MWR status' };
    const changes = Object.entries(fields).flatMap(([key, label]) => D.str(before[key]) === D.str(row[key]) ? [] :
      [{ field: label, before: before[key] ?? '', after: row[key] ?? '' }]);
    if (D.str(before.portfolioId) !== D.str(row.portfolioId)) {
      const title = id => id ? D.byId(db.assignments, id)?.title || 'Unavailable assignment' : '';
      changes.push({ field: 'Assignment', before: title(before.portfolioId), after: title(row.portfolioId) });
    }
    return changes;
  }

  async function saveEntry(draft = false) {
    if (modal?.kind !== 'entry') return;
    const base = modal.row;
    const { current, files } = entryInput($('#entry-form'), base, draft);
    const saved = await Z.attach(files);
    current.attachments.push(...saved);
    try {
      const outcome = await commit(data => {
        const existing = D.byId(data.entries, current.id);
        if (current.portfolioId && !D.same(existing?.portfolioId, current.portfolioId) && !P.active(data, current.portfolioId)) {
          throw new Error('The selected assignment is no longer available. Choose another assignment.');
        }
        const conflict = (existing && (base.virtual || existing.editToken !== base.editToken || existing.deletedAt)) ||
          (!existing && base.editToken && !base.virtual);
        const source = current.sourceNoteId && !existing && data.entries.find(row => !row.deletedAt && row.type === 'task' &&
          D.same(row.sourceNoteId, current.sourceNoteId));
        if (source) throw new Error('This note already has a linked task. Open it to review the saved version.');
        const at = D.stamp();
        const before = conflict ? base : existing ?? base;
        const row = { ...current, createdAt: before.createdAt || at, updatedAt: at, editToken: D.uid(),
          deletedAt: '', originalDate: before.originalDate || current.date,
          originalDueDate: before.originalDueDate || before.dueDate || current.dueDate || '' };
        delete row.virtual;
        if (conflict) {
          row.id = D.uid();
          row.conflictOf = current.id;
          row.draft = true;
          row.seriesId = '';
          delete row.legacySeries;
          if (row.shiftStickyKey) {
            delete row.shiftStickyKey;
            delete row.shiftStickyDay;
            delete row.shiftStickyInactive;
            delete row.stickyPinned;
            delete row.stickyRank;
          }
          delete row.stickyPriority;
          delete row.shiftReminderKey;
          delete row.shiftScheduleKey;
          delete row.shiftAdvanceAt;
          delete row.shiftDateOverride;
          row.sourceNoteId = '';
          row.recurrence = null;
          row.occurrenceDate = '';
          row.previousOccurrenceId = '';
        }
        if (row.type === 'task') {
          row.completedAt = row.status === 'done' ? before.completedAt || at : '';
          if (row.status !== 'done' && row.closedDate) row.closedDate = '';
          if (!conflict && existing) {
            row.position = existing.position;
            row.stickyRank = existing.stickyRank;
            row.stickyPriority = existing.stickyPriority;
            if (row.dutyDate === existing.dutyDate && row.shift === existing.shift) {
              Object.assign(row, W.taskPlanChange(data, existing, row.date));
            }
          }
          else row.position = data.entries.reduce((high, item) => item.type === 'task'
            ? Math.max(high, Number(item.position) || 0) : high, 0) + 1;
        }
        if (row.type === 'followup') row.completedAt = row.status === 'done' ? before.completedAt || at : '';
        const changes = changedFields(before, row);
        row.history = [...L(before.history), { at, action: conflict ? 'Recovered edit from another tab' :
          !existing && !base.virtual ? (draft ? 'Saved draft' : 'Created') : draft ? 'Saved draft' : 'Edited', changes }];
        if (existing && !conflict) data.entries[data.entries.indexOf(existing)] = row;
        else data.entries.push(row);
        if (!conflict && !draft) S.saveRoutineStart(data, existing, row, at);
        return { row, conflict };
      }, result => result.conflict ? 'The latest entry was kept. Your edits are saved as a separate draft.' :
        result.row.draft ? 'Draft saved.' : 'Entry saved.');
      return outcome;
    } catch (error) {
      await Z.discardFiles(saved);
      throw error;
    }
  }

  function entryDetail(row) {
    if (!row || row.deletedAt) throw new Error('This entry is in Deleted items or is no longer available.');
    const id = remember(row);
    const otherLinks = db.entries.filter(item => D.active(item) && L(item.links).some(link => D.same(link, row.id))).map(item => item.id);
    const allLinks = D.unique([...L(row.links), ...otherLinks].map(String));
    const body = (label, key) => {
      const content = N.render(row[key], row.noteStyles?.[key]);
      return content ? '<section><h3>' + E(label) + '</h3>' + content + '</section>' : '';
    };
    const text = [
      joined([dated(row.date), row.time, row.endTime ? 'to ' + joined([row.endDate !== row.date ? dated(row.endDate) : '', row.endTime]) : '']),
      joined([row.scope ? SCOPES[row.scope] : '', row.area, row.equipment, row.person, row.department, row.role, row.shift]),
      joined([row.raisedDate ? 'Raised ' + dated(row.raisedDate) : '', row.dutyDate ? 'Duty ' + dated(row.dutyDate) : '',
        row.dutyShift, row.phase ? D.PHASES[row.phase] : '', row.assignedBy ? 'Assigned by ' + row.assignedBy : '']),
      joined([row.verifiedBy, row.closedDate ? 'Closure ' + dated(row.closedDate) : '', named(db.contacts, row.contactId),
        row.contactDetails, named(db.notebooks, row.notebookId)]),
      joined([row.waitingOn ? 'Waiting on ' + row.waitingOn : '', row.followDate ? 'Follow up ' + dated(row.followDate) : '', row.followTime]),
      joined([row.planMinutes ? 'Planned ' + D.minutesText(row.planMinutes) : '',
        row.actualMinutes ? 'Spent ' + D.minutesText(row.actualMinutes) + ' on ' + dated(row.actualDate || row.date) : ''])
    ].filter(Boolean).map(value => '<p class="muted">' + E(value) + '</p>').join('');
    const actions = '<details class="workspace-options"><summary>More actions</summary><div class="actions">' +
      (row.type === 'task' && !row.draft ? btn(row.focus ? 'Remove from top priorities' : 'Top priority', 'toggle-focus', { id }, { pressed: row.focus === true }) +
        btn('Move date', 'reschedule', { id }, { icon: 'calendar' }) +
        btn('Follow-up & closure', 'follow-edit', { id }) +
        (W.isSticky(row) ? btn('Full editor', 'entry-edit', { id }) : btn('Add linked sticky', 'sticky-new', { entry: id })) +
        (D.open(row) ? btn(row.taskPinned ? 'Unpin from Tasks panel' : 'Pin to Tasks panel', 'task-pin', { id }, { icon: 'pin' }) : '') : '') +
      (D.active(row) && D.dayPlan.tracked(row) ? btn('Adjust task timing', 'plan-adjust-task', { id }) : '') +
      (D.dayPlan.tracked(row) && D.planning.availableTask(db, row) ? btn('Pause & capture', 'companion-pause', { id }) +
        btn('Readiness', 'companion-readiness', { id }) + btn('Log conversation', 'companion-contact', { id }) +
        btn('Last workable slot', 'companion-last-slot', { id }) : '') +
      (row.scope === 'work' && D.open(row) && !row.virtual && (db.settings.quietByRoster || row.allowRosterReminder) &&
        (row.remind || D.dayPlan.tracked(row) || D.timed(row)) ?
        btn(row.allowRosterReminder ? 'Remove roster quiet exception' : 'Allow during roster quiet', 'roster-quiet-exception', { id }) : '') +
      (row.type === 'note' && !row.draft ? btn('Draft a linked task', 'convert-note', { id }, { icon: 'link' }) : '') +
      (row.type === 'meeting' && !row.draft && !row.virtual ? btn('Add linked action', 'linked-task', { id }, { icon: 'plus' }) : '') +
      (row.seriesId && fetchRow(row.seriesId) && !fetchRow(row.seriesId).deletedAt
        ? btn('Open repeat original', 'entry-view', { id: row.seriesId }) : '') + '</div></details>';
    const attachments = L(row.attachments).length ? '<section><h3>Attachments</h3><div class="actions">' +
      L(row.attachments).map((file, index) => file.missing ? chip(file.name + ' · bytes missing', 'warn') :
        btn(file.name, 'attachment', { id, index }, { icon: 'download' })).join('') + '</div></section>' : '';
    const history = L(row.history).length ? '<details><summary>History (' + row.history.length + ')</summary><ul class="history">' +
      L(row.history).slice().reverse().map(item => '<li>' + E(joined([historyDate(item), item?.action || item?.text || item?.message || D.str(item),
        item?.from || item?.to ? joined([item.from, item.to]) : '', item?.reason || item?.note])) +
        L(item?.changes).filter(Boolean).map(change => '<div class="muted">' + E(change.field + ' · ' + D.str(change.before) + ' → ' + D.str(change.after)) + '</div>').join('') + '</li>').join('') +
      '</ul></details>' : '';
    const warning = dutyAlerts.get(code(row));
    const tree = D.hierarchy.index(db);
    const content = '<div class="stack">' + entryMeta(row, { showDate: true }) + whereItAppears(row) + portfolioTools.entryActions(row, tree) +
      progressUI.panel(row, 'entry', tree) +
      (row.shiftStickyKey === 'highlights' && D.SHIFT[row.shift]?.start ? '<div class="actions">' +
        btn('Write shift highlights', 'highlights-edit', { date: row.dutyDate || row.shiftStickyDay, shift: row.shift }, { cls: 'small primary' }) + '</div>' : '') +
      (row.type === 'meeting' && !row.draft && !row.virtual && L(row.tags).includes('one-on-one') ? '<div class="actions">' +
        btn('Add follow-up task', 'linked-task', { id }, { cls: 'small', icon: 'plus' }) + '</div>' : '') +
      (warning ? note(warning.detail, 'error') : '') + '<div>' + text + '</div>' +
      body('Details', 'body') + body('Readings', 'readings') + body('Participants', 'participants') +
      body('Agenda', 'agenda') + body('Minutes', 'minutes') + body('Decisions', 'decisions') +
      body('Waiting reason', 'waitingReason') + body('Closure confirmation', 'closeNotes') +
      body('Closing comment', 'closingComment') + body('Handover notes', 'handover') +
      (D.dayPlan.tracked(row) ? companion.readinessPanel(row) + companion.learningDetails(row) : '') +
      hierarchyUI.taskPanel(row, tree) +
      (L(row.subtasks).length ? '<section><h3>Subtasks</h3>' + row.subtasks.map((item, index) =>
        '<label class="check"><input type="checkbox" data-task-sub="' + E(id) + '" data-index="' + index + '"' +
        (item.done ? ' checked' : '') + '>' + E(item.title) + '</label>').join('') + '</section>' : '') +
      (L(row.updates).length ? '<section><h3>Updates</h3>' + row.updates.map(item =>
        '<p><small>' + E(historyDate(item)) + '</small></p>' + N.render(item.text, item.noteStyles?.text)).join('') + '</section>' : '') +
      (allLinks.length ? '<section><h3>Linked entries</h3><div class="actions">' + allLinks.map(link => {
        const entry = fetchRow(link);
        return entry && !entry.deletedAt ? btn(entry.title || 'Draft', 'entry-view', { id: link }) : chip('Link unavailable · ' + link);
      }).join('') + '</div></section>' : '') + attachments +
      (L(row.tags).length ? '<div class="pills">' + row.tags.map(tag => chip('#' + tag)).join('') + '</div>' : '') +
      actions + history + '</div>';
    const status = D.active(row) && row.type === 'task' ? btn(D.open(row) ? 'Done' : 'Reopen', 'task-status',
      { id, status: D.open(row) ? 'done' : 'todo' }, { icon: 'check', disabled: D.open(row) && tree.blocked(row) }) : '';
    openDialog('detail', row.title || 'Untitled draft', content, btn('Delete', 'delete-entry', { id }, { cls: 'danger' }) + status +
      btn(row.draft ? 'Review draft' : 'Edit', W.isSticky(row) && !row.draft ? 'sticky-edit' : 'entry-edit', { id }, { cls: 'primary', icon: 'edit' }), { id });
  }

  function registersPage() {
    const choices = { 'mwr-planned': 'To Be Raised', 'mwr-raised': 'Raised / Follow-up',
      followup: 'Delegation & Follow-ups', meetings: 'Meetings', directory: 'Contacts & Notebooks' };
    const view = state.register;
    const type = view === 'meetings' ? 'meeting' : view === 'followup' ? 'followup' : 'mwr';
    const create = view === 'directory' ? btn('New contact', 'aux-edit', { kind: 'contacts' }, { cls: 'primary', icon: 'plus' }) :
      btn('New ' + D.TYPES[type], 'add', { type }, { cls: 'primary', icon: 'plus' });
    const head = page('WORK', 'Work Registers', 'Keep track of requests, responsibilities and meeting actions.', create) +
      tabs(choices, 'register', 'Work register');
    if (view === 'directory') return head + directoryPage();
    const today = now().date;
    const data = db.entries.filter(row => D.active(row) && row.type === type &&
      (view === 'mwr-planned' ? row.status === 'planned' : view === 'mwr-raised' ? row.status !== 'planned' : true) &&
      (type !== 'followup' || !state.role || row.role === state.role) &&
      (type === 'meeting' || !state.registerStatus || row.status === state.registerStatus))
      .sort((a, b) => (a.followDate || '9999').localeCompare(b.followDate || '9999') || b.date.localeCompare(a.date));
    const filter = '<div class="toolbar-filter">' +
      (type === 'followup' ? select('role', 'Responsibility group', { '': 'All groups', ...Object.fromEntries(D.ROLES.map(role => [role, role])) },
        state.role, ' data-setting-tab="role"') : '') +
      (view === 'followup' || view === 'mwr-raised' ? select('registerStatus', 'Status', { '': 'All statuses',
        ...(type === 'mwr' ? Object.fromEntries(Object.entries(D.MWR).filter(([key]) => key !== 'planned')) : D.STATUS) },
      state.registerStatus, ' data-setting-tab="registerStatus"') : '') + '</div>';
    let body;
    if (type === 'meeting') body = rowsView(data, { showDate: true, preview: true, empty: 'No meetings saved.' });
    else {
      const rows = data.map(row => {
        const person = row.person || named(db.contacts, row.contactId);
        const age = type === 'mwr' && row.raisedDate
          ? Math.max(0, D.daysBetween(row.raisedDate, row.status === 'closed' && row.closedDate ? row.closedDate : today)) + ' days' : '—';
        return '<tr><td>' + btn(row.title, 'entry-view', { id: row.id }, { cls: 'text-button' }) +
          '<br><small>' + E(joined([row.number, row.area, row.equipment])) + '</small></td><td>' +
          E(joined([person, row.department])) + (row.role && type === 'followup' ? '<br><small>' + E(row.role) + '</small>' : '') +
          '</td><td>' + chip(statuses(row)[row.status], row.status === 'waiting' ? 'warn' : '') +
          (row.waitingReason ? '<br><small>' + E(truncate(row.waitingReason, 80)) + '</small>' : '') +
          '</td><td>' + E(joined([dated(row.followDate), row.followTime]) || '—') +
          (row.dueDate ? '<br><small>Due ' + E(dated(row.dueDate)) + '</small>' : '') +
          '</td>' + (type === 'mwr' ? '<td>' + E(age) + '</td>' : '') + '</tr>';
      }).join('');
      body = rows ? '<div class="table-wrap"><table><thead><tr><th scope="col">' + (type === 'mwr' ? 'Request' : 'Follow-up') +
        '</th><th scope="col">Responsibility</th><th scope="col">Status</th><th scope="col">Next follow-up</th>' +
        (type === 'mwr' ? '<th scope="col">Age</th>' : '') + '</tr></thead><tbody>' + rows + '</tbody></table></div>' :
        empty(type === 'mwr' ? 'No MWRs in this view.' : 'No follow-ups match these filters.');
    }
    const subtitle = type === 'mwr' ? 'Private register. Raise and verify requests using your plant’s process.' :
      type === 'followup' ? 'Responsibility and closure details are entered by you.' : 'Open a meeting to review its minutes, decisions and linked actions.';
    return head + filter + panel(choices[view], body, '', subtitle);
  }

  function directoryPage() {
    const directory = (key, label, button) => {
      const rows = db[key].filter(row => !row.deletedAt).sort((a, b) => a.name.localeCompare(b.name));
      return panel(label, rows.length ? '<div class="rows">' + rows.map(row => '<div class="row"><div class="row-main"><h3>' +
        E(row.name) + '</h3><p class="muted">' + E(joined([row.department, row.details])) + '</p>' +
        N.render(row.notes, row.noteStyles?.notes) + '</div>' +
        ibtn('edit', 'Edit ' + row.name, 'aux-edit', { kind: key, id: row.id }) + '</div>').join('') + '</div>' :
        empty('Nothing saved here yet.'), btn(button, 'aux-edit', { kind: key }, { cls: 'text-button', icon: 'plus' }));
    };
    return '<div class="two-cols">' + directory('contacts', 'Contacts', 'Add contact') +
      directory('notebooks', 'Projects and notebooks', 'Add notebook') + '</div>';
  }

  function templatesPage() {
    const templates = db.templates.filter(row => !row.deletedAt);
    const duty = selectedDuty();
    const runs = checklistsFor(state.date, null, state.scope);
    return '<div class="two-cols">' +
      panel('Checklist templates', templates.length ? '<div class="rows">' + templates.map(row => '<div class="row"><div class="row-main"><h3>' +
        E(row.name) + '</h3><p class="muted">' + E(joined([ROUTINE_OPTIONS[row.frequency], SCOPES[row.scope],
          L(row.items).length + ' items'])) + '</p><div class="actions">' +
        (routineMatches(row, duty?.shift || '') ? btn('Use on ' + dated(state.date), 'checklist-run', { id: row.id, date: state.date }) : '') +
        btn('Edit', 'aux-edit', { kind: 'templates', id: row.id }) + '</div></div></div>').join('') + '</div>' : empty('Add a list you can reuse.'),
      btn('New template', 'aux-edit', { kind: 'templates' }, { icon: 'plus', cls: 'text-button' })) +
      panel('Checklists for ' + dated(state.date), runs.length ? '<div class="stack">' + runs.map(checklistCard).join('') + '</div>' :
        empty('Choose a template to start a checklist.')) + '</div>';
  }

  function goalCard(goal) {
    const total = L(goal.progress).reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
    const percent = Math.max(0, Math.min(100, Math.round(total / goal.target * 100)));
    return '<section class="panel"><div class="panel-head"><h2>' + E(goal.name) + '</h2>' + chip(goal.closed ? 'Complete' : 'Active', 'green') +
      '</div><p>' + E(total + ' / ' + goal.target + (goal.unit ? ' ' + goal.unit : '')) + ' · ' + percent + '%</p>' +
      '<progress value="' + percent + '" max="100" aria-label="' + E(goal.name + ' progress') + '"></progress>' +
      (goal.dueDate ? '<p class="muted">Target date ' + E(dated(goal.dueDate)) + '</p>' : '') +
      N.render(goal.notes, goal.noteStyles?.notes) +
      '<div class="actions section-actions">' + btn('Log progress', 'goal-progress', { id: goal.id }) +
      btn('Edit goal', 'aux-edit', { kind: 'goals', id: goal.id }) + '</div>' +
      (L(goal.progress).length ? '<details><summary>Progress and review notes</summary><ul class="history">' +
        L(goal.progress).slice().reverse().map(item => '<li>' + E(joined([dated(item.date), D.str(item.amount)])) +
          N.render(item.note, item.noteStyles?.note) + '</li>').join('') + '</ul></details>' : '') + '</section>';
  }

  function goalsPage() {
    const goals = db.goals.filter(row => !row.deletedAt);
    return '<div class="actions section-actions">' + btn('New goal', 'aux-edit', { kind: 'goals' }, { cls: 'primary', icon: 'plus' }) +
      '</div>' + (goals.length ? '<div class="two-cols">' + goals.map(goalCard).join('') + '</div>' :
        panel('Personal goals', empty('Set a target and record dated progress and review notes.')));
  }

  const AUX = { contacts: 'Contact', notebooks: 'Project or Notebook', templates: 'Checklist Template', goals: 'Goal' };
  const ROUTINE_OPTIONS = { day: 'Every day', shift: 'Any rostered day',
    ...Object.fromEntries(Object.keys(D.SHIFT).map(shift => [shift, shift + ' days'])) };
  function auxEdit(kind, id) {
    if (!Object.hasOwn(AUX, kind)) return;
    const row = D.byId(db[kind], id);
    let fields = input('name', 'Name', row?.name, { wide: true, extra: ' data-initial-focus' });
    if (kind === 'contacts') fields += input('department', 'Department', row?.department) +
      input('details', 'Phone, email or contact details', row?.details) + N.field('notes', 'Notes', row?.notes);
    if (kind === 'notebooks') fields += N.field('notes', 'Description', row?.notes);
    if (kind === 'templates') fields += select('scope', 'Category', { work: 'Work', personal: 'Personal' }, row?.scope || 'work') +
      select('frequency', 'Use for', ROUTINE_OPTIONS, row?.frequency || 'day') +
      textarea('items', 'Items (one per line)', L(row?.items).map(item => item.title).join('\n'));
    if (kind === 'goals') fields += input('target', 'Target amount', row?.target, { type: 'number', extra: ' min="0.01" step="any"' }) +
      input('unit', 'Unit (optional)', row?.unit, { placeholder: 'e.g. sessions' }) + dateInput('dueDate', 'Target date (optional)', row?.dueDate) +
      check('closed', 'Mark complete', row?.closed) + N.field('notes', 'Review notes', row?.notes);
    openDialog('aux', (row ? 'Edit ' : 'New ') + AUX[kind], '<form id="aux-form" class="form-grid" novalidate>' +
      fields + '</form>', (row ? btn('Delete', 'aux-delete', { kind, id }, { cls: 'danger' }) : btn('Cancel', 'close-dialog')) +
      '<button type="submit" form="aux-form" class="primary">Save</button>', { kindKey: kind, row });
  }

  async function saveAux() {
    const { kindKey: kind, row: previous } = modal;
    const values = new FormData($('#aux-form'));
    const name = D.tidy(values.get('name'));
    if (!name) throw new Error('Enter a name.');
    const row = { ...previous, id: previous?.id ?? D.uid(), name, updatedAt: D.stamp(), editToken: D.uid() };
    row.noteStyles = N.capture(values, previous?.noteStyles);
    for (const key of ['department', 'details', 'notes', 'scope', 'frequency', 'unit']) {
      if (values.has(key)) row[key] = formValue(values, key);
    }
    if (kind === 'templates') {
      row.items = formValue(values, 'items').split('\n').map(D.tidy).filter(Boolean).map((title, index) =>
        ({ id: L(previous?.items)[index]?.id ?? D.uid(), title }));
      if (!row.items.length) throw new Error('Enter at least one checklist item.');
    }
    if (kind === 'goals') {
      row.target = Number(values.get('target'));
      if (!Number.isFinite(row.target) || row.target <= 0) throw new Error('Enter a target greater than zero.');
      row.dueDate = readDate(values, 'dueDate', 'the target date');
      row.closed = values.has('closed');
    }
    await commit(data => {
      const existing = D.byId(data[kind], row.id);
      if (previous && (!existing || existing.deletedAt || existing.editToken !== previous.editToken)) {
        throw new Error('This record changed in another tab. Copy your edits before reopening it.');
      }
      if (existing) {
        if (kind === 'goals') row.progress = existing.progress;
        data[kind][data[kind].indexOf(existing)] = row;
      } else data[kind].push(row);
    }, AUX[kind] + ' saved.');
  }

  function handoverRows(records, limit = records.length) {
    if (!records.length) return empty('No open items for this duty.');
    return '<div class="rows">' + records.slice(0, limit).map(({ row, transfer }) => '<div class="row"><div class="row-main">' +
      btn(row.title, 'entry-view', { id: row.id }, { cls: 'row-title' }) + entryMeta(row) +
      (transfer ? '<div class="pills">' + chip('From ' + dated(transfer.date) + ' ' + transfer.shift, 'blue') + '</div>' : '') +
      (row.person || row.handover ? '<p class="row-body">' + E(joined([row.person, truncate(row.handover, 160)])) + '</p>' : '') +
      '</div></div>').join('') + '</div>';
  }

  function handoverPanel(date, rosterShift) {
    const shift = state.handoverShift || rosterShift;
    const outgoing = db.handovers.filter(row => !row.deletedAt && row.date === date && (!shift || row.shift === shift));
    const incoming = db.handovers.filter(row => !row.deletedAt && row.toDate === date && (!shift || row.toShift === shift) && !outgoing.includes(row));
    const rows = D.pendingHandover(db, date, shift);
    const filter = select('handoverShift', 'Duty', { '': rosterShift || 'All working duties', ...workingShifts },
      state.handoverShift, ' data-setting-tab="handoverShift"');
    const saved = [...outgoing, ...incoming];
    const savedList = saved.length ? '<details open><summary>Saved handovers (' + saved.length + ')</summary><div class="rows">' +
      saved.map(row => '<div class="row"><div class="row-main"><strong>' + E(joined([
        'From ' + dated(row.date) + ' ' + row.shift, 'To ' + dated(row.toDate) + ' ' + row.toShift
      ])) + '</strong>' + N.render(row.note, row.noteStyles?.note) + companion.acceptanceRows(row) + '<div class="actions">' +
      btn('Copy saved handover', 'handover-copy', { id: row.id }, { cls: 'small' }) +
      btn('Remove handover', 'handover-delete', { id: row.id }, { cls: 'small danger' }) + '</div></div></div>').join('') + '</div></details>' : '';
    return panel('Shift handover', '<div class="toolbar-filter">' + filter + '</div>' + handoverRows(rows) + savedList +
      '<div class="actions section-actions">' + btn('Copy open items', 'handover-copy', { date, shift }) + '</div>',
      btn('Carry to next shift', 'handover-edit', { date, shift }, { cls: 'primary', icon: 'link' }),
      'A handover links open items to the next duty while keeping their original deadlines.');
  }

  function handoverForm(date, shift) {
    const choices = { '': 'Choose duty', ...workingShifts };
    const next = D.nextDutyAfter(db.roster, date, shift);
    const candidates = db.entries.filter(row => row.scope === 'work' && D.open(row) &&
      ['task', 'followup', 'mwr'].includes(row.type)).sort(order);
    if (!candidates.length) throw new Error('Add a work task, follow-up or MWR before preparing a handover.');
    const fields = dateInput('date', 'From duty starting date', date) + select('shift', 'From duty', choices, shift) +
      dateInput('toDate', 'Next duty starting date', next?.date || D.addDays(date, 1)) +
      select('toShift', 'Next duty', choices, next?.shift) +
      '<fieldset class="wide"><legend>Open items to carry</legend><div class="link-picker">' +
      candidates.map(row => '<label class="check"><input type="checkbox" name="item" value="' + E(row.id) +
        '"><span>' + E(joined([row.title, statuses(row)[row.status], row.number ? 'MWR ' + row.number : ''])) + '</span></label>').join('') +
      '</div></fieldset>' + N.field('note', 'Handover note (optional)', '');
    openDialog('handover', 'Carry work to the next shift', '<form id="handover-form" class="form-grid" novalidate>' +
      fields + '</form>', btn('Cancel', 'close-dialog') +
      '<button type="submit" form="handover-form" class="primary">Save handover</button>');
  }

  async function saveHandover(form) {
    const values = new FormData(form);
    const date = readDate(values, 'date', 'the source duty starting date', true);
    const toDate = readDate(values, 'toDate', 'the next duty starting date', true);
    const shift = formValue(values, 'shift');
    const toShift = formValue(values, 'toShift');
    const source = D.dutyWindow({ date, shift });
    const target = D.dutyWindow({ date: toDate, shift: toShift });
    if (!source || !target || target.start < source.end) throw new Error('Choose a working duty that begins at or after the source duty ends.');
    const ids = new Set(values.getAll('item'));
    if (!ids.size) throw new Error('Choose at least one open item.');
    const text = formValue(values, 'note');
    const noteStyles = N.capture(values);
    const id = 'handover:' + [date, shift, toDate, toShift].join(':');
    await commit(data => {
      const selected = data.entries.filter(row => ids.has(code(row)) && row.scope === 'work' &&
        D.open(row) && ['task', 'followup', 'mwr'].includes(row.type));
      if (selected.length !== ids.size) throw new Error('One of the selected items has changed. Reopen the handover to review it.');
      const previous = D.byId(data.handovers, id);
      const itemIds = previous && !previous.deletedAt ? L(previous.itemIds) : [];
      const at = D.stamp();
      const row = { id, date, shift, toDate, toShift, itemIds: D.unique([...itemIds, ...selected.map(item => item.id)]),
        acceptances: previous && !previous.deletedAt ? L(previous.acceptances) : [],
        note: D.tidy(text) || noteStyles ? text : previous?.note || '',
        noteStyles: D.tidy(text) || noteStyles ? noteStyles : previous?.noteStyles, createdAt: previous?.createdAt || at, updatedAt: at };
      if (previous) data.handovers[data.handovers.indexOf(previous)] = row;
      else data.handovers.push(row);
      for (const item of selected.filter(item => !itemIds.some(id => D.same(id, item.id)))) {
        item.history = [...L(item.history), { at, action: 'Carried to ' + dated(toDate) + ' ' + toShift }];
      }
    }, 'Handover saved.');
  }

  function copyHandover(details) {
    const transfer = details.id && D.byId(db.handovers, details.id);
    if (details.id && (!transfer || transfer.deletedAt)) throw new Error('This handover is in Deleted items.');
    const date = transfer?.date || details.date;
    const shift = transfer?.shift || details.shift;
    const selected = transfer ? transfer.itemIds.map(id => fetchRow(id)).filter(row => row && !row.deletedAt) :
      D.pendingHandover(db, date, shift).map(({ row }) => row);
    const points = selected.map(row => {
      const accepted = R.acceptance(transfer, row.id);
      const receipt = transfer && (accepted ? 'Accepted by ' + accepted.by + ' · ' + D.formatStamp(accepted.at) : 'Awaiting acceptance');
      return '• ' + joined([row.title, statuses(row)[row.status], row.person,
        row.number && 'MWR ' + row.number, row.dueDate && 'Due ' + dated(row.dueDate), receipt]) + (row.handover ? '\n  ' + row.handover : '');
    });
    const heading = ['CAN Plant Handover', joined([dated(date), shift || 'All duties']),
      transfer && 'Next duty · ' + dated(transfer.toDate) + ' ' + transfer.toShift, transfer?.note].filter(Boolean).join('\n');
    return copyText(heading + '\n\n' + (points.join('\n') || 'No open items recorded.'), 'Copy handover');
  }

  function shiftPage() {
    const duty = selectedDuty();
    const date = state.date;
    const upcoming = db.roster.filter(row => row.date >= date).sort((a, b) => a.date.localeCompare(b.date));
    const logs = db.entries.filter(row => D.active(row) && row.type === 'log' && row.dutyDate === date &&
      row.phase === state.phase)
      .sort((a, b) => a.date.localeCompare(b.date) || D.str(a.time).localeCompare(D.str(b.time)));
    const reports = db.reports.filter(row => !row.deletedAt && row.date === date);
    const reportShift = D.SHIFT[duty?.shift]?.start ? duty.shift : '';
    const matching = reportShift && reports.find(row => row.shift === reportShift);
    const openTasks = taskRows().filter(row => W.openTaskOn(row, date)).sort(order);
    const checklist = checklistsFor(date, duty?.shift || '', 'work');
    const changeHistory = db.dutyHistory.slice().reverse();
    const rosterTools = btn('Edit duty', 'duty-edit', { date }, { icon: 'edit', cls: 'text-button' });
    const logTools = btn('Add shift log', 'add', { type: 'log', 'duty-date': date, 'duty-shift': reportShift }, { icon: 'plus', cls: 'text-button' });
    const reportTools = matching ? btn('Open report', 'report-view', { id: matching.id }, { cls: 'primary' }) :
      btn('Start report', 'report-new', { date, shift: reportShift }, { cls: 'primary' });
    const dutyPanel = panel(duty?.shift ? duty.shift + ' duty' : 'Duty not set', duty
      ? '<p>' + E(joined([dated(date), dutyLabel(duty)])) + '</p>' + N.render(duty.note, duty.noteStyles?.note)
      : empty('Enter the roster for this date.'), rosterTools);
    const reportsPanel = panel('Shift report and handover', reports.length ? '<div class="rows">' + reports.map(row => '<div class="row"><div class="row-main"><h3>' +
      E(row.shift + ' report') + '</h3><p class="muted">' + E(joined([row.status === 'ready' ? 'Ready' : 'Draft',
        row.recipient ? 'To ' + row.recipient : '', D.formatStamp(row.updatedAt)])) + '</p></div>' +
      btn('Open', 'report-view', { id: row.id }) + '</div>').join('') + '</div>' : empty('Start a draft and select the entries to include.'), reportTools);
    return page('WORK', 'Shift Desk', viewDate() + ' · Overnight duties use the date they start.',
      btn('Day Plan', 'navigate', { view: 'dayplan', date, sub: 'plan' }, { icon: 'calendar' }) +
      btn('Shift Highlights', 'navigate', { view: 'highlights', date, shift: reportShift }, { icon: 'book' }) +
      btn('Preview roster change', 'companion-swap', { date }) +
      planTools.closeoutButtons(date, reportShift) +
      btn('Add roster shifts', 'roster-add', {}, { cls: 'primary', icon: 'plus' }) + dateNav()) +
      '<div class="two-cols section-actions">' + dutyPanel + reportsPanel + '</div>' +
      companion.briefPanel(date, duty?.shift) +
      tabs({ ...D.PHASES, handover: 'Handover' }, 'phase', 'Shift phase') + '<div class="split"><div class="stack">' +
      (state.phase === 'handover' ? handoverPanel(date, reportShift) :
      panel(D.PHASES[state.phase], rowsView(logs, { timeline: true, showDate: true, preview: true,
        empty: 'No log entries saved for this phase.' }), logTools,
        'Record observations and activities with their actual local date and time.')) +
      panel('Open tasks & stickies', '<div class="focus-task-list">' + (openTasks.map(row => compactTaskRow(row, { showPlan: true })).join('') ||
        empty('No unfinished tasks are planned for this date or earlier.')) + '</div>', linkButton('Shift Stickies', 'stickies', { date }),
        '', 'shift-open-tasks') +
      (checklist.length ? '<div class="stack">' + checklist.map(checklistCard).join('') + '</div>' : '') +
      '</div><div class="stack">' +
      panel('Upcoming roster', upcoming.length ? '<div class="rows">' + upcoming.map(row => '<div class="row"><div class="row-main">' +
        btn(joined([dated(row.date), row.shift]), 'navigate', { view: 'shift', date: row.date }, { cls: 'row-title' }) +
        '<p class="muted">' + E(dutyLabel(row)) + '</p></div>' +
        ibtn('edit', 'Edit duty on ' + dated(row.date), 'duty-edit', { date: row.date }) + '</div>').join('') + '</div>' :
        empty('No duties entered on or after this date.'), btn('Swap dates', 'duty-swap', {}, { cls: 'text-button' })) +
      panel('Roster history', changeHistory.length ? '<details><summary>View ' + changeHistory.length + ' changes</summary><ul class="history">' +
        changeHistory.map(row => '<li>' + E(joined([dated(row.date), (row.before?.shift || 'No duty') + ' → ' + (row.after?.shift || 'No duty'),
          row.reason, historyDate(row)])) + '</li>').join('') + '</ul></details>' : empty('Edits and swaps appear here.')) +
      '</div></div>';
  }

  function dutyEdit(date, swap = false) {
    const row = db.roster.find(row => row.date === date);
    const fields = dateInput('date', 'Duty starting date', date) + (swap ? dateInput('otherDate', 'Swap with date', '') :
      select('shift', 'Shift', { '': 'No duty entered', ...Object.fromEntries(Object.keys(D.SHIFT).map(name => [name, name])) }, row?.shift) +
      input('group', 'Group (optional)', row?.group) + N.field('note', 'Duty notes', row?.note)) +
      textarea('reason', 'Reason (optional)', '');
    openDialog(swap ? 'swap' : 'duty', swap ? 'Swap roster dates' : 'Edit roster duty',
      '<form id="duty-form" class="form-grid" novalidate>' + fields + '</form>',
      btn('Cancel', 'close-dialog') + '<button type="submit" form="duty-form" class="primary">' + (swap ? 'Save swap' : 'Save duty') + '</button>',
      { rev: db.rev, noteStyles: swap ? undefined : row?.noteStyles });
  }

  function rosterRow(date) {
    const saved = db.roster.find(row => row.date === date);
    return '<div class="roster-row">' + dateInput('rosterDate', 'Roster date', date) +
      select('rosterShift', 'Shift', { '': 'Choose shift', ...Object.fromEntries(Object.keys(D.SHIFT).map(shift => [shift, shift])) }, saved?.shift) +
      ibtn('close', 'Remove roster row', 'roster-remove', {}) + '</div>';
  }

  function rosterAdd() {
    openDialog('roster', 'Add roster shifts', '<p class="muted">Choose a duty, Rest, Off or Leave for each date. D12 is 06:00–18:00, N12 is 18:00–06:00 and E12 is 14:00–02:00. Enter the starting date for overnight duties.</p>' +
      '<form id="roster-form" novalidate><div id="roster-days">' + rosterRow(state.date) + '</div>' +
      btn('Add another date', 'roster-row', {}, { icon: 'plus', cls: 'small' }) + '</form>',
    btn('Cancel', 'close-dialog') + '<button type="submit" class="primary" form="roster-form">Save roster</button>', { rev: db.rev });
  }

  async function saveRoster(form) {
    const values = new FormData(form);
    const dates = values.getAll('rosterDate').map(D.parseDate);
    const shifts = values.getAll('rosterShift');
    if (!dates.length || dates.some(day => !day) || shifts.some(shift => !Object.hasOwn(D.SHIFT, shift))) {
      throw new Error('Choose a date and shift for every row.');
    }
    if (new Set(dates).size !== dates.length) throw new Error('Enter each roster date once.');
    const result = await Z.transact(data => {
      const at = D.stamp();
      dates.forEach((date, index) => {
        const row = data.roster.find(item => item.date === date);
        D.updateDuty(data, date, shifts[index], row?.group || '', row?.note || '', 'Roster entry', at);
      });
      D.syncShiftStickies(data, dates, at);
    }, modal.rev);
    db = result.data;
    undo = { data: result.before, rev: db.rev };
    state.stickyDutyDate = dates[0] === currentDutyDay() ? '' : dates[0];
    render();
    toast('Roster saved for ' + dates.length + (dates.length === 1 ? ' date.' : ' dates.'), true);
  }

  function reportSourceRows(report) {
    const window = D.dutyWindow(report);
    if (!window) return [];
    return db.entries.filter(row => D.active(row) && row.scope === 'work' &&
      (row.type === 'log' && row.dutyDate === report.date && row.dutyShift === report.shift ||
       row.type === 'task' && row.status === 'done' && Date.parse(row.completedAt) >= window.start && Date.parse(row.completedAt) <= window.end ||
       ['task', 'followup', 'mwr'].includes(row.type) && D.open(row) && (row.date <= report.date ||
        db.handovers.some(transfer => !transfer.deletedAt && transfer.toDate === report.date && transfer.toShift === report.shift &&
          transfer.itemIds.some(id => D.same(id, row.id))))))
      .sort((a, b) => a.date.localeCompare(b.date) || D.str(a.time).localeCompare(D.str(b.time)));
  }

  function reportPresentation(report, omitTitle = false) {
    const plain = value => '<pre>' + E(value) + '</pre>';
    const header = value => omitTitle ? value.split('\n').slice(1).join('\n') : value;
    if (!report.noteStyles) return plain(header(D.reportText(report))) + (report.sections?.verbal ?
      '<section><h3>Verbal summary</h3>' + plain(report.sections.verbal) + '</section>' : '');
    const overview = plain(header(D.reportText({ ...report, sections: {}, acknowledgement: '' })));
    const section = (key, label, value) => {
      const content = N.render(value, report.noteStyles[key]);
      return content ? '<section><h3>' + E(label) + '</h3>' + content + '</section>' : '';
    };
    return overview + Object.entries(D.REPORT).map(([key, label]) => section(key, label, report.sections?.[key])).join('') +
      section('acknowledgement', 'Handover acknowledgement', report.acknowledgement);
  }

  function reportView(report) {
    if (!report || report.deletedAt) throw new Error('This report is no longer available.');
    const id = report.id;
    const versions = L(report.versions);
    const sources = L(report.sources).map(source => {
      const row = fetchRow(source?.id);
      return '<div class="row"><div class="row-main">' + (row && !row.deletedAt
        ? btn(row.title, 'entry-view', { id: row.id }, { cls: 'row-title' }) : chip('Source unavailable')) +
        '</div>' + chip(D.REPORT[source?.section]) + '</div>';
    }).join('');
    openDialog('report-view', 'Shift report · ' + report.shift,
      '<div class="stack"><div class="pills">' + chip(dated(report.date)) + chip(report.status === 'ready' ? 'Ready' : 'Draft', report.status === 'ready' ? 'green' : 'warn') +
      '</div>' + reportPresentation(report) +
      (sources ? '<details><summary>Source entries</summary><div class="rows">' + sources + '</div></details>' : '') +
      (versions.length ? '<details><summary>Report versions (' + versions.length + ')</summary><div class="rows">' +
        versions.map((version, index) => '<div class="row"><div class="row-main">' +
          E(joined([D.formatStamp(version.updatedAt || version.at), version.status === 'conflict' ? 'Recovered edits' : version.status === 'ready' ? 'Ready' : 'Draft'])) +
          '</div>' + btn('View', 'report-version', { id, index }, { cls: 'small' }) + '</div>').reverse().join('') + '</div></details>' : '') +
      (L(report.attachments).length ? '<section><h3>Attachments</h3><div class="actions">' + L(report.attachments).map((file, index) =>
        file.missing ? chip(file.name + ' · bytes missing', 'warn') : btn(file.name, 'report-attachment', { id, index }, { icon: 'download' })).join('') + '</div></section>' : '') +
      '<div class="actions">' + btn('Copy written', 'report-copy', { id }) + btn('Copy verbal', 'report-copy', { id, mode: 'verbal' }) +
      btn('Print / PDF', 'report-print', { id }) + btn('Text export', 'report-text', { id }, { icon: 'download' }) + '</div></div>',
      btn('Delete', 'report-delete', { id }, { cls: 'danger' }) + btn('Edit report', 'report-edit', { id }, { cls: 'primary' }), { id });
  }

  function reportEdit(row, version) {
    const record = version ? { ...row, ...version, id: row.id, date: row.date, shift: row.shift, editToken: row.editToken } : row;
    const sources = L(record.sources);
    const candidates = reportSourceRows(record);
    const selection = candidates.length ? '<div class="link-picker">' + candidates.map(item => '<label class="check"><input type="checkbox" name="reportSource" value="' +
      E(item.id) + '"><span>' + E(joined([dated(item.date), item.time, item.title, D.TYPES[item.type], D.STATUS[item.status]])) +
      '</span></label>').join('') + '</div>' : empty('No eligible logs or tasks for this duty.');
    const selected = sources.length ? '<p class="muted">' + sources.length + ' linked entries already used.</p>' : '';
    const fields = '<fieldset class="wide"><legend>Build a draft from selected entries</legend>' + selected + selection +
      '<div class="form-grid">' + select('targetSection', 'Add to section', D.REPORT, 'plant1') +
      '<div class="align-end">' + btn('Add selected', 'report-insert') + '</div></div></fieldset>' +
      Object.entries(D.REPORT).map(([name, label]) => N.field(name, label, record.sections?.[name])).join('') +
      input('incharge', 'Shift in-charge (optional)', record.incharge) +
      input('recipient', 'Handover recipient (optional)', record.recipient) +
      N.field('acknowledgement', 'Acknowledgement received (optional)', record.acknowledgement) +
      '<fieldset class="wide"><legend>Ready to hand over</legend>' +
      check('reviewed', 'I reviewed the wording, readings and job status.', false) + '</fieldset>';
    openDialog('report', 'Edit ' + record.shift + ' report',
      '<p class="muted">' + E(dated(record.date) + ' · Enter the details you confirmed.') + '</p>' +
      '<form id="report-form" class="form-grid" novalidate>' + fields + '</form>', btn('Cancel', 'close-dialog') +
      btn('Save draft', 'report-save', { ready: 'no' }) +
      '<button type="submit" form="report-form" class="primary">Mark Ready</button>', { row, noteStyles: record.noteStyles, sources: D.clone(sources) });
  }

  function readReport() {
    const values = new FormData($('#report-form'));
    return { sections: Object.fromEntries(Object.keys(D.REPORT).map(key => [key, formValue(values, key)])),
      noteStyles: N.capture(values),
      sources: modal.sources, incharge: D.tidy(values.get('incharge')), recipient: D.tidy(values.get('recipient')),
      acknowledgement: formValue(values, 'acknowledgement'),
      reviewed: values.has('reviewed') };
  }

  function versionOf(report) {
    const { id, versions, editToken, ...version } = report;
    return version;
  }

  async function saveReport(ready) {
    const content = readReport();
    if (ready && !content.reviewed) throw new Error('Check the review box before marking this report Ready.');
    if (ready && !Object.values(content.sections).some(D.tidy)) throw new Error('Enter a report point before marking it Ready.');
    if (content.acknowledgement.trim() && !content.recipient) throw new Error('Enter the recipient for this acknowledgement.');
    const original = modal.row;
    return commit(data => {
      const existing = data.reports.find(row => !row.deletedAt && row.date === original.date && row.shift === original.shift);
      const at = D.stamp();
      const row = { ...original, ...content, status: ready ? 'ready' : 'draft', updatedAt: at, editToken: D.uid() };
      delete row.reviewed;
      if (existing && existing.editToken !== original.editToken) {
        existing.versions = [...L(existing.versions), { ...versionOf(row), status: 'conflict' }];
        return { row: existing, conflict: true };
      }
      if (original.editToken && !existing) {
        row.id = D.uid();
        row.status = 'draft';
        data.reports.push(row);
        return { row, conflict: true };
      }
      row.versions = existing ? [...L(existing.versions), versionOf(existing)] : [];
      if (existing) data.reports[data.reports.indexOf(existing)] = row;
      else data.reports.push(row);
      return { row, conflict: false };
    }, result => result.conflict ? 'Your edits are saved for recovery. Check the report versions.' :
      ready ? 'Report marked Ready.' : 'Report draft saved.');
  }

  function searchPage() {
    const filters = state.search;
    const results = state.searched ? D.search(db, filters) : [];
    const fields = input('words', 'Words', filters.words, { wide: true, extra: ' data-initial-focus' }) +
      dateInput('from', 'From date', filters.from) + dateInput('to', 'To date', filters.to) +
      input('tag', 'Tag', filters.tag) + input('person', 'Person', filters.person) +
      input('area', 'Area', filters.area) + input('equipment', 'Equipment / tag', filters.equipment) +
      select('type', 'Entry type', { '': 'All types', ...D.TYPES }, filters.type) +
      select('scope', 'Category', SCOPES, filters.scope);
    return page('FIND AN ENTRY', 'Search', 'Search your diary across dates and record types.') +
      '<div class="split">' + panel('Filters', (state.searchError ? note(state.searchError, 'error') : '') +
      '<form id="search-form" class="form-grid" novalidate>' + fields + '<div class="actions wide">' +
      '<button class="primary" type="submit">Search</button>' + btn('Clear', 'search-clear') + '</div></form>') +
      panel(state.searched ? results.length + ' results' : 'Results', rowsView(results, { showDate: true, preview: true,
        empty: state.searched ? 'No entries match these filters.' : 'Enter words or choose a filter.' })) + '</div>';
  }

  const reviewPeriod = () => state.review === 'month' ? D.monthRange(state.date) :
    [D.weekStart(state.date), D.addDays(D.weekStart(state.date), 6)];

  function counts(rows, field, other) {
    const map = new Map();
    for (const row of rows) {
      const value = D.tidy(row[field] || (other ? named(db[other], row.contactId) : '')) || 'Unspecified';
      map.set(value, (map.get(value) || 0) + 1);
    }
    return [...map].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  }

  function breakdown(rows, field, other) {
    const values = counts(rows, field, other);
    return values.length ? '<div class="table-wrap"><table><thead><tr><th scope="col">' +
      (field === 'person' ? 'Person' : 'Area') + '</th><th scope="col">Records</th></tr></thead><tbody>' +
      values.map(([label, number]) => '<tr><td>' + E(label) + '</td><td>' + number + '</td></tr>').join('') +
      '</tbody></table></div>' : empty('No work entries in this period.');
  }

  function reviewsPage() {
    const [start, end] = reviewPeriod();
    const result = D.metrics(db, start, end);
    const cards = [
      ['completed', 'Completed', 'Task completion date falls in this period.'],
      ['overdue', 'Overdue', 'Tasks still open at the cutoff with a deadline before that date.'],
      ['carried', 'Carried forward', 'Tasks originally planned before this period that were open when it began.'],
      ['upcoming', 'Upcoming', 'Open tasks due in the seven days after the cutoff.']
    ];
    const tools = btn('Weekly review', 'navigate', { view: 'dayplan', sub: 'weekly', date: state.date }) + btn('Print / PDF', 'print-review') + dateNav();
    const doneSteps = result.routines.reduce((sum, run) => sum + run.items.filter(item => item.done).length, 0);
    const allSteps = result.routines.reduce((sum, run) => sum + run.items.length, 0);
    const routineSummary = '<p><strong>' + doneSteps + ' / ' + allSteps + '</strong> routine steps checked</p>' +
      (result.routines.length ? '<ul class="history">' + result.routines.map(run => '<li>' + E(joined([
        dated(run.date), run.shift, run.name, run.items.filter(item => item.done).length + '/' + run.items.length
      ])) + '</li>').join('') + '</ul>' : empty('No routine checklists recorded in this period.'));
    const minutes = '<p><strong>' + E(D.minutesText(result.time.work + result.time.personal)) + '</strong> recorded</p>' +
      '<p class="muted">' + E('Work ' + D.minutesText(result.time.work) + ' · Personal ' + D.minutesText(result.time.personal)) + '</p>';
    return page('REVIEW', 'Weekly & Monthly Review', dated(start) + ' – ' + dated(end), tools) +
      tabs({ week: 'Weekly', month: 'Monthly' }, 'review', 'Review period') +
      '<p class="muted">Cutoff ' + E(dated(result.cutoff)) + ' · Counts use saved dates and completion history available in this diary.</p>' +
      '<div class="metric-strip">' + cards.map(([key, title]) => '<button class="metric" type="button" data-action="jump" data-id="review-' +
        key + '"><strong>' + result[key].length + '</strong><span>' + title + '</span></button>').join('') + '</div>' +
      '<div class="two-cols">' + cards.map(([key, title, help]) => panel(title, rowsView(result[key], { showDate: true }), '', help, 'review-' + key)).join('') +
      panel('Outstanding follow-ups', rowsView(result.followups, { showDate: true })) +
      panel('Actual time spent', minutes, '', 'Based on the date and minutes saved on each task.') +
      panel('Routine completion', routineSummary) + finance.review(state.date.slice(0, 7)) +
      panel('Open MWR age', result.mwrs.length ? '<div class="rows">' + result.mwrs.map(({ row, age }) => '<div class="row"><div class="row-main">' +
        btn(row.title, 'entry-view', { id: row.id }, { cls: 'row-title' }) + '</div>' +
        chip(age == null ? 'Date raised unavailable' : age + ' days') + '</div>').join('') + '</div>' : empty('No open MWRs for this cutoff.'),
      '', 'Age is the number of calendar days since the date raised.') +
      panel('Personal goals', db.goals.some(row => !row.deletedAt) ? '<div class="rows">' + db.goals.filter(row => !row.deletedAt).map(row => {
        const progress = L(row.progress).filter(item => item.date >= start && item.date <= end).reduce((sum, item) => sum + Number(item.amount || 0), 0);
        return '<div class="row"><strong>' + E(row.name) + '</strong>' + chip(progress + ' ' + (row.unit || 'logged')) + '</div>';
      }).join('') + '</div>' : empty('No goals saved.'), linkButton('Planner', 'planner', { sub: 'goals' }), 'Progress logged within this period.') +
      panel('Work by area', breakdown(result.work, 'area')) + panel('Work by person', breakdown(result.work, 'person', 'contacts')) + '</div>';
  }

  function deletedPage() {
    const trash = db.entries.filter(row => row.deletedAt).map(row => ({ ...row, collection: 'entries', label: row.title || 'Untitled draft' }))
      .concat(db.reports.filter(row => row.deletedAt).map(row => ({ ...row, collection: 'reports', label: row.shift + ' report · ' + dated(row.date) })),
        db.money.filter(row => row.deletedAt).map(row => ({ ...row, collection: 'money', label: row.title || row.category })),
        db.billTemplates.filter(row => row.deletedAt).map(row => ({ ...row, collection: 'billTemplates', label: 'Bill · ' + row.title })),
        db.budgets.filter(row => row.deletedAt).map(row => ({ ...row, collection: 'budgets', label: (row.category || 'Monthly') + ' budget · ' + row.month })),
        db.handovers.filter(row => row.deletedAt).map(row => ({ ...row, collection: 'handovers', label: 'Handover · ' + dated(row.date) + ' ' + row.shift })),
        ...['assignments', 'updateNotes'].map(collection => db[collection].filter(row => row.deletedAt)
          .map(row => ({ ...row, collection, label: (collection === 'assignments' ? 'Assignment · ' : 'Update Log · ') + row.title }))),
        ...Object.keys(AUX).map(key => db[key].filter(row => row.deletedAt).map(row => ({ ...row, collection: key, label: row.name }))))
      .sort((a, b) => D.str(b.deletedAt).localeCompare(D.str(a.deletedAt)));
    return trash.length ? '<div class="rows">' + trash.map(row => '<div class="row"><div class="row-main"><strong>' +
      E(row.label) + '</strong><p class="muted">' + E(D.formatStamp(row.deletedAt)) + '</p></div>' +
      btn('Recover', 'recover', { id: row.id, collection: row.collection }, { cls: 'small' }) + '</div>').join('') + '</div>' :
    empty('Deleted diary records appear here.');
  }

  function settingsPage() {
    const settings = db.settings;
    const diaryFile = D.deviceDB.fileName?.();
    const fields = select('theme', 'Appearance', { system: 'Use device theme', light: 'Light', dark: 'Dark' }, settings.theme) +
      select('palette', 'Colour palette', D.PALETTES, settings.palette) +
      select('diaryFont', 'Diary font', N.fonts, N.font(settings.diaryFont) || 'system') +
      input('soonDays', 'Days to show as Due soon', settings.soonDays, { type: 'number', extra: ' min="1" max="30" step="1"' }) +
      timeInput('reminderTime', 'Default reminder time', settings.reminderTime) +
      timeInput('quietStart', 'Quiet hours start (optional)', settings.quietStart) +
      timeInput('quietEnd', 'Quiet hours end (optional)', settings.quietEnd);
    let savedCopies = [];
    try { savedCopies = Z.copies(); } catch { /* A bad copy index is independent of diary records. */ }
    const drafts = db.entries.filter(row => row.draft && !row.deletedAt);
    const copies = savedCopies.length ? '<div class="rows">' + savedCopies.map(copy => '<div class="row"><div class="row-main"><strong>' +
      E(copy.name) + '</strong><p class="muted">' + E(joined([D.formatStamp(copy.at), copy.count + ' entries'])) + '</p></div>' +
      '<div class="actions">' + btn('Download', 'copy-export', { id: copy.id }, { cls: 'small' }) +
      btn('Restore', 'copy-restore', { id: copy.id }, { cls: 'small' }) +
      btn('Delete copy', 'copy-delete', { id: copy.id }, { cls: 'small danger' }) + '</div></div>').join('') + '</div>' :
      empty('Save a copy to keep a local restore point.');
    return page('THIS DEVICE', 'Settings & Backups', diaryFile
      ? 'Your records and attachments are saved to ' + diaryFile + '.'
      : 'Your records are saved in this browser for this website address.') +
      '<div class="two-cols">' +
      panel('Preferences', '<form id="settings-form" class="form-grid" novalidate>' + fields +
        '<div class="wide">' + check('quietByRoster', 'Quiet until next duty during Rest, Off or Leave', settings.quietByRoster) +
        check('quietRosterCritical', 'Allow critical work reminders during roster quiet', settings.quietRosterCritical !== false) + '</div>' +
        '<div class="wide">' + check('notifications', 'Browser alerts while the diary is open', settings.notifications) + '</div>' +
        '<div class="actions wide"><button class="primary" type="submit">Save settings</button></div></form>' +
        '<p class="muted section-actions">Reminders check while the diary is open. Background tabs may check late. Closing or suspending the page pauses checks. Quiet hours use Asia/Karachi.</p>') +
      panel('Backup and restore', '<p>' + E(db.savedAt ? 'Last saved ' + D.formatStamp(db.savedAt) : 'Your diary is empty.') + '</p>' +
        '<p class="muted">' + (diaryFile ? 'Download a JSON backup with attachment files before moving to a different device.' :
          'Download a JSON backup with attachment files before clearing browser data or moving to a different device.') + '</p>' +
        '<div class="actions">' + btn('Download JSON backup', 'backup', {}, { icon: 'download' }) +
        btn('Restore backup', 'restore-choose') + btn('Export Excel', 'excel', {}, { icon: 'download' }) +
        btn('Print diary records', 'print-all') + '</div><p class="muted section-actions">Choose a diary JSON, or Task Desk JSON with its optional attachment ZIP.</p>' +
        '<input id="restore-file" type="file" accept=".json,.zip,application/json,application/zip" multiple hidden>') +
      panel('Drafts', rowsView(drafts, { showDate: true, more: true, empty: 'Draft entries will appear here.' })) +
      panel('Saved copies', copies, btn('Save copy', 'copy-save', {}, { cls: 'text-button' })) +
      panel('Deleted items', deletedPage()) +
      (diaryFile ? panel('Laptop edition · Pocket diary tools', (D.deviceDB.setupFile
        ? '<p>Use the Windows diary launcher to reopen your remembered file. Edge may ask for access again.</p>' +
          '<div class="actions">' + btn('Manage remembered file', 'laptop-file-setup') + '</div>'
        : '<p>Open the laptop HTML file and choose your .shiftlife diary file each time.</p>') +
        '<p class="muted">Use one diary tab at a time. Keep a separate backup. The diary file holds up to 100 MiB, including attachments and saved copies.</p>') :
      panel('Offline and installation', '<p>' + E(offlineReady ? 'App files are ready to open offline.' :
        location.protocol === 'file:' ? 'Open the hosted link or localhost to set up offline installation.' :
          'Offline files are unavailable or still preparing.') + '</p>' +
        '<p class="muted">Use the same browser and address. Browser storage settings control how long the device keeps your records.</p><div class="actions">' +
        (installPrompt ? btn('Install diary', 'install') : '') + (waitingWorker ? btn('Reload with update', 'app-update') : '') +
        (navigator.storage?.persist ? btn('Request persistent storage', 'persist') : '') +
        '</div><p class="muted">Use your browser’s install or Add to Home Screen option when available.</p>')) +
      panel('Sample entries', '<p class="muted">Load fictional examples for the main diary views. Each example has a Sample label.</p><div class="actions">' +
        btn('Load samples', 'sample-add') + btn('Remove samples', 'sample-remove') + '</div>') +
      '</div>';
  }

  function remindersDialog() {
    const { due, alarms, quiet: rosterQuiet, held, updates } = R.reminderState(db);
    const quiet = D.quietNow(db.settings, now().time);
    const deferred = held.map(({ row }) => '<article class="plan-review-row"><div>' +
      btn(row.title, 'entry-view', { id: row.id }, { cls: 'row-title' }) + '</div>' +
      btn('Allow during roster quiet', 'roster-quiet-exception', { id: row.id }, { cls: 'small' }) + '</article>').join('');
    const body = (quiet ? note('Quiet hours are active.', 'warn') : '') +
      (rosterQuiet ? note('Roster quiet until ' + D.formatStamp(new Date(rosterQuiet.end).toISOString()) + '.', 'warn') : '') +
      (alarms.length ? panel('Shift alarms', alarmCards(alarms)) : '') + rosterAlertPanel() +
      (updates.length ? panel('Work & diary updates', workUpdateCards(updates), updates.some(item => !item.dismissed) ?
        btn('Hide pop-up for today', 'work-updates-hide', {}, { cls: 'small' }) : '') : '') +
      (due.length ? '<div class="rows">' + due.map(item => '<div class="row"><div class="row-main">' +
        btn(item.row.title, 'entry-view', { id: item.row.id }, { cls: 'row-title' }) +
        '<p class="muted">' + E(joined([dated(item.due.date), item.due.time])) + '</p><div class="actions">' +
        btn('Snooze 15 min', 'reminder-update', { key: item.key, snooze: 15 }, { cls: 'small' }) +
        btn('Snooze 1 hour', 'reminder-update', { key: item.key, snooze: 60 }, { cls: 'small' }) +
        btn('Acknowledge', 'reminder-update', { key: item.key }, { cls: 'small' }) + '</div></div></div>').join('') + '</div>' :
        !updates.length && !alarms.length ? empty('No reminders due right now.') : '') +
      (deferred ? panel('Deferred work reminders', deferred) : '') + '<p class="muted section-actions">Reminders run while this diary is open.</p>';
    openDialog('reminders', 'Reminders', body, btn('Close', 'close-dialog'));
  }

  function reschedule(row) {
    if (!row || row.type !== 'task' || !D.active(row)) throw new Error('This task is no longer available.');
    openDialog('reschedule', 'Move task date', '<p><strong>' + E(row.title) + '</strong></p>' +
      '<form id="reschedule-form" class="form-grid" novalidate><div class="actions wide">' +
      btn('Previous day', 'reschedule-step', { direction: -1 }, { icon: 'left' }) +
      btn('Next day', 'reschedule-step', { direction: 1 }, { icon: 'right' }) + '</div>' +
      dateInput('date', 'New planned date', row.date) + dateInput('dueDate', 'New due date (optional)', row.dueDate) +
      timeInput('dueTime', 'Due time (optional)', row.dueTime) + textarea('reason', 'Reason (optional)', '') + '</form>',
      btn('Cancel', 'close-dialog') + '<button type="submit" form="reschedule-form" class="primary">Save date</button>', { row });
  }

  function download(data, name, type = 'application/octet-stream') {
    const url = URL.createObjectURL(data instanceof Blob ? data : new Blob([data], { type }));
    const a = document.createElement('a');
    a.href = url;
    a.download = D.str(name).replace(/[/\\\u0000-\u001f]/g, '_') || 'download';
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
  }

  async function copyText(text, title) {
    try {
      await navigator.clipboard.writeText(text);
      toast('Copied to clipboard.');
    } catch {
      openDialog('copy-text', title, '<p>Select and copy the text.</p><label>Text<textarea readonly data-initial-focus>' +
        E(text) + '</textarea></label>', btn('Close', 'close-dialog'));
      $('textarea', dialog).select();
    }
  }

  function printableEntry(row) {
    return '<section><h3>' + E(row.title || 'Untitled draft') + '</h3><p>' +
      E(joined([D.TYPES[row.type], SCOPES[row.scope], dated(row.date), row.time, statuses(row)[row.status], row.sample ? 'Sample' : '',
        row.draft ? 'Draft' : '', row.deletedAt ? 'Deleted' : '', row.number ? 'MWR ' + row.number : '',
        row.dueDate ? 'Due ' + dated(row.dueDate) : '', row.followDate ? 'Follow up ' + dated(row.followDate) : '',
        row.area, row.equipment, row.person, row.department, row.dutyDate ? row.dutyShift + ' duty ' + dated(row.dutyDate) : ''])) + '</p>' +
      ['body', 'readings', 'agenda', 'participants', 'minutes', 'decisions', 'waitingReason', 'closeNotes', 'closingComment', 'handover']
        .map(key => N.render(row[key], row.noteStyles?.[key])).join('') +
      (L(row.subtasks).length ? '<ul>' + row.subtasks.map(item => '<li>' + E((item.done ? '✓ ' : '') + item.title) + '</li>').join('') + '</ul>' : '') +
      (L(row.attachments).length ? '<p>Attachments ' + E(row.attachments.map(file => file.name).join(', ')) + '</p>' : '') +
      '</section>';
  }

  function print(title, body) {
    $('#print-area').innerHTML = '<h1>' + E(title) + '</h1>' + body;
    window.print();
  }

  function printDay(date) {
    const entries = scheduledDay(date);
    const faith = state.scope !== 'work' &&
      (db.namazLog.some(row => row.date === date) || db.zikrLog.some(row => row.date === date) || D.byId(db.faithNotes, date));
    print('Diary · ' + dated(date), (entries.length ? entries.map(printableEntry).join('') : '<p>No entries for this date.</p>') +
      (faith ? '<h2>Faith diary</h2>' + dayTools.faithSummary(date) : ''));
  }

  function printAll() {
    const groups = Object.entries(D.TYPES).map(([type, title]) => {
      const rows = db.entries.filter(row => row.type === type).sort((a, b) => a.date.localeCompare(b.date));
      return rows.length ? '<h2>' + E(title) + '</h2>' + rows.map(printableEntry).join('') : '';
    }).join('');
    const groups2 = [
      ['Roster', db.roster.map(row => joined([dated(row.date), row.shift, dutyLabel(row), row.note]))],
      ['Roster history', db.dutyHistory.map(row => joined([dated(row.date), row.before?.shift, row.after?.shift, row.reason]))],
      ['Contacts', db.contacts.map(row => joined([row.name, row.department, row.details, row.notes]))],
      ['Projects and notebooks', db.notebooks.map(row => joined([row.name, row.notes]))],
      ['Checklist templates', db.templates.map(row => joined([row.name, ...L(row.items).map(item => item.title)]))],
      ['Checklists', db.checklists.map(row => joined([dated(row.date), row.name, row.shift, ...L(row.items).map(item => (item.done ? '✓ ' : '') + item.title)]))],
      ['Goals', db.goals.map(row => joined([row.name, row.target, row.unit, row.notes,
        ...L(row.progress).map(item => joined([dated(item.date), D.str(item.amount), item.note]))]))]
    ].filter(([, rows]) => rows.length).map(([title, rows]) => '<h2>' + E(title) + '</h2>' +
      rows.map(row => '<p>' + E(row) + '</p>').join('')).join('');
    print('My Shift & Life Digital Diary', groups + (db.reports.length ? '<h2>Shift reports</h2>' +
      db.reports.map(row => '<section><pre>' + E(D.reportText(row)) + '</pre><pre>' +
        E(row.sections?.verbal || '') + '</pre></section>').join('') : '') + groups2 || '<p>No records saved.</p>');
  }

  function printReview() {
    const [start, end] = reviewPeriod();
    const result = D.metrics(db, start, end);
    const sections = [['Completed', result.completed], ['Overdue', result.overdue],
      ['Carried forward', result.carried], ['Upcoming', result.upcoming]];
    print('Diary review · ' + dated(start) + ' – ' + dated(end),
      '<p>Cutoff ' + E(dated(result.cutoff)) + '</p>' + sections.map(([label, entries]) => '<h2>' + label + ' (' + entries.length +
        ')</h2>' + entries.map(printableEntry).join('')).join('') +
      '<h2>Open MWRs</h2>' + result.mwrs.map(({ row, age }) => '<p>' + E(row.title + ' · ' + (age == null ? 'Unknown age' : age + ' days')) + '</p>').join('') +
      '<h2>Work by area</h2>' + breakdown(result.work, 'area') + '<h2>Work by person</h2>' + breakdown(result.work, 'person', 'contacts') +
      '<h2>Outstanding follow-ups</h2>' + result.followups.map(printableEntry).join('') +
      '<h2>Actual time spent</h2><p>' + E('Work ' + D.minutesText(result.time.work) + ' · Personal ' + D.minutesText(result.time.personal)) + '</p>' +
      '<h2>Routine completion</h2>' + result.routines.map(run => '<p>' + E(joined([dated(run.date), run.name,
        run.items.filter(item => item.done).length + '/' + run.items.length])) + '</p>').join('') +
      '<h2>Personal goals</h2>' + db.goals.filter(row => !row.deletedAt).map(row => '<p>' + E(row.name + ' · ' +
        L(row.progress).filter(item => item.date >= start && item.date <= end).reduce((sum, item) => sum + Number(item.amount || 0), 0) +
        ' ' + (row.unit || 'logged')) + '</p>').join(''));
  }

  async function backupPreview(file, zip) {
    const current = Z.read();
    const prepared = file ? await Z.prepareImport(file, zip) : await Z.prepareArchive(zip, current);
    if (Z.read().rev !== current.rev) throw new Error('The diary changed while reading this backup. Open the backup again.');
    const data = prepared.data;
    const { added, skipped, fileCount } = Z.summary(prepared);
    const counts = [data.entries.length + ' entries', data.roster.length + ' duties', data.reports.length + ' reports',
      data.money.length + ' transactions', data.budgets.length + ' budgets', data.checklists.length + ' routine checklists',
      data.handovers.length + ' handovers', data.workRules.length + ' work routines',
      data.assignments.length + ' assignments', data.updateNotes.length + ' update notes',
      data.namazTimes.length + ' timetable days', data.namazLog.length + ' prayer logs',
      data.zikrLog.length + ' zikr logs', data.faithNotes.length + ' faith diary notes', fileCount + ' attachment files'];
    const warning = prepared.warnings.map(text => note(text, 'warn')).join('');
    const attachmentsOnly = prepared.kind === 'attachments';
    const pair = prepared.kind === 'legacy' && !zip ? '<div class="actions">' +
      btn('Choose matching ZIP', 'restore-pair') + '<input id="pair-archive" type="file" accept=".zip,application/zip" hidden></div>' : '';
    const changes = attachmentsOnly ? '<p>' + E(fileCount + ' matching files can be restored to existing records.') + '</p>' :
      '<p>' + E(counts.join(' · ')) + '</p><p><strong>Merge</strong> adds ' + added + ' records and keeps ' + skipped +
      ' matching records in this diary. <strong>Replace</strong> uses the backup for the whole diary, including settings.</p>';
    const buttons = attachmentsOnly ? btn('Restore attachments', 'restore-apply', { mode: 'attachments' }, { cls: 'primary', disabled: !fileCount }) :
      btn('Replace diary', 'restore-apply', { mode: 'replace' }, { cls: 'danger' }) +
      btn('Merge records', 'restore-apply', { mode: 'merge' }, { cls: 'primary' });
    openDialog('restore', 'Preview restore', '<p class="muted">' + E(prepared.source) + '</p>' + changes +
      '<p>A local checkpoint is saved first when this browser already has a diary.</p>' + warning + pair,
      btn('Cancel', 'close-dialog') + buttons, { prepared, rev: current.rev, file });
  }

  const finance = D.createExpenses({ state, current: () => db, now, E, btn, ibtn, chip, empty, page, panel, dateNav, select,
    input, dateInput, readDate, openDialog, render, commit, ask, removeRecord, download });
  const progressUI = D.createProgressUI({ current: () => db, now, E, btn, input, textarea, check, dateInput, timeInput,
    readDate, readTime, openDialog, commit });
  const hierarchyUI = D.createHierarchyUI({ current: () => db, now, E, btn, dateInput, textarea, readDate, openDialog, commit });
  const dayTools = D.createDayTools({ state, current: () => db, now, viewDutyDay: stickyDutyDay, E, btn, ibtn, chip, empty, page, panel, dateNav, tabs,
    select, input, textarea, check, dateInput, timeInput, readDate, readTime, formValue, openDialog, commit,
    rowsView, editEntry, blankEntry, linkButton, assignerInput, dutyWarning, personLink, showError, render, related: relatedWork });
  const portfolioTools = D.createPortfolioTools({ state, current: () => db, now, E, btn, chip, empty, page, panel,
    select, input, dateInput, readDate, formValue, openDialog, closeDialog, commit, render, navigate, assignerInput, copyText, removeRecord, ask,
    progressPanel: progressUI.panel });
  const companion = D.createShiftCompanionUI({ state, current: () => db, now, E, btn, chip, empty, panel,
    select, input, textarea, check, dateInput, timeInput, readDate, readTime, formValue, openDialog, closeDialog,
    commit, render, navigate, viewEntry: id => entryDetail(fetchRow(id)), ask });
  const planTools = D.createDayPlanUI({ state, current: () => db, now, E, btn, chip, empty, note, page, panel, dateNav,
    select, input, textarea, check, dateInput, timeInput, readDate, readTime, formValue, openDialog, closeDialog, render, commit, companion,
    remember, copyText, download, ask, related: relatedWork, newTask: (date, title = '') => editEntry(blankEntry('task', { date, title })) });
  const dashboard = D.createDashboard({ state, current: () => db, now, E, btn, empty, page, panel, dateNav, tabs });
  const highlights = D.createShiftHighlights({ state, current: () => db, E, btn, empty, page, panel, dateNav, select,
    openDialog, render, commit, copyText, versionOf });
  const coachUI = D.createCoachUI({ state, current: () => db, now, E, btn, empty, page, panel, dateNav, render });
  const pages = { dashboard, today: todayPage, diary: diaryPage, tasks: tasksPage, planner: plannerPage, dayplan: planTools.page,
    highlights: highlights.page, coach: coachUI.page,
    shift: shiftPage, registers: registersPage, finance: finance.page, reviews: reviewsPage, search: searchPage, settings: settingsPage,
    stickies: dayTools.stickyPage, work: dayTools.workPage, faith: dayTools.faithPage,
    assignments: portfolioTools.assignmentsPage, updates: portfolioTools.updatesPage };

  const modalButtons = () => $$('button', dialog).filter(button => !button.disabled);
  async function busyDialog(action, close = true) {
    const current = modal;
    if (!current || current.busy) return;
    const buttons = modalButtons();
    current.busy = true;
    buttons.forEach(button => { button.disabled = true; });
    try {
      const result = await action();
      current.busy = false;
      if (close && modal === current) closeDialog(true);
      return result;
    } finally {
      current.busy = false;
      buttons.forEach(button => { button.disabled = false; });
    }
  }

  function guardedEntry(data, id, action) {
    const row = D.byId(data.entries, id);
    if (!row || row.deletedAt) throw new Error('This entry is in Deleted items or is no longer available.');
    return action(row);
  }

  async function taskStatus(id, status) {
    await commit(data => guardedEntry(data, id, row => {
      if (!D.active(row) || row.type !== 'task' || !Object.hasOwn(D.STATUS, status) || row.status === status) return false;
      D.setTaskStatus(row, status);
    }), 'Task moved to ' + D.STATUS[status] + '.');
    if (modal?.kind === 'detail' && D.same(modal.id, id)) entryDetail(fetchRow(id));
  }

  async function setTaskSticky({ id, show }) {
    const sticky = show === 'yes';
    await commit(data => guardedEntry(data, id, row => {
      if (!D.active(row) || row.type !== 'task' || W.isSticky(row) === sticky) return false;
      const at = D.stamp();
      Object.assign(row, { stickyCard: sticky, updatedAt: at, editToken: D.uid() });
      if (!sticky) row.stickyPinned = false;
      else if (row.shiftStickyKey) row.stickyPinned = true;
      row.history = [...L(row.history), { at, action: sticky ? 'Shown as sticky' : 'Moved to Tasks only' }];
      if (sticky && state.taskFocus === 'both') state.stickies = D.open(row) ? 'shift' : 'done';
    }), sticky ? 'Shown in Stickies.' : 'Converted to a task.');
    if (modal?.kind === 'detail' && D.same(modal.id, id)) entryDetail(fetchRow(id));
  }

  async function pinTask({ id }) {
    await commit(data => guardedEntry(data, id, row => {
      if (!D.open(row) || row.type !== 'task') return false;
      Object.assign(row, { taskPinned: !row.taskPinned, updatedAt: D.stamp(), editToken: D.uid() });
      if (row.taskPinned) data.settings.taskDockOpen = true;
    }), 'Tasks panel updated.');
    if (state.view !== 'stickies' && !state.taskFocus && D.byId(db.entries, id)?.taskPinned) {
      state.dock = 'tasks';
      renderDocks();
    }
    if (modal?.kind === 'detail' && D.same(modal.id, id)) entryDetail(fetchRow(id));
  }

  async function showTasksByPerson({ name, directory }) {
    closeDialog(true);
    state.tasks = 'assignments';
    state.taskPerson = W.personKey(name);
    if (name && !directory) {
      for (const key of ['scope', 'taskStatus', 'taskArea', 'taskPriority', 'taskShift', 'taskQuery', 'taskWindow', 'taskAssignment', 'taskHeading']) state[key] = '';
    }
    if (state.taskFocus === 'both' || state.taskFocus === 'stickies') state.taskFocus = 'tasks';
    await navigate('tasks');
    $$('[data-action="tasks-by-person"][data-directory]', main).find(button => W.personKey(button.dataset.name) === state.taskPerson)?.focus();
  }

  async function saveAssigner(form) {
    const name = D.tidy(new FormData(form).get('name')).replace(/\s+/g, ' ');
    if (!name || name.length > 120) throw new Error('Enter a name of up to 120 characters.');
    await commit(data => {
      if (W.assigners(data).some(value => W.personKey(value) === W.personKey(name))) return false;
      data.settings.assignerNames = [...L(data.settings.assignerNames), name];
    }, 'Name added.', true, false);
    await showTasksByPerson({ name });
  }

  async function taskOrder(id, direction, target) {
    const scroller = $('[data-board]', main);
    const columnView = !!scroller;
    const left = scroller?.scrollLeft || 0;
    await commit(data => guardedEntry(data, id, row => {
      if (!D.active(row) || row.type !== 'task') return false;
      let status = '';
      let before = null;
      if (target) {
        status = target.status;
        before = target.before;
      } else {
        const column = data.entries.filter(item => D.active(item) && item.type === 'task' &&
          taskOrderVisible(item, row, columnView)).sort(order);
        const index = column.findIndex(item => D.same(item.id, id));
        if (index < 0) return false;
        if (columnView) status = row.status;
        if (direction === 'up' && index > 0) before = column[index - 1].id;
        else if (direction === 'down' && index < column.length - 1) before = column[index + 2]?.id ?? null;
        else return false;
      }
      if (!D.moveTask(data.entries, id, status, before)) return false;
      if (status) D.setTaskStatus(row, status);
      row.history = [...L(row.history), { at: D.stamp(), action: 'Manual order changed' }];
    }), 'Task position saved.');
    const board = $('[data-board]', main);
    if (board) board.scrollLeft = left;
    const card = $$('[data-taskcard]', main).find(node => node.dataset.taskcard === id);
    if (card) {
      if (board && !target) card.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      if (!target) $('[data-action="drag"]', card)?.focus({ preventScroll: true });
    }
  }

  function switchTab(key, value) {
    if (!['scope', 'tasks', 'taskCollection', 'taskKind', 'summaryMode', 'summaryKind', 'sort', 'taskStatus', 'taskArea', 'taskPriority', 'taskShift', 'taskAssignment', 'taskHeading',
      'planner', 'register', 'role', 'registerStatus', 'phase', 'handoverShift', 'review', 'stickies', 'zikrSlot'].includes(key)) return;
    if (key === 'register') state.registerStatus = '';
    state[key] = value;
    render();
    $$('[data-action="tab"]', main).find(button => button.dataset.key === key && button.dataset.value === value)?.focus({ preventScroll: true });
    $('[data-setting-tab="' + key + '"]', main)?.focus({ preventScroll: true });
  }

  function convertNote(id) {
    const row = fetchRow(id);
    if (!row || row.type !== 'note' || row.deletedAt) throw new Error('This note is no longer available.');
    const linked = db.entries.find(item => item.type === 'task' && !item.deletedAt && D.same(item.sourceNoteId, row.id));
    if (linked) return linked.draft ? editEntry(linked) : entryDetail(linked);
    return editEntry(blankEntry('task', { title: row.title, body: row.body, date: row.date,
      noteStyles: row.noteStyles?.body ? { body: row.noteStyles.body } : undefined,
      scope: row.scope, sourceNoteId: row.id, links: [row.id], tags: L(row.tags) }));
  }

  async function removeRecord(collection, id) {
    await commit(data => {
      const row = D.byId(data[collection], id) || (collection === 'entries' ? fetchRow(id) : null);
      if (!row || row.deletedAt) return false;
      const deleted = { ...row, virtual: false, deletedAt: D.stamp(), updatedAt: D.stamp(), editToken: D.uid() };
      if (collection === 'entries') deleted.history = [...L(row.history), { at: deleted.deletedAt, action: 'Moved to Deleted items' }];
      const old = D.byId(data[collection], id);
      if (old) data[collection][data[collection].indexOf(old)] = deleted;
      else data[collection].push(deleted);
    }, 'Moved to Deleted items.');
    closeDialog(true);
  }

  async function recover(collection, id) {
    if (!['entries', 'reports', 'money', 'budgets', 'billTemplates', 'handovers', 'assignments', 'updateNotes', ...Object.keys(AUX)].includes(collection)) return;
    await commit(data => {
      const row = D.byId(data[collection], id);
      if (!row?.deletedAt) return false;
      if (collection === 'reports' && data.reports.some(other => !other.deletedAt && other.date === row.date && other.shift === row.shift)) {
        throw new Error('There is already an active report for this duty. Save its text before replacing it.');
      }
      if (collection === 'budgets' && data.budgets.some(other => !other.deletedAt && other.month === row.month &&
        D.categoryKey(other.category) === D.categoryKey(row.category))) {
        throw new Error('This month already has a budget for that category.');
      }
      const bill = collection === 'money' && D.budgeting.billKey(row);
      if (bill && data.money.some(other => !other.deletedAt && D.budgeting.billKey(other) === bill)) {
        throw new Error('This bill already has a payment for that month.');
      }
      row.deletedAt = '';
      row.updatedAt = D.stamp();
      row.editToken = D.uid();
      if (collection === 'entries') row.history = [...L(row.history), { at: row.updatedAt, action: 'Recovered' }];
    }, 'Record recovered.');
  }

  async function addSamples() {
    await commit(data => {
      if (data.entries.some(row => row.sample && !row.deletedAt)) return false;
      const date = now().date;
      const at = D.stamp();
      const sample = (type, title, extras) => ({ ...blankEntry(type, { date }), ...extras, title, sample: true,
        tags: ['sample'], createdAt: at, updatedAt: at, editToken: D.uid(), history: [{ at, action: 'Loaded sample' }] });
      const task = sample('task', 'Sample · Review pending work', { date: D.addDays(date, -1), dueDate: date,
        status: 'todo', scope: 'work', focus: true, position: 1, body: 'Fictional task for trying the board and rescheduling.' });
      data.entries.push(task,
        sample('note', 'Sample · Personal journal', { scope: 'personal', time: '08:00', pinned: true, body: 'Fictional diary note for trying tags and links.' }),
        sample('event', 'Sample · Personal time block', { scope: 'personal', kind: 'Time block', time: '17:00', endTime: '18:00', endDate: date }),
        sample('meeting', 'Sample · Planning meeting', { scope: 'work', time: '10:00', endTime: '10:30', endDate: date,
          agenda: 'Fictional agenda: review pending work.', links: [task.id] }),
        sample('log', 'Sample · Practice log entry', { scope: 'work', time: '08:15', dutyShift: 'Morning', dutyDate: date, phase: 'during',
          body: 'Fictional example. Enter the actual observation and equipment tag here.' }),
        sample('mwr', 'Sample · Draft a maintenance request', { scope: 'work', status: 'planned', area: 'Sample area', links: [task.id],
          body: 'Fictional request for trying the MWR register.' }),
        sample('followup', 'Sample · Check for a response', { scope: 'work', status: 'waiting', role: 'Day Engineer',
          followDate: D.addDays(date, 1), waitingReason: 'Fictional example for trying follow-ups.' }));
      return true;
    }, 'Sample entries loaded.').then(result => { if (result === false) toast('Sample entries are already loaded.'); });
  }

  const actions = {
    ...finance.actions,
    ...dayTools.actions,
    ...portfolioTools.actions,
    ...planTools.actions,
    ...companion.actions,
    'progress-edit': progressUI.edit,
    'work-batch': hierarchyUI.batch,
    'highlights-edit': highlights.edit,
    'highlights-copy': highlights.copy,
    'coach-view': coachUI.view,
    'coach-meeting': () => editEntry(blankEntry('meeting', { date: now().date, title: 'One-on-one', scope: 'work', tags: ['one-on-one'] })),
    'companion-apply-swap': () => companion.actions['companion-apply-swap'](modal?.row),
    'task-focus': toggleTaskFocus,
    'quick-task': quickTask,
    'shift-ack': acknowledgeShift,
    'work-updates-hide': hideWorkUpdates,
    'task-sticky': setTaskSticky,
    'task-pin': pinTask,
    'tasks-by-person': showTasksByPerson,
    'add-assigner': () => openDialog('add-assigner', 'Add an assigner name',
      '<form id="assigner-form" novalidate>' + input('name', 'Name', '', { extra: ' maxlength="120" data-initial-focus' }) + '</form>',
      btn('Cancel', 'close-dialog') + '<button type="submit" class="primary" form="assigner-form">Save name</button>'),
    'meal-log': openMealLog,
    'meal-record': recordMeal,
    'task-dock': ({ hide }) => {
      const open = !hide && taskDock.hidden;
      state.dock = open ? 'tasks' : '';
      renderDocks();
      (open ? $('#task-dock-add') : $('.toolbar-more summary')).focus({ preventScroll: true });
    },
    'sticky-dock': ({ hide }) => {
      const open = !hide && stickyDock.hidden;
      state.dock = open ? 'stickies' : '';
      renderDocks();
      (open ? $('#sticky-dock-add') : $('.toolbar-more summary')).focus({ preventScroll: true });
    },
    navigate: async (data) => {
      if (modal?.kind === 'detail') closeDialog(true);
      if (data.item && state.taskFocus) { state.taskFocus = ''; focusOrigin = null; }
      if (data.view === 'dayplan') planTools.show(data.sub || 'day');
      if (data.view === 'highlights') highlights.show(D.parseDate(data.date) || currentDutyDay(), data.shift);
      if (data.view === 'stickies') {
        if (!data.date) state.stickyDutyDate = '';
        state.stickies = data.sub || 'today';
      }
      if (data.view === 'tasks') {
        state.tasks = 'list';
        state.taskCollection = data.sub || 'week';
        if (['all', 'task', 'sticky'].includes(data.kind)) state.taskKind = data.kind;
        if (data.item) {
          for (const key of ['scope', 'taskStatus', 'taskArea', 'taskPriority', 'taskShift', 'taskQuery', 'taskWindow', 'taskAssignment', 'taskHeading']) state[key] = '';
          const row = D.byId(db.entries, data.item);
          state.taskKind = row && routineTask(row) ? 'sticky' : 'all';
        }
      }
      if (['goals', 'templates'].includes(data.sub)) state.planner = data.sub;
      if (data.sub === 'handover') state.phase = 'handover';
      if (data.view === 'registers' && ['followup', 'mwr-planned', 'mwr-raised'].includes(data.sub)) state.register = data.sub;
      if (data.view === 'assignments') state.portfolioId = '';
      await navigate(data.view, data.date);
      if (!data.item || state.view !== data.view) return;
      const key = { stickies: 'data-sticky-id', tasks: 'data-taskcard', dayplan: 'data-day-entry' }[data.view];
      if (!key) return;
      const row = $$('[' + key + ']', main).find(item => D.same(item.getAttribute(key), data.item));
      row?.scrollIntoView({ block: 'nearest' });
      row?.querySelector('.row-title, summary')?.focus({ preventScroll: true });
    },
    menu: ({ tools } = {}) => {
      menu();
      if (tools) $('#navigation details').open = true;
    },
    tab: data => switchTab(data.key, data.value),
    'date-step': async data => {
      const direction = Number(data.direction);
      const step = dateStep();
      const day = step === 'month' ? D.addMonths(state.date, direction) : D.addDays(state.date, direction * (step === 'week' ? 7 : 1));
      await selectViewDate(day);
      $('[data-action="date-step"][data-direction="' + direction + '"]', main)?.focus();
    },
    'date-today': async () => {
      await selectViewDate(dutyViews.has(state.view) || state.view === 'highlights' ? currentDutyDay() : now().date, true);
      $('[data-action="date-today"]', main)?.focus();
    },
    'planner-day': data => { state.date = data.date; state.planner = 'day'; render(); main.focus(); },
    jump: data => {
      const target = document.getElementById(data.id);
      if (!target) return;
      const details = target.closest('details');
      if (details) details.open = true;
      target.scrollIntoView({ block: 'start' });
    },
    add: data => {
      if (blocked) return;
      if (!Object.hasOwn(D.TYPES, data.type)) return chooseEntry();
      const attrs = {};
      for (const key of ['date', 'dutyDate', 'dutyShift']) if (data[key]) attrs[key] = data[key];
      if (data.assignment && Object.hasOwn(D.ASSIGNERS, data.assignment)) Object.assign(attrs, { assignment: data.assignment, scope: 'work' });
      if (data.assignedBy) Object.assign(attrs, { assignedBy: data.assignedBy, scope: 'work' });
      if (data.portfolioId) {
        if (!P.active(db, data.portfolioId)) throw new Error('This assignment is no longer available.');
        Object.assign(attrs, { portfolioId: data.portfolioId, scope: 'work' });
      }
      editEntry(blankEntry(data.type, attrs));
    },
    'entry-view': data => entryDetail(fetchRow(data.id)),
    'entry-edit': data => editEntry(fetchRow(data.id)),
    'entry-save': data => busyDialog(() => saveEntry(data.draft === 'yes')),
    'convert-note': data => convertNote(data.id),
    'linked-task': data => {
      const row = fetchRow(data.id);
      if (!row) return;
      editEntry(blankEntry('task', { date: row.date, scope: row.scope, links: [row.id], notebookId: row.notebookId }));
    },
    reschedule: data => reschedule(fetchRow(data.id)),
    'reschedule-step': ({ direction }) => {
      const field = $('#reschedule-form [name="date"]');
      const date = D.parseDate(field.value) || modal.row.date;
      field.value = dated(D.addDays(date, Number(direction)));
      field.dispatchEvent(new Event('change', { bubbles: true }));
    },
    'task-options': taskOptions,
    'task-status': async (data, button) => {
      const fromOptions = modal?.kind === 'task-options';
      if (!fromOptions && !button?.closest('[data-taskcard]')) return taskStatus(data.id, data.status);
      await taskStatus(data.id, data.status);
      if (fromOptions && modal?.kind === 'task-options') closeDialog(true);
      const card = $$('[data-taskcard]', main).find(node => D.same(node.dataset.taskcard, data.id));
      $('[data-action="' + (fromOptions ? 'task-options' : 'task-status') + '"]', card || main)?.focus({ preventScroll: true });
    },
    'task-move': data => {
      if (modal?.kind === 'task-options') closeDialog(true);
      return taskOrder(data.id, data.direction);
    },
    'task-clear': () => {
      for (const key of ['taskStatus', 'taskArea', 'taskPriority', 'taskShift', 'taskQuery', 'taskWindow', 'taskAssignment', 'taskHeading']) state[key] = '';
      render();
    },
    drag: () => toast('Drag the handle or choose Move up or down in Task actions.'),
    'toggle-focus': async data => {
      await commit(stateData => guardedEntry(stateData, data.id, row => {
        row.focus = !row.focus;
        row.editToken = D.uid();
        row.updatedAt = D.stamp();
      }), 'Today’s priorities updated.');
      entryDetail(fetchRow(data.id));
    },
    'subtask-add': () => {
      const box = $('[data-subtasks]', dialog);
      const index = Math.max(-1, ...$$('[data-subtask]', box).map(row => Number(row.dataset.subtask))) + 1;
      box.insertAdjacentHTML('beforeend', subtaskRow({}, index));
      $('[data-subtask="' + index + '"] [name="subTitle"]', box).focus();
      modal.dirty = true;
    },
    'subtask-remove': (_, button) => { button.closest('[data-subtask]').remove(); modal.dirty = true; },
    'delete-entry': data => ask('Move entry to Deleted items?', 'You can recover it in Settings & Backups.', 'Move to Deleted items',
      () => removeRecord('entries', data.id)),
    'report-delete': data => ask('Move report to Deleted items?', 'The report and its versions can be recovered in Settings & Backups.', 'Move to Deleted items',
      () => removeRecord('reports', data.id)),
    'aux-delete': data => ask('Move record to Deleted items?', 'Existing entries keep their links to this record.', 'Move to Deleted items',
      () => removeRecord(data.kind, data.id)),
    recover: data => recover(data.collection, data.id),
    attachment: async data => {
      const row = L(fetchRow(data.id)?.attachments)[Number(data.index)];
      if (row) download(await Z.readAttachment(row), row.name);
    },
    'report-attachment': async data => {
      const row = L(D.byId(db.reports, data.id)?.attachments)[Number(data.index)];
      if (row) download(await Z.readAttachment(row), row.name);
    },
    'duty-edit': data => dutyEdit(data.date || state.date),
    'duty-swap': () => dutyEdit(state.date, true),
    'roster-add': rosterAdd,
    'roster-row': () => {
      const rows = $('#roster-days');
      const last = $$('[name="rosterDate"]', rows).at(-1);
      if (rows.childElementCount >= 62) throw new Error('Save this group of shifts before adding more dates.');
      const date = D.parseDate(last?.value);
      rows.insertAdjacentHTML('beforeend', rosterRow(date ? D.addDays(date, 1) : ''));
      $('[name="rosterDate"]', rows.lastElementChild).focus();
      modal.dirty = true;
    },
    'roster-remove': (_, button) => {
      const row = button.closest('.roster-row');
      if (row.parentElement.childElementCount > 1) row.remove();
      else {
        $('[name="rosterDate"]', row).value = '';
        $('[data-date-picker]', row).value = '';
        $('[name="rosterShift"]', row).value = '';
      }
      modal.dirty = true;
    },
    'handover-edit': data => handoverForm(data.date || state.date, data.shift || ''),
    'handover-copy': data => copyHandover(data),
    'handover-delete': data => ask('Remove this handover?', 'The linked tasks will remain in your diary.', 'Move to Deleted items',
      () => removeRecord('handovers', data.id)),
    'report-new': data => {
      const date = data.date || state.date;
      const shift = data.shift;
      if (D.SHIFT[shift]?.start) {
        const existing = db.reports.find(row => !row.deletedAt && row.date === date && row.shift === shift);
        if (existing) return reportView(existing);
        return reportEdit({ id: D.uid(), date, shift, sections: {}, sources: [], versions: [] });
      }
      openDialog('report-choice', 'Choose a duty', '<p>' + E(dated(date)) + '</p><div class="actions">' +
        D.WORKING_SHIFTS.map(label => btn(label, 'report-new', { date, shift: label })).join('') + '</div>',
        btn('Cancel', 'close-dialog'));
    },
    'report-view': data => reportView(D.byId(db.reports, data.id)),
    'report-edit': data => reportEdit(D.byId(db.reports, data.id)),
    'report-save': data => busyDialog(async () => {
      const result = await saveReport(data.ready === 'yes');
      reportView(result.row);
    }),
    'report-insert': () => {
      const form = $('#report-form');
      const values = new FormData(form);
      const ids = values.getAll('reportSource');
      if (!ids.length) return toast('Select one or more entries first.');
      const section = formValue(values, 'targetSection');
      const content = readReport();
      let count = 0;
      for (const id of ids) if (D.appendReportSource(content, section, D.byId(db.entries, id))) count += 1;
      const field = form.elements.namedItem(section);
      N.appendText(field, (content.sections[section] || '').slice(field.value.length));
      $$('[name="reportSource"]', form).forEach(box => { box.checked = false; });
      if (count) {
        modal.sources = content.sources;
        modal.dirty = true;
      }
      toast(count ? count + (count === 1 ? ' entry added to the draft.' : ' entries added to the draft.') :
        'The selected text is already in this draft.');
    },
    'report-version': data => {
      const report = D.byId(db.reports, data.id);
      const item = L(report?.versions)[Number(data.index)];
      if (!item) return;
      const old = { ...report, ...item, sections: item.sections || {} };
      openDialog('version', 'Earlier report version', '<p class="muted">' + E(D.formatStamp(item.updatedAt || item.at)) +
        '</p>' + reportPresentation({ ...old, noteStyles: item.noteStyles }),
        btn('Back to report', 'report-view', { id: report.id }) +
        btn('Use as draft', 'report-use-version', { id: report.id, index: data.index }, { cls: 'primary' }));
    },
    'report-use-version': data => {
      const report = D.byId(db.reports, data.id);
      const version = L(report?.versions)[Number(data.index)];
      if (version) reportEdit(report, version);
    },
    'report-copy': data => copyText(D.reportText(D.byId(db.reports, data.id), data.mode === 'verbal'), 'Copy report'),
    'report-text': data => {
      const report = D.byId(db.reports, data.id);
      download(D.reportText(report) + '\n\n' + D.reportText(report, true), 'Shift_Report_' + dated(report.date) + '_' + report.shift + '.txt', 'text/plain;charset=utf-8');
    },
    'report-print': data => {
      const row = D.byId(db.reports, data.id);
      print('CAN Plant Shift Report', reportPresentation(row, true));
    },
    'print-day': data => printDay(data.date),
    'print-review': () => printReview(),
    'print-all': () => printAll(),
    'search-clear': () => { state.search = {}; state.searched = false; state.searchError = ''; render(); $('[name="words"]', main)?.focus(); },
    'aux-edit': data => auxEdit(data.kind, data.id),
    'checklist-run': data => commit(draft => {
      const template = D.byId(draft.templates, data.id);
      if (!template || template.deletedAt) throw new Error('This checklist template is no longer available.');
      const date = D.parseDate(data.date) || state.date;
      const duty = draft.roster.find(row => row.date === date)?.shift || '';
      if (!routineMatches(template, duty)) throw new Error('Choose a roster date that matches this routine.');
      const shift = template.frequency === 'day' ? '' : duty;
      if (draft.checklists.some(row => !row.deletedAt && D.same(row.templateId, template.id) && row.date === date && row.shift === shift)) {
        throw new Error('This checklist is already active for this date and duty.');
      }
      draft.checklists.push({ id: D.uid(), templateId: template.id, date, shift, name: template.name, scope: template.scope,
        items: L(template.items).map(item => ({ ...item, done: false })), createdAt: D.stamp() });
    }, 'Checklist started.'),
    'goal-progress': data => {
      const row = D.byId(db.goals, data.id);
      if (!row || row.deletedAt) return;
      openDialog('goal-progress', 'Log progress · ' + row.name, '<form id="progress-form" class="form-grid" novalidate>' +
        dateInput('date', 'Date', now().date) + input('amount', 'Amount to add', 0, { type: 'number', extra: ' step="any"' }) +
        N.field('note', 'Progress or review note', '') + '</form>', btn('Cancel', 'close-dialog') +
        '<button type="submit" form="progress-form" class="primary">Save progress</button>', { row });
    },
    reminders: () => remindersDialog(),
    'roster-quiet-exception': async ({ id }) => {
      const fromReminders = modal?.kind === 'reminders';
      await commit(data => guardedEntry(data, id, row => {
        if (row.scope !== 'work' || !D.open(row)) return false;
        row.allowRosterReminder = !row.allowRosterReminder;
        row.updatedAt = D.stamp();
        row.editToken = D.uid();
        return row.allowRosterReminder ? 'Allowed during roster quiet.' : 'Roster quiet exception removed.';
      }), result => result);
      if (fromReminders) remindersDialog();
      else if (modal?.kind === 'detail') entryDetail(fetchRow(id));
    },
    'reminder-update': async data => {
      await commit(draft => {
        const item = D.reminderRows(draft).find(row => row.key === data.key);
        if (!item) return false;
        draft.reminders[data.key] = data.snooze ? { snooze: Date.now() + Number(data.snooze) * 60000 } : { ack: D.stamp() };
      }, data.snooze ? 'Reminder snoozed.' : 'Reminder acknowledged.', false);
      remindersDialog();
    },
    backup: async () => {
      await Z.refresh();
      const payload = await Z.backup(Z.read());
      download(JSON.stringify(payload, null, 2), 'My_Shift_and_Life_Backup_' + dated(now().date) + '.json', 'application/json');
      toast(payload.missing.length ? 'Backup downloaded with a list of legacy files whose bytes are missing.' : 'Backup downloaded with attachment files.');
    },
    excel: () => {
      download(D.workbook(db), 'My_Shift_and_Life_' + dated(now().date) + '.xlsx',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      toast('Excel workbook downloaded.');
    },
    'restore-choose': () => $('#restore-file')?.click(),
    'restore-pair': () => $('#pair-archive')?.click(),
    'restore-apply': data => {
      const apply = () => busyDialog(async () => {
      const { prepared, rev } = modal;
      db = await Z.restore(prepared, rev, data.mode);
      undo = null;
      await commit(draft => {
        const scheduled = D.generateWork(draft);
        return D.syncShiftStickies(draft, [stickyDutyDay()]) || scheduled > 0;
      }, null, false, false);
      render();
      toast(data.mode === 'attachments' ? 'Matching attachment files restored.' :
        data.mode === 'merge' ? 'Backup merged.' : 'Diary replaced with the backup.');
      });
      if (data.mode === 'replace' && db.rev) {
        return ask('Replace this diary?', 'The current records will be kept in a local checkpoint.', 'Replace with backup', apply);
      }
      return apply();
    },
    'copy-save': async () => {
      await Z.refresh();
      await Z.saveCopy(Z.read(), 'Diary copy');
      render();
      toast('Saved a local copy.');
    },
    'copy-export': async data => download(await Z.readCopy(data.id), 'My_Shift_and_Life_Saved_Copy.json'),
    'copy-restore': async data => backupPreview(await Z.readCopy(data.id)),
    'copy-delete': data => ask('Delete this saved copy?', 'The open diary stays available.', 'Delete copy', async () => {
      await Z.deleteCopy(data.id);
      render();
      toast('Saved copy deleted.');
    }),
    'sample-add': () => addSamples(),
    'sample-remove': () => commit(draft => {
      const samples = draft.entries.filter(row => row.sample && !row.deletedAt);
      if (!samples.length) return false;
      for (const row of samples) {
        row.deletedAt = D.stamp();
        row.editToken = D.uid();
      }
    }, 'Sample entries moved to Deleted items.'),
    install: async () => {
      if (!installPrompt) return;
      const prompt = installPrompt;
      installPrompt = null;
      await prompt.prompt();
      const choice = await prompt.userChoice;
      render();
      toast(choice.outcome === 'accepted' ? 'Installation accepted.' : 'You can install later from your browser.');
    },
    'app-update': () => {
      if (!waitingWorker) return;
      ask('Reload the diary?', 'Save any open edits before loading the new app files.', 'Reload', () => {
        reloadingApp = true;
        waitingWorker.postMessage('activate-update');
      });
    },
    persist: async () => toast(await navigator.storage.persist()
      ? 'The browser granted persistent storage for this address.' : 'This browser keeps diary data under its normal storage policy.'),
    'laptop-file-setup': () => D.deviceDB.setupFile?.(),
    'raw-export': async () => {
      const raw = await D.deviceDB.read('records', D.deviceDB.MAIN).catch(() => null);
      const previous = raw ? JSON.stringify(raw) : localStorage.getItem(D.APP + ':v5');
      if (!previous) throw new Error('The browser did not provide a saved diary to download.');
      download(previous, 'My_Shift_and_Life_Raw_Data.json', 'application/json');
    },
    undo: async () => {
      if (!undo) return;
      const previous = undo;
      const result = await Z.transact(data => {
        for (const key of Object.keys(data)) delete data[key];
        Object.assign(data, previous.data);
      }, previous.rev);
      db = result.data;
      undo = null;
      render();
      toast('Last change undone.');
    },
    'dismiss-toast': () => { $('#toast').hidden = true; },
    'close-dialog': () => closeDialog(),
    'confirm-no': () => { confirmCallback = null; confirmBox.close(); },
    'confirm-yes': async () => {
      const callback = confirmCallback;
      confirmCallback = null;
      confirmBox.close();
      if (callback) await callback();
    }
  };

  async function saveDuty(form) {
    const values = new FormData(form);
    const date = readDate(values, 'date', 'the duty starting date', true);
    const reason = D.tidy(values.get('reason'));
    const swap = modal.kind === 'swap';
    const otherDate = swap ? readDate(values, 'otherDate', 'the second date', true) : '';
    const rev = modal.rev;
    const result = await Z.transact(data => {
      if (swap) {
        const first = data.roster.find(row => row.date === date)?.noteStyles;
        const second = data.roster.find(row => row.date === otherDate)?.noteStyles;
        D.swapDuty(data, date, otherDate, reason);
        data.roster.find(row => row.date === date).noteStyles = second;
        data.roster.find(row => row.date === otherDate).noteStyles = first;
      } else {
        const previous = data.roster.find(row => row.date === date);
        const styles = N.capture(values, previous?.noteStyles);
        D.updateDuty(data, date, formValue(values, 'shift'), D.tidy(values.get('group')), formValue(values, 'note'), reason);
        const duty = data.roster.find(row => row.date === date);
        if (duty) duty.noteStyles = styles;
      }
      D.syncShiftStickies(data, [date, otherDate, currentDutyDay(data)]);
    }, rev);
    db = result.data;
    undo = { data: result.before, rev: result.data.rev };
    state.date = date;
    state.stickyDutyDate = date === currentDutyDay() ? '' : date;
    render();
    toast(swap ? 'Duty swap recorded.' : 'Duty saved.', true);
  }

  async function savePreferences(form) {
    const values = new FormData(form);
    const start = readTime(values, 'quietStart', 'quiet hours start');
    const end = readTime(values, 'quietEnd', 'quiet hours end');
    if (Boolean(start) !== Boolean(end) || (start && start === end)) throw new Error('Enter two different times for quiet hours or leave both empty.');
    const days = Number(values.get('soonDays'));
    if (!Number.isInteger(days) || days < 1 || days > 30) throw new Error('Choose between 1 and 30 days for Due soon.');
    const settings = { theme: formValue(values, 'theme'), palette: formValue(values, 'palette'),
      diaryFont: N.font(formValue(values, 'diaryFont')) || 'system', quietStart: start, quietEnd: end,
      reminderTime: readTime(values, 'reminderTime', 'the default reminder time', true), soonDays: days,
      quietByRoster: values.has('quietByRoster'), quietRosterCritical: values.has('quietRosterCritical'),
      notifications: values.has('notifications') };
    let permitted = false;
    if (settings.notifications && 'Notification' in window) {
      try { permitted = Notification.permission === 'granted' || await Notification.requestPermission() === 'granted'; } catch { /* The in-app reminders still run. */ }
    }
    const requested = settings.notifications;
    settings.notifications = permitted;
    await commit(draft => {
      if (settings.quietByRoster && !draft.settings.quietByRoster) settings.quietRosterSince = Date.now();
      draft.settings = { ...draft.settings, ...settings };
    },
      requested && !permitted ? 'Settings saved. Use the in-app reminders because browser alerts are unavailable.' : 'Settings saved.');
  }

  async function applyReschedule(form) {
    const { row } = modal;
    const values = new FormData(form);
    const date = readDate(values, 'date', 'the planned date', true);
    const dueDate = readDate(values, 'dueDate', 'the due date');
    const dueTime = readTime(values, 'dueTime', 'the due time');
    if (!dueDate && dueTime) throw new Error('Add a due date for this due time.');
    await commit(data => guardedEntry(data, row.id, item => {
      if (item.editToken !== row.editToken) throw new Error('This task changed in another tab. Copy your reschedule details before reopening it.');
      const at = D.stamp();
      const changes = changedFields(item, { ...item, date, dueDate, dueTime });
      item.originalDate ||= item.date;
      item.originalDueDate ||= item.dueDate || dueDate;
      if (!changes.length) return false;
      Object.assign(item, W.taskPlanChange(data, item, date), { date, dueDate, dueTime, updatedAt: at, editToken: D.uid() });
      item.history = [...L(item.history), { at, action: 'Rescheduled', reason: formValue(values, 'reason'), changes }];
    }), 'Task rescheduled.');
  }

  async function saveProgress(form) {
    const values = new FormData(form);
    const date = readDate(values, 'date', 'the progress date', true);
    const amount = Number(values.get('amount'));
    const text = formValue(values, 'note');
    const noteStyles = N.capture(values);
    if (!Number.isFinite(amount) || (!amount && !D.tidy(text) && !noteStyles)) throw new Error('Enter an amount or a progress note.');
    const id = modal.row.id;
    await commit(data => {
      const row = D.byId(data.goals, id);
      if (!row || row.deletedAt) throw new Error('This goal is no longer available.');
      row.progress = [...L(row.progress), { id: D.uid(), date, amount, note: text, noteStyles, at: D.stamp() }];
    }, 'Progress saved.');
  }

  async function submit(form) {
    if (form.id === 'quick-task-form') return busyDialog(() => saveQuickTask(form, modal?.row));
    if (form.id === 'work-progress-form') return busyDialog(() => progressUI.save(form, modal?.row));
    if (form.id === 'work-batch-form') return busyDialog(() => hierarchyUI.saveBatch(form, modal?.row));
    if (form.id === 'shift-highlights-form') return busyDialog(() => highlights.save(form, modal?.row));
    if (Object.hasOwn(companion.forms, form.id)) return busyDialog(() => companion.forms[form.id](form, modal?.row));
    if (Object.hasOwn(planTools.forms, form.id)) {
      const save = () => planTools.forms[form.id](form, modal?.row);
      return dialog.contains(form) ? busyDialog(save) : save();
    }
    if (Object.hasOwn(portfolioTools.forms, form.id)) return busyDialog(() => portfolioTools.forms[form.id](form, modal?.row));
    if (form.id === 'portfolio-filter-form') return portfolioTools.filter(form);
    if (Object.hasOwn(dayTools.forms, form.id)) {
      const save = () => dayTools.forms[form.id](form, modal?.row);
      return dialog.contains(form) ? busyDialog(save) : save();
    }
    if (form.id === 'entry-form') return busyDialog(() => saveEntry());
    if (form.id === 'aux-form') return busyDialog(() => saveAux());
    if (form.id === 'duty-form') return busyDialog(() => saveDuty(form));
    if (form.id === 'roster-form') return busyDialog(() => saveRoster(form));
    if (form.id === 'assigner-form') return busyDialog(() => saveAssigner(form));
    if (form.id === 'handover-form') return busyDialog(() => saveHandover(form));
    if (form.id === 'report-form') return actions['report-save']({ ready: 'yes' });
    if (form.id === 'reschedule-form') return busyDialog(() => applyReschedule(form));
    if (form.id === 'progress-form') return busyDialog(() => saveProgress(form));
    if (form.id === 'settings-form') return savePreferences(form);
    if (form.id === 'task-filter-form') {
      const values = new FormData(form);
      for (const key of ['taskStatus', 'taskArea', 'taskPriority', 'taskShift', 'taskQuery', 'taskWindow', 'taskAssignment', 'taskHeading']) {
        state[key] = D.tidy(values.get(key));
      }
      return render();
    }
    if (form.id === 'money-filter-form') return finance.filter(form);
    if (Object.hasOwn(finance.forms, form.id)) return busyDialog(() => finance.forms[form.id](form, modal?.row));
    if (form.id === 'money-form' || form.id === 'budget-form') return busyDialog(() => finance.save(form, modal.row, form.id === 'budget-form'));
    if (form.id === 'search-form') {
      const values = new FormData(form);
      state.searchError = '';
      state.search = Object.fromEntries([...values].filter(([key]) => key !== 'from' && key !== 'to').map(([key, value]) => [key, D.tidy(value)]));
      try {
        state.search.from = readDate(values, 'from', 'the from date');
        state.search.to = readDate(values, 'to', 'the to date');
        if (state.search.from && state.search.to && state.search.from > state.search.to) throw new Error('The end date comes before the start date.');
        state.searched = true;
      } catch (error) {
        state.searchError = error.message;
        state.search.from = formValue(values, 'from');
        state.search.to = formValue(values, 'to');
        state.searched = false;
      }
      render();
      $('[name="words"]', main)?.focus();
    }
  }

  document.addEventListener('click', event => {
    const button = event.target.closest('[data-action]');
    const menu = $('.toolbar-more');
    if (menu?.open && (!menu.contains(event.target) || button && !button.disabled)) menu.open = false;
    if (!button || button.disabled || (button.tagName === 'A' && (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey))) return;
    const action = actions[button.dataset.action];
    if (!action) return;
    event.preventDefault();
    if (button.dataset.action === 'drag' && dragEnded) return;
    Promise.resolve().then(() => action(button.dataset, button)).catch(showError);
  });

  document.addEventListener('submit', event => {
    event.preventDefault();
    submit(event.target).catch(showError);
  });

  dialog.addEventListener('cancel', event => { event.preventDefault(); closeDialog(); });
  confirmBox.addEventListener('cancel', () => { confirmCallback = null; });

  async function changed(control) {
    if (highlights.change(control)) return;
    const planned = planTools.change(control);
    if (planned) return planned;
    if (dayTools.change(control)) return;
    if (control.name === 'assignedBy' && control.form?.elements.assignment) {
      const role = W.personRole(control.value);
      if (role) control.form.elements.assignment.value = role;
      return;
    }
    if (control.matches('[data-date-picker]')) {
      const text = $('[data-date-field]', control.closest('.date-control'));
      text.value = dated(control.value);
      if (text.hasAttribute('data-navigate-date')) return chooseDate(text);
      return;
    }
    if (control.matches('[data-date-field]')) {
      if (control.hasAttribute('data-navigate-date')) return chooseDate(control);
      else if (D.parseDate(control.value)) {
        $('[data-date-picker]', control.closest('.date-control')).value = D.parseDate(control.value);
        control.value = dated(control.value);
      }
      return;
    }
    if (control.dataset.settingTab) return switchTab(control.dataset.settingTab, control.value);
    if (control.id === 'restore-file') {
      const files = [...control.files];
      control.value = '';
      if (!files.length) return;
      const json = files.filter(file => /\.json$/i.test(file.name));
      const zip = files.filter(file => /\.zip$/i.test(file.name));
      if (files.length > 2 || json.length > 1 || zip.length > 1 || files.length !== json.length + zip.length) {
        throw new Error('Choose one JSON backup and, if needed, one Task Desk attachment ZIP.');
      }
      await backupPreview(json[0], zip[0]);
      return;
    }
    if (control.id === 'pair-archive') {
      const zip = control.files[0];
      control.value = '';
      if (zip && modal?.file) await backupPreview(modal.file, zip);
      return;
    }
    if (control.matches('[data-entry-status]')) {
      const closure = $('[data-closure]', dialog);
      if (closure) closure.hidden = !['closed', 'done'].includes(control.value);
      return;
    }
    if (control.dataset.checkRun) {
      const index = Number(control.dataset.index);
      const checked = control.checked;
      await commit(data => {
        const run = D.byId(data.checklists, control.dataset.checkRun);
        if (!run || run.deletedAt || !run.items[index]) return false;
        Object.assign(run.items[index], { done: checked, checkedAt: checked ? D.stamp() : '' });
      });
      $$('[data-check-run]', main).find(node => node.dataset.checkRun === control.dataset.checkRun &&
        node.dataset.index === control.dataset.index)?.focus({ preventScroll: true });
    }
    if (control.dataset.taskSub) {
      const prior = L(fetchRow(control.dataset.taskSub)?.subtasks)[Number(control.dataset.index)];
      const checked = control.checked;
      await commit(data => guardedEntry(data, control.dataset.taskSub, row => {
        const item = D.byId(L(row.subtasks), prior?.id);
        if (!item) return false;
        item.done = checked;
        row.updatedAt = D.stamp();
        row.editToken = D.uid();
        row.history = [...L(row.history), { at: row.updatedAt, action: (checked ? 'Completed subtask · ' : 'Reopened subtask · ') + item.title }];
      }));
    }
  }

  async function chooseDate(control) {
    const date = D.parseDate(control.value);
    if (!date) {
      toast('Enter a date as dd-mmm-yyyy.');
      control.value = dated(state.date);
      return;
    }
    await selectViewDate(date);
    $('[data-navigate-date]', main)?.focus({ preventScroll: true });
  }

  document.addEventListener('change', event => {
    const target = event.target;
    if (target.closest('.clock-picker')) return;
    if (dialog.contains(target) && target.closest('form') && modal) modal.dirty = true;
    changed(target).catch(error => { if (target.type === 'checkbox') target.checked = !target.checked; showError(error); });
  });

  dialog.addEventListener('input', event => {
    if (event.target.closest('.clock-picker')) return;
    if (event.target.matches('[data-link-filter]')) {
      const term = event.target.value.toLowerCase();
      for (const row of $$('[data-link-row]', dialog)) row.hidden = !row.textContent.toLowerCase().includes(term);
      return;
    }
    if (event.target.closest('form') && modal) modal.dirty = true;
  });

  document.addEventListener('keydown', event => {
    const field = event.target.closest('input, textarea, select, [contenteditable]');
    if (event.key === 'Enter' && event.target.matches('[data-navigate-date]')) {
      event.preventDefault();
      chooseDate(event.target).catch(showError);
    } else if (event.key === 'Escape' && state.taskFocus && !dialog.open && !confirmBox.open) {
      event.preventDefault();
      toggleTaskFocus().catch(showError);
    } else if (event.key === 'Escape' && document.body.classList.contains('menu-open') && !dialog.open) {
      menu(false);
      $('#menu').focus();
    } else if (event.key === '/' && !field && !state.taskFocus && !dialog.open && !confirmBox.open) {
      event.preventDefault();
      navigate('search').catch(showError);
    }
  });

  let drag = null;
  let dragEnded = false;

  function stickyDropTarget(element, x, y) {
    const card = element?.closest('[data-sticky-id]');
    if (!card || card === drag.card || card.parentElement !== drag.card.parentElement) return null;
    const rect = card.getBoundingClientRect();
    const sideBySide = [card.previousElementSibling, card.nextElementSibling].some(sibling =>
      sibling?.matches('[data-sticky-id]') && Math.abs(sibling.offsetTop - card.offsetTop) < 5);
    const after = sideBySide ? x >= rect.left + rect.width / 2 : y >= rect.top + rect.height / 2;
    return { node: card, other: card.dataset.stickyId, direction: after ? 1 : -1,
      marker: (sideBySide ? 'horizontal-' : 'vertical-') + (after ? 'after' : 'before') };
  }

  function dropTarget(x, y) {
    const element = document.elementFromPoint(x, y);
    if (drag.sticky) return stickyDropTarget(element, x, y);
    const card = element?.closest('[data-taskcard]');
    const lane = element?.closest('[data-lane]');
    if (card && card.dataset.taskcard !== drag.id) {
      if (!lane && card.closest('[data-task-list]') !== drag.card.closest('[data-task-list]')) return null;
      const rect = card.getBoundingClientRect();
      if (y > rect.top + rect.height / 2) {
        const next = card.nextElementSibling;
        return { node: next?.matches('[data-taskcard]') ? next : lane || card, status: lane ? card.dataset.status : '',
          before: next?.dataset.taskcard || null };
      }
      return { node: card, status: lane ? card.dataset.status : '', before: card.dataset.taskcard };
    }
    if (lane && !card) return { node: lane, status: lane.dataset.lane, before: null };
    return null;
  }

  function clearDrop(target) {
    if (!target) return;
    target.node.classList.remove('drop-target');
    delete target.node.dataset.stickyDrop;
  }

  function markDrop() {
    if (!drag?.moved) return;
    clearDrop(drag.target);
    drag.target = dropTarget(drag.x, drag.y);
    if (drag.target?.marker) drag.target.node.dataset.stickyDrop = drag.target.marker;
    else drag.target?.node.classList.add('drop-target');
  }

  function autoScroll() {
    if (!drag?.moved) return;
    const board = $('[data-board]', main);
    if (board) {
      const rect = board.getBoundingClientRect();
      if (drag.x > rect.right - 36) board.scrollLeft += 11;
      else if (drag.x < rect.left + 36) board.scrollLeft -= 11;
    }
    const dock = drag.card.closest('#sticky-dock-list');
    const bounds = dock?.getBoundingClientRect();
    if (drag.y > (bounds?.bottom ?? innerHeight) - 40) (dock || window).scrollBy(0, 10);
    else if (drag.y < (bounds?.top ?? 45) + 40) (dock || window).scrollBy(0, -10);
    markDrop();
    drag.frame = requestAnimationFrame(autoScroll);
  }

  document.addEventListener('pointerdown', event => {
    const grip = event.target.closest('[data-action="drag"], [data-action="sticky-drag"]');
    if (!grip || grip.disabled || event.button !== 0 || drag) return;
    const sticky = grip.dataset.action === 'sticky-drag';
    drag = { id: grip.dataset.id, pointer: event.pointerId, grip, sticky, card: grip.closest(sticky ? '[data-sticky-id]' : '[data-taskcard]'),
      x0: event.clientX, y0: event.clientY, x: event.clientX, y: event.clientY };
    grip.setPointerCapture(event.pointerId);
  });

  document.addEventListener('pointermove', event => {
    if (!drag || drag.pointer !== event.pointerId) return;
    drag.x = event.clientX;
    drag.y = event.clientY;
    if (!drag.moved && Math.hypot(drag.x - drag.x0, drag.y - drag.y0) >= 8) {
      drag.moved = true;
      drag.card.classList.add('dragging');
      drag.frame = requestAnimationFrame(autoScroll);
    }
    markDrop();
  });

  function finishDrag(event) {
    if (!drag || drag.pointer !== event.pointerId) return;
    const { target, moved, card, frame, id, sticky, grip } = drag;
    card.classList.remove('dragging');
    clearDrop(target);
    if (frame) cancelAnimationFrame(frame);
    drag = null;
    if (moved) {
      dragEnded = true;
      setTimeout(() => { dragEnded = false; }, 50);
      if (!target || event.type !== 'pointerup' || !card.isConnected) return;
      const save = sticky ? dayTools.actions['sticky-move']({ id, other: target.other, direction: target.direction }, grip) :
        taskOrder(id, '', target);
      save.catch(showError);
    }
  }
  document.addEventListener('pointerup', finishDrag);
  document.addEventListener('pointercancel', finishDrag);

  let currentDate = now().date;
  let currentMinute = '';
  let lastDutyDay = '';
  let lastTickMinute = '';
  async function tick() {
    const local = now();
    const minute = local.date + ' ' + local.time;
    if (blocked || minute === lastTickMinute) return;
    lastTickMinute = minute;
    const dutyDay = currentDutyDay();
    const newDuty = dutyDay !== lastDutyDay;
    const dayChanged = local.date !== currentDate;
    if (dayChanged || newDuty) {
      currentDate = local.date;
      await commit(data => {
        const scheduled = D.generateRecurrence(data) + D.generateWork(data);
        return D.syncShiftStickies(data, [dutyDay]) || scheduled > 0;
      }, null, false, false);
      lastDutyDay = dutyDay;
    }
    const reminders = R.reminderState(db);
    const warnings = reminders.warnings;
    const warningChanged = warnings.size !== dutyAlerts.size || [...warnings].some(([id, alert]) => dutyAlerts.get(id)?.detail !== alert.detail);
    const editing = dialog.open || N.hasDraft(main) || drag || main.contains(document.activeElement) && !!document.activeElement.closest('form');
    const portfolioDateChanged = state.view === 'assignments' && state.portfolioDay !== local.date;
    const planChanged = state.view === 'dayplan' && planTools.isTimeline() && state.date === local.date && currentMinute !== local.time;
    const pendingChanged = state.view === 'dashboard' && state.summaryMode === 'pending' && currentMinute !== local.time &&
      (document.activeElement === main || !main.contains(document.activeElement));
    if (!editing && (warningChanged || pendingChanged || (newDuty || dayChanged && state.view === 'stickies') && !state.stickyDutyDate ||
        portfolioDateChanged || planChanged || state.view === 'today' && currentMinute !== local.time)) {
      currentMinute = local.time;
      render();
    } else {
      renderMealPopup(local);
      dutyAlerts = warnings;
      renderShiftAlarms(reminders.alarms);
      if (newDuty) renderDocks();
      updateReminders(reminders);
    }
  }

  function refreshView(data) {
    db = data;
    if (drag || (!dialog.open && (N.hasDraft(main) || (main.contains(document.activeElement) &&
        document.activeElement.matches('input, select, textarea, [contenteditable]'))))) updateReminders();
    else render();
  }

  window.addEventListener('hashchange', () => {
    const route = location.hash.slice(1);
    if (Object.hasOwn(NAV, route) && route !== state.view) navigate(route).catch(showError);
  });

  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault();
    installPrompt = event;
    if (state.view === 'settings' && !main.contains(document.activeElement)) render();
  });

  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', setTheme);

  async function boot() {
    $('#menu').innerHTML = svg('menu');
    focusToggle.insertAdjacentHTML('afterbegin', svg('focus'));
    stickyToggle.insertAdjacentHTML('afterbegin', svg('pin'));
    taskToggle.insertAdjacentHTML('afterbegin', svg('checklist'));
    $('#sticky-dock-close').innerHTML = svg('close');
    $('#task-dock-close').innerHTML = svg('close');
    $('#search-button').insertAdjacentHTML('afterbegin', svg('search'));
    $('#quick-add').insertAdjacentHTML('afterbegin', svg('plus'));
    const route = location.hash.slice(1);
    if (Object.hasOwn(NAV, route)) state.view = route;
    try {
      const message = await Z.start(refreshView) || D.deviceDB.startupMessage?.();
      db = Z.read();
      if (message) toast(message);
      await commit(data => {
        const repaired = D.hierarchy.reconcile(data);
        const scheduled = D.generateRecurrence(data) + D.generateWork(data);
        const added = S.addScreenshotTasks(data);
        return D.syncShiftStickies(data, [currentDutyDay(data)]) || repaired || added || scheduled > 0;
      }, null, false, false);
    } catch (error) {
      blocked = error.message;
    }
    opening = false;
    lastDutyDay = currentDutyDay();
    if (dutyViews.has(state.view) || state.view === 'highlights') state.date = lastDutyDay;
    render();
    if (navigator.serviceWorker && isSecureContext && location.protocol !== 'file:') {
      navigator.serviceWorker.addEventListener('controllerchange', () => { if (reloadingApp) location.reload(); });
      navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).then(reg => {
        const checkUpdate = () => {
          waitingWorker = reg.waiting;
          if (waitingWorker && state.view === 'settings' && !main.contains(document.activeElement)) render();
        };
        checkUpdate();
        reg.addEventListener('updatefound', () => {
          const worker = reg.installing;
          worker?.addEventListener('statechange', () => { if (worker.state === 'installed') checkUpdate(); });
        });
        return navigator.serviceWorker.ready;
      }).then(() => {
        offlineReady = true;
        if (state.view === 'settings' && !main.contains(document.activeElement)) render();
      }).catch(() => {});
    }
    setInterval(() => tick().catch(showError), 5000);
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden && !blocked) Z.syncView().then(tick).catch(showError);
    });
  }

  boot().catch(showError);
})(Diary);

});
