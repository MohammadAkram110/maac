/* Day Plan controls, the follow-up review, and the learning log. */
(function (D) {
  'use strict';

  D.createDayPlanUI = function (ui) {
    const { state, current, now, E, btn, chip, empty, note, page, panel, dateNav, select, input, textarea, check,
      dateInput, timeInput, readDate, readTime, formValue, openDialog, render, commit, remember } = ui;
    const P = D.dayPlan;
    const N = D.notebook;
    const date = D.formatDate;
    const views = { day: 'Daily timeline', plan: 'Two-day plan', week: 'Week', month: 'Month', lookahead: '30-day lookahead',
      follow: 'Follow-up & closure', personal: 'Personal windows', learning: 'Skills & courses', weekly: 'Weekly review',
      cycle: 'Roster cycle review', report: 'Time report' };
    const shifts = { '': 'No duty entered', ...Object.fromEntries(Object.keys(D.SHIFT).map(shift => [shift, shift])) };
    const cadences = ['One-off', 'Shift', 'Daily', 'Weekly', 'Fortnightly', 'Monthly', 'Quarterly', 'Yearly', 'On demand'];
    const reviewViews = { open: 'Open', waiting: 'Waiting', people: 'By person', done: 'Completed' };
    let mode = 'day';
    let reviewView = 'open';
    let frequency = '';
    const preview = new Map();
    const planner = D.createPlanningUI({ ...ui, number });
    const companion = ui.companion || D.createShiftCompanionUI(ui);
    const activity = D.createActivityTools(ui);
    const related = ui.related || (() => '');

    const short = (label, action, fields = {}) => btn(label, action, fields, { cls: 'small' });
    const options = (choices, selected, action, label) => '<div class="tabs" aria-label="' + E(label) + '">' +
      Object.entries(choices).map(([value, text]) => btn(text, action, { value }, { pressed: value === selected })).join('') + '</div>';
    const deadline = item => item ? item.label + ' ' + date(item.day) + (item.time ? ' ' + item.time : '') : '';
    const openEntry = (row, label = row.title) => row.forecast ? '<strong>' + E(label) + '</strong>' :
      btn(label, 'entry-view', { id: remember(row) }, { cls: 'row-title' });
    const time = instant => D.parts(instant).time;
    const selectedDates = () => [state.date, D.addDays(state.date, 1)];
    const endTime = (end, day) => {
      const local = D.parts(end);
      const next = D.addDays(day, 1);
      if (local.date === day) return local.time;
      if (local.date === next) return local.time === '00:00' ? '24:00' : local.time + ' next day';
      return local.time + ' ' + date(local.date);
    };

    function formDialog(id, title, fields, label, row = null, intro = '') {
      openDialog(id, title, intro + '<form id="' + id + '" class="form-grid" novalidate>' + fields + '</form>',
        btn('Cancel', 'close-dialog') + '<button class="primary" type="submit" form="' + id + '">' + E(label) + '</button>', { row });
    }

    function namedDay(day) {
      const today = now().date;
      return day === today ? 'Today' : day === D.addDays(today, 1) ? 'Tomorrow' : new Intl.DateTimeFormat('en-GB',
        { weekday: 'long', timeZone: D.ZONE }).format(D.instant(day, '12:00'));
    }

    function planControls(days) {
      const edited = days.some(day => preview.has(day.date));
      const fields = days.map(day => select('planDuty' + day.date, namedDay(day.date) + ' duty · ' + date(day.date), shifts,
        day.duty?.shift || '', ' data-plan-duty="' + E(day.date) + '"')).join('');
      const tools = edited ? '<div class="actions">' + short('Use saved roster', 'plan-reset') +
        btn('Save to roster', 'plan-save-roster', {}, { cls: 'small primary' }) + '</div>' : '';
      return '<div class="plan-controls panel"><div class="toolbar-filter">' + fields + '</div><div class="plan-control-actions">' +
        (edited ? '<span class="muted" role="status">Duty preview</span>' : '') + tools + '</div></div>';
    }

    function priorityList(plan) {
      const rows = plan.top.map(item => {
        const { row, block } = item;
        const day = block && D.parts(block.start).date;
        const when = block ? date(day) + ' · ' + time(block.start) + '–' + endTime(block.end, day) :
          item.held ? 'Optional · held by the energy setting' : 'Needs a time slot';
        const location = block?.onDuty ? 'On duty' : block ? 'Personal time' : '';
        return '<li><div>' + openEntry(row, block?.title || row.title) + '<div class="pills">' + chip(deadline(item.due)) +
          chip(item.dueOnRest ? 'During ' + item.restShift :
            item.advance ? 'Prepare before rest' : '') + chip(row.forecast ? 'Work routine' : '') + '</div></div><small>' +
          E(when + (location ? ' · ' + location : '')) + '</small>' + planner.adjustTaskButton(row, block) + '</li>';
      });
      return panel('Top three priorities', rows.length ? '<ol class="plan-priorities">' + rows.join('') + '</ol>' :
        empty('No open priorities for this window.'));
    }

    function earlyList(plan) {
      const roster = plan.upcomingRoster.map(row => {
        const window = D.planning.dutyWindow(current(), row);
        return '<li>' + btn(row.shift + ' · ' + date(row.date), 'navigate', { view: 'dayplan', sub: 'plan', date: row.date },
          { cls: 'row-title' }) + (window ? '<span>' + E(time(window.start) + '–' + endTime(window.end, row.date)) + '</span>' : '') + '</li>';
      }).join('');
      const dutyCount = plan.upcomingRoster.filter(row => D.SHIFT[row.shift]?.start).length;
      const rows = plan.early.map(item => {
        const { row, advance, dueOnRest, night, nextDutyDue } = item;
        const reason = dueOnRest ? deadline(dueOnRest) + ' · ' + item.restShift :
          advance ? 'Prepare before ' + date(advance.start) + ' · ' + deadline(item.due) :
            night ? deadline(item.timing) + ' · before ' + night.shift + ' starts' : deadline(item.due) + ' · ' + nextDutyDue.shift;
        return '<li><div>' + openEntry(row) + '</div><small>' + E(reason) + '</small><div class="actions">' +
          planner.adjustTaskButton(row, item.block) + (row.forecast ? '' : short('Last workable slot', 'companion-last-slot', { id: row.id })) + '</div></li>';
      });
      return panel('Upcoming roster', roster ? '<ul class="plan-next-duties plan-full-roster">' + roster + '</ul>' :
        empty('Add upcoming shifts to see them here.'), short('Add roster shifts', 'roster-add'),
        dutyCount + ' working ' + (dutyCount === 1 ? 'duty' : 'duties'), 'plan-next-duties') +
        panel('Prepare early', rows.length ? '<ul class="plan-priorities plan-early-list">' + rows.join('') + '</ul>' :
          empty('No early preparation flagged by the roster.'), '', '', 'plan-prepare-early');
    }

    function timelineBlock(block, day, simple = false) {
      const midnight = D.instant(day);
      const start = time(Math.max(block.start, midnight));
      const end = endTime(block.end, day);
      const action = block.dcsSuggestion ? short('Use this slot', 'plan-book-dcs', { date: state.date, duty: block.dutyDate, start: block.start }) :
        block.faith ? short('Open Namaz & Zikr', 'companion-open-faith', { date: block.faith.date, slot: block.faith.slot }) :
        block.practice ? (day <= now().date ? short('Log practice', 'plan-time-log',
        { kind: 'practice', source: block.practice.id, title: block.practice.title, category: 'learning', date: day }) :
        short('Edit practice', 'plan-practice', { id: block.practice.id })) :
        block.kind === 'study' && !block.booked ? short(block.course ? 'Book session' : 'Add a course', 'course-edit',
        { id: block.course?.id, date: day, time: start, minutes: Math.round((block.end - block.start) / 60000) }) :
        block.kind === 'study' && day <= now().date ? short('Log session', 'study-edit', { course: block.course.id, date: day }) :
          block.kind === 'duty' ? short('Shift stickies', 'navigate', { view: 'stickies', date: block.date }) : '';
      const title = block.row ? openEntry(block.row, block.title) : '<strong>' + E(block.title) + '</strong>';
      const module = block.course?.module;
      const detail = [block.start < midnight ? 'Continued from previous day' : '', block.onDuty ? 'During duty' : '',
        block.kind === 'locked' ? 'Locked' : '', block.adjusted ? 'Adjusted time' : '',
        block.row?.portfolioId && D.planning.assignmentFor(current(), block.row)?.title, block.detail, module].filter(Boolean).join(' · ');
      const actions = action + planner.blockActions(block, day) + (block.adjustable?.type === 'after' ?
        companion.actualAfterButton(block.adjustable.anchorDate, block.adjustable.shift, D.parts(block.start).date) : '');
      if (simple) {
        const row = block.row;
        const assignment = row && D.planning.assignmentFor(current(), row);
        const source = row && (D.workflow.isSticky(row) ? D.workflow.stickyLabel(row) : row.shiftScheduleKey ? 'Shift sticky' : D.TYPES[row.type]);
        const subtitle = [source, assignment?.title, block.dcsSuggestion && block.detail, block.start < midnight && 'Continued from previous day'].filter(Boolean).join(' · ');
        const line = '<time>' + E(start + '–' + end) + '</time><span><strong>' + E(block.title) + '</strong>' +
          (subtitle ? '<small>' + E(subtitle) + '</small>' : '') + '</span>';
        const entry = row && !row.forecast ? short('Open ' + (source || 'entry').toLowerCase(), 'entry-view', { id: remember(row) }) : '';
        const update = row && !row.forecast && !row.virtual && P.tracked(row) ? short(row.type === 'task' ? 'Record result' : 'Log update',
          'progress-edit', { id: row.id, result: row.type === 'task' ? 'yes' : '' }) : '';
        const links = row && !row.forecast ? related(row) : '';
        const details = actions || entry || update || links;
        const key = ['day', day, block.kind, row?.id || block.title, block.start].join('|');
        return '<li class="day-line" data-day-kind="' + E(block.kind) + '"' + (row ? ' data-day-entry="' + E(row.id) + '"' : '') + '>' + (details ?
          '<details data-keep-open="' + E(key) + '"><summary>' + line + '</summary><div class="day-line-actions"><div class="actions">' +
          entry + update + actions + '</div>' + links + '</div></details>' : '<div class="day-line-static">' + line + '</div>') + '</li>';
      }
      return '<li class="plan-block" data-plan-kind="' + block.kind + '"' + (block.onDuty ? ' data-on-duty' : '') + '><time>' +
        E(start + '–' + end) + '</time><div>' + title + (detail ? '<small>' + E(detail) + '</small>' : '') + '</div>' +
        (actions ? '<div class="actions plan-block-actions">' + actions + '</div>' : '') + '</li>';
    }

    function dailyPage() {
      const plan = P.build(current(), state.date);
      const day = plan.days[0];
      const duty = day.duty;
      const window = D.planning.dutyWindow(current(), duty);
      const status = duty?.shift ? duty.shift + (window ? ' · ' + time(window.start) + '–' + endTime(window.end, day.date) : '') : 'No duty entered';
      const notices = plan.notices.filter(item => item.date === day.date);
      const reminders = companion.lastSlotAlerts(plan) + companion.personalAlerts(plan);
      const blocks = day.blocks.filter(block => block.kind !== 'personal');
      const periodRows = D.planning.period(current(), day.date, day.date)[0].rows;
      const milestones = periodRows.filter(item => item.assignment);
      const assignmentPanel = milestones.length ? '<details class="day-secondary" data-keep-open="day-assignments"><summary>Assignments (' +
        milestones.length + ')</summary>' + planner.periodItems(milestones, day.date) + '</details>' : '';
      const scheduled = new Set(blocks.filter(block => block.row).map(block => D.str(block.row.id)));
      const unslotted = current().entries.filter(row => row.type === 'task' && row.portfolioId && row.date === day.date &&
        D.planning.availableTask(current(), row) && !scheduled.has(D.str(row.id)));
      const unslottedPanel = unslotted.length ? '<details class="day-secondary" data-keep-open="day-unslotted"><summary>Assignment tasks without a time slot (' +
        unslotted.length + ')</summary>' + planner.periodItems(unslotted.map(row => ({
          row, title: row.title, time: row.time, label: D.planning.assignmentFor(current(), row)?.title || 'Planned'
        })), day.date) + '</details>' : '';
      const noticePanel = notices.length || reminders ? '<details class="day-secondary" data-keep-open="day-review"><summary>Review plan' +
        (notices.length ? ' <span>' + notices.length + '</span>' : '') + '</summary>' + notices.map(item => note(item.text, 'warn')).join('') + reminders + '</details>' : '';
      return '<div class="day-planner-surface"><div class="day-heading"><div><h2>' + E(namedDay(day.date) + ' · ' + date(day.date)) +
        '</h2><small>' + E(status) + '</small></div>' + short(duty ? 'Change duty' : 'Set duty', 'duty-edit', { date: day.date }) + '</div>' +
        noticePanel + assignmentPanel + unslottedPanel + activity.section(plan) + (blocks.length ? '<ol class="day-timeline" aria-label="Planned day">' +
          blocks.map(block => timelineBlock(block, day.date, true)).join('') + '</ol>' : empty('Add a block or schedule a task to plan this day.')) + '</div>';
    }

    function planPage() {
      const overrides = Object.fromEntries(selectedDates().filter(day => preview.has(day)).map(day => [day, preview.get(day).shift]));
      const previewing = Object.keys(overrides).length > 0;
      const plan = P.build(current(), state.date, overrides);
      const timelines = plan.days.map(day => {
        const heading = namedDay(day.date) + ' · ' + date(day.date);
        const notices = plan.notices.filter(item => item.date === day.date).map(item => note(item.text, 'warn')).join('');
        const baseline = companion.baselineButton(day.date, previewing);
        return panel(heading, planner.dayControls(day) + (baseline ? '<div class="actions section-actions">' + baseline + '</div>' : '') +
          notices + (day.blocks.length ? '<ol class="plan-timeline">' +
          day.blocks.map(block => timelineBlock(block, day.date)).join('') + '</ol>' : empty('No blocks for this date.')),
        '', day.duty?.shift || 'No duty entered', 'plan-day-' + day.date);
      });
      const unplaced = plan.unplaced.length ? '<details class="plan-carry"><summary>Pending without a slot (' + plan.unplaced.length + ')</summary>' +
        plan.unplaced.map(item => '<article class="plan-review-row"><div>' + openEntry(item.row) + '<small>' +
          E([deadline(item.due), D.minutesText(D.planning.estimate(item.row)), item.held && 'Held by the energy setting'].filter(Boolean).join(' · ')) +
          '</small></div>' + planner.adjustTaskButton(item.row) + '</article>').join('') + '</details>' : '';
      return planControls(plan.days) + (previewing ? '' : companion.lastSlotAlerts(plan) + companion.personalAlerts(plan)) + priorityList(plan) +
        planner.carryList(state.date) + '<div class="plan-days">' + timelines.join('') + '</div>' +
        unplaced + companion.blockedPanel(plan) + '<div class="plan-roster-review">' + earlyList(plan) + '</div>';
    }

    function followPage() {
      const data = current();
      if (reviewView === 'people') return options(reviewViews, reviewView, 'follow-review', 'Follow-up status') + companion.peoplePage();
      const rows = data.entries.filter(row => D.active(row) && P.tracked(row) &&
        (reviewView === 'done' ? !D.open(row) : D.open(row) && (reviewView !== 'waiting' || row.status === 'waiting')) &&
        (!frequency || P.cadence(data, row) === frequency));
      const due = row => P.deadlines(row)[0];
      rows.sort(reviewView === 'done' ? (a, b) => D.str(b.closedDate || b.completedAt).localeCompare(D.str(a.closedDate || a.completedAt)) :
        (a, b) => (due(a)?.at ?? Infinity) - (due(b)?.at ?? Infinity) || D.manualOrder(a, b));
      const filters = '<div class="plan-review-filters">' + options(reviewViews, reviewView, 'follow-review', 'Follow-up status') +
        select('followCadence', 'Frequency', { '': 'All frequencies', ...Object.fromEntries(cadences.map(name => [name, name])) }, frequency,
          ' data-follow-cadence') + '</div>';
      const list = rows.map(row => {
        const closing = D.tidy(row.closeNotes || row.closingComment);
        const detail = reviewView === 'done' ? [closing || 'Closure details can be added', row.verifiedBy && 'Confirmed by ' + row.verifiedBy].filter(Boolean).join(' · ') :
          [row.waitingOn ? 'Waiting on ' + row.waitingOn : row.status === 'waiting' && row.person ? 'Waiting on ' + row.person : '',
            row.followDate && 'Follow up ' + date(row.followDate) + (row.followTime ? ' ' + row.followTime : ''), row.waitingReason].filter(Boolean).join(' · ');
        const closureDate = row.closedDate || (row.completedAt && D.parts(row.completedAt).date);
        return '<article class="plan-review-row"><div>' + openEntry(row) + '<div class="pills">' + chip(P.cadence(data, row)) +
          chip((row.type === 'mwr' ? D.MWR : D.STATUS)[row.status]) + chip(reviewView === 'done' ? (closureDate ? 'Closed ' + date(closureDate) : '') : deadline(due(row))) +
          '</div>' + (detail ? '<p class="muted">' + E(detail) + '</p>' : '') + '</div>' +
          short(reviewView === 'done' ? 'Closure' : 'Follow-up', row.type === 'task' ? 'follow-edit' : 'entry-edit', { id: row.id }) + '</article>';
      }).join('');
      return filters + panel(reviewViews[reviewView] + ' work', list || empty('No records match these filters.'));
    }

    function learningPage() {
      const data = current();
      const today = now().date;
      const since = D.addDays(today, -6);
      const recent = D.planning.timeReport(data, since, today).rows.filter(row => row.category === 'learning');
      const minutes = recent.reduce((total, row) => total + row.minutes, 0);
      const courses = data.learningCourses.slice().sort((a, b) => Number(b.status === 'active') - Number(a.status === 'active') || a.title.localeCompare(b.title));
      const cards = courses.map(course => {
        const history = data.learningSessions.filter(row => D.same(row.courseId, course.id))
          .sort((a, b) => b.date.localeCompare(a.date) || D.str(b.createdAt).localeCompare(D.str(a.createdAt)));
        const last = history[0];
        const next = course.nextDate ? 'Next session · ' + date(course.nextDate) + ' ' + course.nextTime + ' · ' +
          D.minutesText(course.plannedMinutes) : 'Next session to plan';
        const sessions = history.map(row => '<div class="plan-review-row"><div><strong>' + E(date(row.date) + ' · ' + (row.module || course.title)) +
          '</strong><small>' + E((row.plannedMinutes ? 'Planned ' + D.minutesText(row.plannedMinutes) + ' · ' : '') + 'Actual ' +
            D.minutesText(row.actualMinutes)) + '</small>' + (row.takeaway ? '<p>' + E(row.takeaway) + '</p>' : '') +
          (row.nextAction ? '<p class="muted">Next · ' + E(row.nextAction) + '</p>' : '') + '</div>' +
          '<div class="actions">' + short('Edit session', 'study-edit', { id: row.id, course: course.id }) +
          short('Queue practice', 'plan-practice', { course: course.id, session: row.id }) +
          short('Link takeaway to task', 'companion-learning', { session: row.id }) + '</div></div>').join('');
        return panel(course.title, '<div class="pills">' + chip(P.courseStates[course.status]) + chip(course.module) + '</div>' +
          '<p class="plan-course-next">' + E(next) + '</p>' +
          (last?.nextAction ? '<p class="muted">Next action · ' + E(last.nextAction) + '</p>' : '') +
          '<div class="actions">' + short('Log session', 'study-edit', { course: course.id }) +
          short(course.nextDate ? 'Edit next session' : 'Plan next session', 'course-edit', { id: course.id }) +
          short('Add practice', 'plan-practice', { course: course.id }) + '</div>' + planner.practiceList(course) + companion.courseApplications(course) +
          (history.length ? '<details class="section-actions"><summary>Session history (' + history.length + ')</summary>' + sessions + '</details>' : ''),
          '', '', 'learning-' + D.str(course.id));
      });
      return panel('Learning in the last seven days', '<p class="plan-study-total"><strong>' + E(minutes ? D.minutesText(minutes) : '0 min') +
        '</strong> · ' + recent.length + (recent.length === 1 ? ' record' : ' records') + '</p>',
        btn('Add course or skill', 'course-edit', {}, { cls: 'primary small', icon: 'plus' })) +
        (cards.length ? '<div class="plan-days">' + cards.join('') + '</div>' : empty('Add the course or skill you want to practise.'));
    }

    function renderPage() {
      const tools = mode === 'day' ? dateNav() + btn('Log activity', 'activity-edit', { date: state.date }, { cls: 'primary small', icon: 'plus' }) :
        mode === 'plan' ? short('Find 15–60 min', 'plan-find-now') + short('Log time', 'plan-time-log') +
        short('Plan settings', 'plan-settings') + short('Namaz windows', 'companion-faith') +
        short('Preview roster change', 'companion-swap', { date: state.date }) + dateNav() :
        ['week', 'month', 'lookahead', 'weekly', 'cycle'].includes(mode) ? dateNav() : '';
      const pages = { day: dailyPage, plan: planPage, follow: followPage, personal: companion.personalPage, learning: learningPage,
        weekly: planner.weeklyPage, cycle: companion.report, report: planner.reportPage };
      const direct = { day: 'Day', week: 'Week', month: 'Month' };
      const additional = Object.fromEntries(Object.entries(views).filter(([key]) => !Object.hasOwn(direct, key)));
      const more = '<details class="workspace-options" data-keep-open="planner-options"><summary>' +
        E(Object.hasOwn(direct, mode) ? 'More planning' : views[mode]) + '</summary>' +
        options(additional, mode, 'plan-view', 'Other planner views') + (mode === 'day' ? '<div class="actions">' +
          short('Add time block', 'plan-lock', { date: state.date }) + short('Add task', 'plan-new-task', { date: state.date }) +
          short('Find 15–60 min', 'plan-find-now') + short('Plan settings', 'plan-settings') +
          short('Namaz windows', 'companion-faith') + short('Preview roster change', 'companion-swap', { date: state.date }) + '</div>' : '') + '</details>';
      return page('', 'Day Planner', '', tools) + '<div class="workspace-switch planner-switch">' +
        options(direct, mode, 'plan-view', 'Day, week and month') + more + '</div>' +
        (Object.hasOwn(pages, mode) ? pages[mode]() : planner.periodPage(mode));
    }

    function settings() {
      const values = P.preferences(current().settings);
      const fields = Object.entries(P.prefs).map(([key, [label, , min, max]]) => input(key, label, values[key],
        { type: 'number', extra: ' min="' + min + '" max="' + max + '" step="1"' })).join('');
      formDialog('day-plan-settings', 'Plan settings', fields + timeInput('bedtime', 'Usual bedtime', values.bedtime) +
        timeInput('homeStart', 'Suggest personal tasks from', values.homeStart) + timeInput('homeEnd', 'Suggest personal tasks until', values.homeEnd), 'Save settings');
    }

    function number(values, name, label, min, max) {
      const value = D.tidy(values.get(name));
      const count = Number(value);
      if (!value || !Number.isInteger(count) || count < min || count > max) throw new Error(label + ' must be between ' + min + ' and ' + max + ' minutes.');
      return count;
    }

    async function saveSettings(form) {
      const values = new FormData(form);
      const settings = Object.fromEntries(Object.entries(P.prefs).map(([key, [label, , min, max]]) =>
        [key, number(values, key, label.replace(' (minutes)', ''), min, max)]));
      settings.bedtime = readTime(values, 'bedtime', 'usual bedtime', true);
      settings.homeStart = readTime(values, 'homeStart', 'the start of personal task time', true);
      settings.homeEnd = readTime(values, 'homeEnd', 'the end of personal task time', true);
      if (settings.homeStart >= settings.homeEnd) throw new Error('Choose an end time after the start of personal task time.');
      await commit(data => { data.settings.dayPlan = { ...data.settings.dayPlan, ...settings }; }, 'Day Plan settings saved.');
    }

    async function saveRoster() {
      const changes = selectedDates().filter(day => preview.has(day)).map(day => [day, preview.get(day)]);
      if (!changes.length) return;
      await commit(data => {
        const at = D.stamp();
        for (const [day, change] of changes) {
          const before = data.roster.find(row => row.date === day);
          if ((before?.shift || '') !== change.before) throw new Error('This roster date changed. Use the saved roster, then choose the duty again.');
          D.updateDuty(data, day, change.shift, before?.group, before?.note, 'Saved from Day Plan', at);
        }
        D.syncShiftStickies(data, changes.map(([day]) => day), at);
      }, 'Roster saved.', true, false);
      changes.forEach(([day]) => preview.delete(day));
      render();
    }

    function followEdit(id) {
      const row = D.byId(current().entries, id);
      if (!row || !D.active(row) || row.type !== 'task') throw new Error('This task is no longer available.');
      formDialog('plan-follow-form', 'Follow-up & closure', select('status', 'Status', D.STATUS, row.status) +
        input('waitingOn', 'Waiting on', row.waitingOn || (row.status === 'waiting' ? row.person : ''), { extra: ' maxlength="120"' }) +
        dateInput('followDate', 'Next follow-up date', row.followDate) + timeInput('followTime', 'Follow-up time (optional)', row.followTime) +
        N.field('waitingReason', 'Waiting reason or next action', row.waitingReason) +
        (row.scope === 'work' ? '<div class="wide">' + check('personalTime', 'This task can be done in personal time', row.personalTime) + '</div>' : '') +
        dateInput('closedDate', 'Closure date', row.closedDate) + input('verifiedBy', 'Confirmed by (optional)', row.verifiedBy, { extra: ' maxlength="120"' }) +
        N.field('closeNotes', 'What confirms this is closed?', row.closeNotes || row.closingComment), 'Save follow-up', row,
        '<p class="muted">' + E(row.title) + '</p>');
    }

    async function saveFollow(form, previous) {
      const values = new FormData(form);
      const status = formValue(values, 'status');
      if (!Object.hasOwn(D.STATUS, status)) throw new Error('Choose a task status.');
      const followDate = readDate(values, 'followDate', 'the follow-up date');
      const followTime = readTime(values, 'followTime', 'the follow-up time');
      if (followTime && !followDate) throw new Error('Add a date for the follow-up time.');
      const closedDate = readDate(values, 'closedDate', 'the closure date');
      const updated = { followDate, followTime, waitingOn: D.tidy(values.get('waitingOn')), waitingReason: formValue(values, 'waitingReason'),
        verifiedBy: D.tidy(values.get('verifiedBy')), closeNotes: formValue(values, 'closeNotes'),
        closedDate: status === 'done' ? closedDate || (previous.completedAt && D.parts(previous.completedAt).date) || now().date : '',
        personalTime: values.has('personalTime') };
      if (updated.waitingOn.length > 120 || updated.verifiedBy.length > 120) throw new Error('Use up to 120 characters for a name.');
      await commit(data => {
        const row = D.byId(data.entries, previous.id);
        if (!row || !D.active(row) || row.editToken !== previous.editToken) throw new Error('This task changed. Reopen it to see the latest details.');
        const noteStyles = N.capture(values, row.noteStyles);
        const changes = Object.entries(updated).filter(([key, value]) => value !== (row[key] ?? (key === 'personalTime' ? false : '')))
          .map(([key, value]) => ({ field: ({ waitingOn: 'Waiting on', followDate: 'Follow-up date', followTime: 'Follow-up time',
            waitingReason: 'Waiting reason', verifiedBy: 'Confirmed by', closeNotes: 'Closure details', closedDate: 'Closure date',
            personalTime: 'Personal time' })[key], before: D.str(row[key]), after: D.str(value) }));
        if (!changes.length && row.status === status && JSON.stringify(noteStyles) === JSON.stringify(row.noteStyles)) return false;
        const at = D.stamp();
        D.setTaskStatus(row, status, at);
        Object.assign(row, updated, { noteStyles, updatedAt: at, editToken: D.uid(),
          history: [...D.list(row.history), { at, action: 'Follow-up and closure updated', changes }] });
      }, 'Follow-up saved.');
    }

    function courseEdit({ id, date: day, time: clock, minutes }) {
      const row = id && D.byId(current().learningCourses, id);
      if (id && !row) throw new Error('This course is no longer available.');
      const fields = input('title', 'Course or skill', row?.title, { wide: true, extra: ' maxlength="160" data-initial-focus' }) +
        input('module', 'Current module or skill', row?.module, { wide: true, extra: ' maxlength="160"' }) +
        select('status', 'Status', P.courseStates, row?.status || 'active') + input('plannedMinutes', 'Planned session minutes',
          minutes || row?.plannedMinutes || P.preferences(current().settings).study, { type: 'number', extra: ' min="5" max="240"' }) +
        dateInput('nextDate', 'Next session date', day || row?.nextDate) + timeInput('nextTime', 'Next session time', clock || row?.nextTime);
      formDialog('learning-course-form', row ? 'Edit course or skill' : 'Add course or skill', fields, 'Save course', row || null);
    }

    async function saveCourse(form, previous) {
      const values = new FormData(form);
      const title = D.tidy(values.get('title'));
      const module = D.tidy(values.get('module'));
      const status = formValue(values, 'status');
      const nextDate = readDate(values, 'nextDate', 'the next session date');
      const nextTime = readTime(values, 'nextTime', 'the next session time');
      if (!title || title.length > 160 || module.length > 160) throw new Error('Enter a course title and keep each name within 160 characters.');
      if (!!nextDate !== !!nextTime) throw new Error('Enter both a date and a time to book the next session.');
      const plannedMinutes = number(values, 'plannedMinutes', 'Session length', 5, 240);
      await commit(data => {
        const row = previous && D.byId(data.learningCourses, previous.id);
        if (previous && (!row || row.editToken !== previous.editToken)) throw new Error('This course changed. Open it again to see the latest version.');
        const at = D.stamp();
        const fields = { title, module, status, plannedMinutes, nextDate, nextTime, updatedAt: at, editToken: D.uid() };
        if (row) Object.assign(row, fields);
        else data.learningCourses.push({ id: D.uid(), createdAt: at, ...fields });
      }, 'Course saved.');
    }

    function studyEdit({ id, course: courseId, date: day }) {
      const course = D.byId(current().learningCourses, courseId);
      const row = id && D.byId(current().learningSessions, id);
      if (!course || id && !row) throw new Error('This learning record is no longer available.');
      const planned = course.nextDate && course.nextDate <= now().date ? course.nextDate : now().date;
      formDialog('learning-session-form', row ? 'Edit learning session' : 'Log learning session',
        '<input type="hidden" name="courseId" value="' + E(course.id) + '">' +
        input('module', 'Module or topic', row?.module ?? course.module, { wide: true, extra: ' maxlength="160" data-initial-focus' }) +
        dateInput('date', 'Session date', row?.date || day || planned) +
        input('plannedMinutes', 'Planned minutes', row?.plannedMinutes ?? course.plannedMinutes, { type: 'number', extra: ' min="0" max="240"' }) +
        input('actualMinutes', 'Actual minutes', row?.actualMinutes, { type: 'number', extra: ' min="1" max="1440"' }) +
        textarea('takeaway', 'One practical takeaway', row?.takeaway) + textarea('nextAction', 'Next action', row?.nextAction), 'Save session', row || null,
        '<p class="muted">' + E(course.title) + '</p>');
    }

    async function saveStudy(form, previous) {
      const values = new FormData(form);
      const day = readDate(values, 'date', 'the session date', true);
      if (day > now().date) throw new Error('Book a future session from the course. Log its actual time after you study.');
      const plannedMinutes = number(values, 'plannedMinutes', 'Planned time', 0, 240);
      const actualMinutes = number(values, 'actualMinutes', 'Actual time', 1, 1440);
      const module = D.tidy(values.get('module'));
      if (module.length > 160) throw new Error('Use up to 160 characters for the module name.');
      await commit(data => {
        const course = D.byId(data.learningCourses, formValue(values, 'courseId'));
        const row = previous && D.byId(data.learningSessions, previous.id);
        if (!course || previous && (!row || row.editToken !== previous.editToken || !D.same(row.courseId, course.id))) {
          throw new Error('This learning record changed. Open it again to see the latest version.');
        }
        const at = D.stamp();
        const fields = { module, date: day, plannedMinutes, actualMinutes, takeaway: D.tidy(values.get('takeaway')),
          nextAction: D.tidy(values.get('nextAction')), updatedAt: at, editToken: D.uid() };
        if (row) Object.assign(row, fields);
        else {
          data.learningSessions.push({ id: D.uid(), courseId: course.id, createdAt: at, ...fields });
          if (course.nextDate === day) Object.assign(course, { nextDate: '', nextTime: '', updatedAt: at, editToken: D.uid() });
        }
      }, 'Learning session saved.');
    }

    function change(control) {
      if (control.matches('[data-plan-duty]')) {
        const day = control.dataset.planDuty;
        const before = current().roster.find(row => row.date === day)?.shift || '';
        if (before === control.value) preview.delete(day);
        else preview.set(day, { before, shift: control.value });
        render();
        document.querySelector('[data-plan-duty="' + day + '"]')?.focus({ preventScroll: true });
        return true;
      }
      if (!control.matches('[data-follow-cadence]')) return planner.change(control);
      frequency = control.value;
      render();
      document.querySelector('[data-follow-cadence]')?.focus({ preventScroll: true });
      return true;
    }

    function show(value) { if (Object.hasOwn(views, value)) mode = value; }

    return { page: renderPage, change, show, closeoutButtons: planner.closeoutButtons,
      dateStep: () => mode === 'month' ? 'month' : ['week', 'weekly'].includes(mode) ? 'week' : 'day',
      isTimeline: () => mode === 'plan' || mode === 'day', forms: { ...planner.forms, ...activity.forms, 'day-plan-settings': saveSettings, 'plan-follow-form': saveFollow,
      'learning-course-form': saveCourse, 'learning-session-form': saveStudy }, actions: {
      ...planner.actions, ...activity.actions, 'plan-view': ({ value }) => {
        document.querySelector('#main [data-keep-open="planner-options"]')?.removeAttribute('open');
        show(value);
        render();
        const active = document.querySelector('#main .planner-switch > .tabs [aria-pressed="true"]') ||
          document.querySelector('#main .planner-switch summary');
        active?.focus({ preventScroll: true });
      },
      'plan-settings': settings, 'plan-save-roster': saveRoster, 'plan-reset': () => { selectedDates().forEach(day => preview.delete(day)); render(); },
      'follow-review': ({ value }) => { if (Object.hasOwn(reviewViews, value)) reviewView = value; render(); },
      'follow-edit': ({ id }) => followEdit(id), 'course-edit': courseEdit, 'study-edit': studyEdit
    } };
  };
})(Diary);
