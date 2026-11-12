/* Controls for plan changes, period views, closeout, and recorded time. */
(function (D) {
  'use strict';

  D.createPlanningUI = function (ui) {
    const { state, current, now, E, btn, chip, empty, panel, select, input, textarea, check, dateInput, timeInput,
      readDate, readTime, formValue, openDialog, closeDialog, commit, render, remember, copyText, download, newTask, ask, number } = ui;
    const F = D.planning;
    const P = D.dayPlan;
    const date = D.formatDate;
    const short = (label, action, fields = {}, options = {}) => btn(label, action, fields, { cls: 'small', ...options });
    const duration = minutes => minutes ? D.minutesText(minutes) : '0 min';
    const periodLabel = (start, end) => date(start) + ' – ' + date(end);
    let reportRange;

    function form(id, title, fields, label, row = null, intro = '', extra = '') {
      openDialog(id, title, intro + '<form id="' + id + '" class="form-grid" novalidate>' + fields + '</form>',
        extra + btn('Cancel', 'close-dialog') + '<button class="primary" type="submit" form="' + id + '">' + E(label) + '</button>', { row });
    }

    function saveRow(rows, previous, fields) {
      const row = previous && D.byId(rows, previous.id);
      if (previous && (!row || row.editToken !== previous.editToken)) throw new Error('This record changed. Open it again before saving.');
      const at = D.stamp();
      if (row) Object.assign(row, fields, { updatedAt: at, editToken: D.uid() });
      else rows.push({ id: D.uid(), ...fields, createdAt: at, updatedAt: at, editToken: D.uid() });
    }

    function updateDay(data, day, fields) {
      let row = D.byId(data.planDays, day);
      if (!row) { row = { id: day, date: day, energy: 'normal' }; data.planDays.push(row); }
      Object.assign(row, fields, { updatedAt: D.stamp() });
    }

    function dayControls(day) {
      return '<div class="plan-day-controls">' + select('energy-' + day.date, 'Energy', F.energies, F.energy(current(), day.date),
        ' data-plan-energy="' + E(day.date) + '"') + short('Lock time', 'plan-lock', { date: day.date }, { icon: 'calendar' }) + '</div>';
    }

    function change(control) {
      if (!control.matches('[data-plan-energy]')) return false;
      const day = D.parseDate(control.dataset.planEnergy);
      const energy = control.value;
      if (!day || !Object.hasOwn(F.energies, energy)) return false;
      return commit(data => updateDay(data, day, { energy }), F.energies[energy] + ' day saved.').then(() =>
        document.querySelector('[data-plan-energy="' + day + '"]')?.focus({ preventScroll: true }));
    }

    function finishEdit({ date: day, shift }) {
      const base = D.dutyWindow({ date: day, shift });
      if (!base) throw new Error('Choose a working duty first.');
      const adjusted = F.dutyWindow(current(), { date: day, shift });
      const finish = D.parts(adjusted.end);
      form('plan-finish-form', 'Adjust duty time', timeInput('startTime', 'Start time on ' + date(day), D.parts(adjusted.start).time) +
        dateInput('finishDate', 'Finish date', finish.date) + timeInput('finishTime', 'Finish time', finish.time),
        'Replan day', { date: day, shift }, '<p class="muted">' + E(date(day) + ' · ' + shift + ' · Roster ' +
          D.parts(base.start).time + '–' + D.parts(base.end).time) + '</p>',
        adjusted.adjusted ? btn('Use roster times', 'plan-finish-reset', { date: day, shift }) : '');
    }

    async function saveFinish(element, duty) {
      const values = new FormData(element);
      const finishDate = readDate(values, 'finishDate', 'the finish date', true);
      const finishTime = readTime(values, 'finishTime', 'the finish time', true);
      const window = D.dutyWindow(duty);
      const startTime = values.has('startTime') ? readTime(values, 'startTime', 'the start time', true) : '';
      if (!window || D.instant(finishDate, finishTime) <= (startTime ? D.instant(duty.date, startTime) : window.start) ||
          finishDate > D.addDays(duty.date, 1)) {
        throw new Error('Enter a finish after duty starts, on the duty date or the next day.');
      }
      await commit(data => {
        if (!data.roster.some(row => row.date === duty.date && row.shift === duty.shift)) {
          throw new Error('Save this duty to the roster first.');
        }
        updateDay(data, duty.date, { startTime, finishDate, finishTime, finishShift: duty.shift });
      }, 'Duty time saved and day replanned.');
    }

    async function resetFinish({ date: day, shift }) {
      await commit(data => {
        const row = D.byId(data.planDays, day);
        if (row?.finishShift === shift) updateDay(data, day, { startTime: '', finishShift: '', finishDate: '', finishTime: '' });
      }, 'Roster times restored.');
      closeDialog(true);
    }

    function lockEdit({ id, date: day, title, time, endTime, endDate, category }) {
      const row = id && D.byId(current().entries, id);
      if (id && (!row?.planLockCategory || !D.active(row))) throw new Error('This locked block is no longer available.');
      form('plan-lock-form', row ? 'Edit locked time' : 'Lock time',
        input('title', 'Commitment', row?.title || title, { wide: true, extra: ' maxlength="160" data-initial-focus' }) +
        select('category', 'Category', F.locks, row?.planLockCategory || (Object.hasOwn(F.locks, category) ? category : 'personal')) +
        dateInput('date', 'Start date', row?.date || day || state.date) + timeInput('time', 'Start time', row?.time || time) +
        timeInput('endTime', 'Finish time', row?.endTime || endTime) + dateInput('endDate', 'Finish date for an overnight block',
          row?.endDate && row.endDate !== row.date ? row.endDate : endDate && endDate !== day ? endDate : ''), 'Save and replan', row || null, '',
        row ? btn('Remove block', 'plan-lock-remove', { id: row.id }, { cls: 'danger' }) : '');
    }

    async function saveLock(element, previous) {
      const values = new FormData(element);
      const title = D.tidy(values.get('title'));
      const planLockCategory = formValue(values, 'category');
      const day = readDate(values, 'date', 'the start date', true);
      const time = readTime(values, 'time', 'the start time', true);
      const endTime = readTime(values, 'endTime', 'the finish time', true);
      const endDate = readDate(values, 'endDate', 'the finish date') || day;
      if (!title || title.length > 160) throw new Error('Enter a commitment name of up to 160 characters.');
      if (!Object.hasOwn(F.locks, planLockCategory) || D.instant(endDate, endTime) <= D.instant(day, time)) {
        throw new Error('Choose a category and a finish after the start. Enter the next date for an overnight block.');
      }
      await commit(data => {
        if (previous && !D.active(D.byId(data.entries, previous.id) || { deletedAt: true })) throw new Error('This block was removed.');
        saveRow(data.entries, previous, { title, type: 'event', scope: planLockCategory === 'work' ? 'work' : 'personal',
          date: day, time, endDate, endTime, planLockCategory });
      }, 'Time locked and day replanned.');
    }

    function removeLock({ id }) {
      ask('Remove locked time?', 'The planner can use this time once the commitment is removed.', 'Remove block', async () => {
        await commit(data => {
          const row = D.byId(data.entries, id);
          if (!row?.planLockCategory || row.deletedAt) return false;
          Object.assign(row, { deletedAt: D.stamp(), updatedAt: D.stamp(), editToken: D.uid() });
        }, 'Locked time removed.');
        closeDialog(true);
      });
    }

    function adjustBlock({ type, anchorDate, shift = '', date: day, time, title, minutes }) {
      const id = F.blockId(type, anchorDate, shift);
      if (!Object.hasOwn(F.editableBlocks, type) || !F.validDay(anchorDate)) throw new Error('This plan block is no longer available.');
      const row = D.byId(current().planBlocks, id);
      form('plan-block-form', 'Adjust time', input('title', 'Block', row?.title || title, { wide: true, extra: ' maxlength="160"' }) +
        dateInput('date', 'Start date', row?.date || day) + timeInput('time', 'Start time', row?.time || time) +
        input('minutes', 'Duration in minutes', row?.minutes || minutes, { type: 'number', extra: ' min="1" max="1440"' }),
        'Save and replan', { id, blockType: type, anchorDate, shift, editToken: row?.editToken }, '',
        row ? btn('Use automatic time', 'plan-block-reset', { id }) : '');
    }

    async function saveBlock(element, previous) {
      const values = new FormData(element);
      const date = readDate(values, 'date', 'the start date', true);
      const time = readTime(values, 'time', 'the start time', true);
      const minutes = number(values, 'minutes', 'Duration', 1, 1440);
      const title = D.tidy(values.get('title'));
      if (!title || title.length > 160) throw new Error('Enter a block name of up to 160 characters.');
      await commit(data => {
        const shift = data.roster.find(row => row.date === previous.anchorDate)?.shift || '';
        if (shift !== previous.shift) throw new Error('Save the roster change first, then adjust this block.');
        const row = D.byId(data.planBlocks, previous.id);
        if (row?.editToken !== previous.editToken) throw new Error('This block changed. Open it again.');
        const fields = { id: previous.id, blockType: previous.blockType, anchorDate: previous.anchorDate, shift,
          date, time, title, minutes, updatedAt: D.stamp(), editToken: D.uid() };
        if (row) Object.assign(row, fields);
        else data.planBlocks.push(fields);
      }, 'Time adjusted and day replanned.');
    }

    async function resetBlock({ id }) {
      await commit(data => { data.planBlocks = data.planBlocks.filter(row => !D.same(row.id, id)); }, 'Automatic time restored.');
      closeDialog(true);
    }

    function forecastEntry(data, id, date) {
      if (!F.validDay(date)) return null;
      const slot = D.workSlots(data, date, date).find(item => D.same(item.id, id) && !item.manual);
      if (slot) return { ...D.workSlotFields(slot), type: 'task', scope: 'work', priority: 'normal', forecastDay: date };
      const roster = new Map(data.roster.map(row => [row.date, row]));
      const duty = roster.get(date);
      const spec = [...(D.SHIFT[duty?.shift]?.start ? D.shiftSchedule.dailySpecs(data, duty) : []),
        ...D.shiftSchedule.reminderSpecs(data, date, roster)].find(item => D.same(item.id, id));
      return spec ? { ...spec, type: 'task', scope: 'work', priority: 'normal', forecastDay: date } : null;
    }

    function taskAdjust({ id, date: day, startDate, startTime, forecastDay, assignment, minutes }) {
      const data = current();
      const parent = assignment && D.byId(data.assignments, assignment);
      if (assignment && (!parent || parent.deletedAt || parent.completedAt)) throw new Error('This assignment is no longer open.');
      const planned = parent && data.entries.find(row => row.assignmentPlan && D.same(row.portfolioId, parent.id) && D.open(row));
      const saved = planned || D.byId(data.entries, id);
      const row = saved || (parent ? { title: 'Work on ' + parent.title, type: 'task', scope: 'work', priority: 'normal',
        date: state.date < parent.assignedDate ? parent.assignedDate : state.date, portfolioId: parent.id, newAssignment: true, planFlexible: true } :
        forecastEntry(data, id, forecastDay));
      if (!row || !D.active(row) || !P.tracked(row)) throw new Error(forecastDay ? 'Save the roster change before adjusting this routine.' :
        'This task is no longer available.');
      const link = F.assignmentFor(data, row);
      form('plan-task-form', 'Adjust task and priority',
        input('title', 'Task', row.title, { wide: true, extra: ' maxlength="500" data-initial-focus' }) +
        select('priority', 'Priority', F.priorities, row.priority || 'normal') +
        input('minutes', row.planRemaining != null ? 'Minutes remaining' : 'Duration or estimate in minutes',
          row.planRemaining ?? row.planMinutes ?? (minutes || F.estimate(row)), { type: 'number', extra: ' min="1" max="1440"' }) +
        dateInput('date', 'Planned date', day || startDate || row.date) + timeInput('time', 'Start time', startTime || row.time) +
        '<div class="wide">' + check('flexible', 'Fit at this time or later', row.planFlexible || !row.time || !!day) + '</div>' +
        dateInput('dueDate', 'Due date', row.dueDate) + timeInput('dueTime', 'Due time', row.dueTime) +
        '<div class="wide">' + check('focus', 'Plan this task first', row.focus) +
        (row.scope === 'work' ? check('personalTime', 'Can be done in personal time', row.personalTime) : '') + '</div>', 'Save and replan', row,
        link ? '<p class="muted">' + E(link.title + (link.endDate ? ' · Assignment through ' + date(link.endDate) : '')) + '</p>' :
          row.shiftScheduleKey ? '<p class="muted">This changes the selected occurrence.</p>' : '');
    }

    async function saveTask(element, previous) {
      const values = new FormData(element);
      const title = D.tidy(values.get('title'));
      const priority = formValue(values, 'priority');
      const day = values.has('date') ? readDate(values, 'date', 'the planned date', true) : previous.date;
      const time = values.has('time') ? readTime(values, 'time', 'the preferred time') : previous.time;
      const dueDate = values.has('dueDate') ? readDate(values, 'dueDate', 'the due date') : previous.dueDate;
      const dueTime = values.has('dueTime') ? readTime(values, 'dueTime', 'the due time') : previous.dueTime;
      const planMinutes = D.tidy(values.get('minutes')) ? number(values, 'minutes', 'Estimated time', 1, 1440) : null;
      if (!title || title.length > 500 || !Object.hasOwn(F.priorities, priority)) throw new Error('Enter a task name and priority.');
      if (dueTime && !dueDate) throw new Error('Choose a due date for this due time.');
      await commit(data => {
        const at = D.stamp();
        let row = D.byId(data.entries, previous.id);
        if (previous.newAssignment) {
          const parent = F.assignmentFor(data, previous);
          if (!parent || parent.completedAt || data.entries.some(item => item.assignmentPlan && D.same(item.portfolioId, parent.id) && D.open(item))) {
            throw new Error('This assignment changed. Open it again.');
          }
          row = D.workTask(data, { date: day, title, portfolioId: parent.id, assignmentPlan: true,
            assignedBy: parent.assignedBy || '' }, at);
        } else if (previous.forecastDay && !row) {
          const slot = D.workSlots(data, previous.forecastDay, previous.forecastDay).find(item => D.same(item.id, previous.id) && !item.manual);
          if (slot) D.addWorkSlot(data, slot, at);
          else D.syncShiftStickies(data, [previous.forecastDay], at);
          row = D.byId(data.entries, previous.id);
        } else if (row?.editToken !== previous.editToken) throw new Error('This task changed. Open it again.');
        if (!row || !D.active(row)) throw new Error('This task changed. Open it again.');
        const estimate = row.planRemaining != null ? { planRemaining: planMinutes } : { planMinutes };
        const fields = { title, priority, date: day, time, dueDate, dueTime, ...estimate, focus: values.has('focus'), personalTime: values.has('personalTime'),
          planFlexible: values.has('date') ? values.has('flexible') || !time : row.planFlexible };
        const labels = { title: 'Title', priority: 'Priority', date: 'Planned date', time: 'Preferred time', dueDate: 'Due date', dueTime: 'Due time',
          planMinutes: 'Estimated minutes', planRemaining: 'Remaining minutes',
          focus: 'Plan first', personalTime: 'Personal time', planFlexible: 'Flexible time' };
        const changes = Object.entries(fields).filter(([key, value]) => D.str(row[key]) !== D.str(value))
          .map(([key, value]) => ({ field: labels[key], before: D.str(row[key]), after: D.str(value) }));
        const rebinding = row.type === 'task' ? D.workflow.taskPlanChange(data, row, day) : day !== row.date ? { planNotBefore: true } : {};
        row.originalDate ||= row.date;
        row.originalDueDate ||= row.dueDate || dueDate;
        if (row.shiftScheduleKey && (day !== row.date || D.str(time) !== D.str(row.time) || !!fields.planFlexible !== !!row.planFlexible ||
            F.estimate(row) !== F.estimate({ ...row, ...fields }))) row.planOccurrenceOverride = true;
        Object.assign(row, rebinding, fields, { updatedAt: at, editToken: D.uid(),
          history: [...D.list(row.history), { at, action: 'Adjusted in Day Plan', changes }] });
      }, 'Task adjusted.');
    }

    async function bookDcs({ date: day, duty, start }) {
      await commit(data => {
        const slot = P.build(data, day).busy.find(block => block.dcsSuggestion && block.dutyDate === duty && block.start === Number(start));
        if (!slot) throw new Error('The available time changed. Review the new plan before adding DCS Learning.');
        const when = D.parts(slot.start);
        D.workTask(data, { id: P.dcsSessionId(duty), title: slot.title, date: when.date, time: when.time, dutyDate: duty, shift: slot.shift,
          planMinutes: Math.round((slot.end - slot.start) / F.minute), stickyCard: true, stickyKind: 'shift', stickyColour: 'sky', dcsLearning: true });
      }, 'DCS Learning added to Shift Stickies.');
    }

    function carryList(day) {
      const carried = F.carryovers(current(), day);
      return carried.length ? '<details class="plan-carry"><summary>Review carryovers (' + carried.length + ')</summary>' + carried.map(item =>
        '<article class="plan-review-row"><div><strong>' + E(item.row.title) + '</strong><small>' + E([item.moves ? item.moves + ' date moves' : '',
          item.days ? item.days + ' days open past its plan' : ''].filter(Boolean).join(' · ')) + '</small></div>' +
        short('Review', 'plan-rollover', { id: item.row.id, date: day }) + '</article>').join('') + '</details>' : '';
    }

    function rolloverEdit({ id }) {
      const row = D.byId(current().entries, id);
      if (!row || !D.open(row) || row.type !== 'task') throw new Error('This task is no longer open.');
      form('plan-rollover-form', 'Review carryover', input('reason', 'What is holding this up?', row.rolloverReview?.reason, { wide: true }) +
        select('action', 'What will you do?', F.reviewActions, row.rolloverReview?.action || 'next') +
        dateInput('target', 'New plan or follow-up date', '') + textarea('next', 'Next action', row.rolloverReview?.next), 'Save next action',
        { ...row, reviewDate: now().date }, '<p class="muted">' + E(row.title) + '</p>');
    }

    async function saveRollover(element, previous) {
      const values = new FormData(element);
      const action = formValue(values, 'action');
      const target = readDate(values, 'target', 'the new date');
      const reason = D.tidy(values.get('reason'));
      const next = D.tidy(values.get('next'));
      if (!Object.hasOwn(F.reviewActions, action) || !reason || !next || (['move', 'follow'].includes(action) && !target)) {
        throw new Error('Enter the blocker and next action. Add a date if moving the task or arranging a follow-up.');
      }
      await commit(data => {
        const row = D.byId(data.entries, previous.id);
        if (!row || !D.open(row) || row.editToken !== previous.editToken) throw new Error('This task changed. Open it again.');
        const at = D.stamp();
        const changes = [];
        if (action === 'move' && target !== row.date) {
          changes.push({ field: 'Planned date', before: row.date, after: target });
          row.originalDate ||= row.date;
          Object.assign(row, D.workflow.taskPlanChange(data, row, target), { date: target });
        }
        if (action === 'split' && !D.list(row.subtasks).some(item => item.title === next)) {
          row.subtasks = [...D.list(row.subtasks), { id: D.uid(), title: next, done: false }];
        }
        if (action === 'follow') {
          D.setTaskStatus(row, 'waiting', at);
          Object.assign(row, { followDate: target, followTime: '', waitingReason: next });
        }
        Object.assign(row, { rolloverReview: { at, date: previous.reviewDate, reason, next, action }, updatedAt: at, editToken: D.uid(),
          history: [...D.list(row.history), { at, action: 'Carryover reviewed', reason, note: next, changes }] });
      }, 'Next action saved.');
    }

    function practiceEdit({ id, course: courseId, session: sessionId }) {
      const row = id && D.byId(current().practiceQueue, id);
      const course = D.byId(current().learningCourses, row?.courseId || courseId);
      const session = sessionId && D.byId(current().learningSessions, sessionId);
      if (!course || id && !row) throw new Error('This practice item is no longer available.');
      form('plan-practice-form', row ? 'Edit practice' : 'Queue practice',
        '<input type="hidden" name="course" value="' + E(course.id) + '">' +
        '<input type="hidden" name="session" value="' + E(row?.sessionId || session?.id || '') + '">' +
        input('title', 'Practice exercise', row?.title || session?.nextAction || session?.takeaway, { wide: true, extra: ' maxlength="300" data-initial-focus' }) +
        input('minutes', 'Estimated minutes', row?.minutes || 25, { type: 'number', extra: ' min="1" max="240"' }), 'Save practice', row || null,
        '<p class="muted">' + E(course.title) + '</p>');
    }

    async function savePractice(element, previous) {
      const values = new FormData(element);
      const title = D.tidy(values.get('title'));
      const courseId = formValue(values, 'course');
      const sessionId = formValue(values, 'session');
      const minutes = number(values, 'minutes', 'Estimated practice time', 1, 240);
      if (!title || title.length > 300) throw new Error('Enter a practice exercise of up to 300 characters.');
      await commit(data => {
        if (!D.byId(data.learningCourses, courseId)) throw new Error('This course is no longer available.');
        saveRow(data.practiceQueue, previous, { title, courseId, sessionId, minutes, status: previous?.status || 'open' });
      }, 'Practice saved.');
    }

    function practiceList(course) {
      const rows = current().practiceQueue.filter(row => D.same(row.courseId, course.id));
      return rows.length ? '<details class="section-actions" open><summary>Practice queue (' + rows.filter(row => row.status === 'open').length + ' open)</summary>' +
        rows.map(row => '<article class="plan-review-row"><div><strong>' + E(row.title) + '</strong><small>' +
          E(duration(row.minutes) + (row.status === 'done' ? ' · Done' : '')) + '</small></div><div class="actions">' +
          short('Edit', 'plan-practice', { id: row.id }) + (row.status === 'open' ? short('Log practice', 'plan-time-log',
            { kind: 'practice', source: row.id, title: row.title, category: 'learning' }) :
            short('Reopen', 'plan-practice-reopen', { id: row.id })) + '</div></article>').join('') + '</details>' : '';
    }

    function timeEdit({ id, kind = '', source = '', title = '', category = '', date: day }) {
      const row = id && D.byId(current().timeLogs, id);
      if (id && !row) throw new Error('This time entry is no longer available.');
      const today = now().date;
      const fields = '<input type="hidden" name="sourceType" value="' + E(row?.sourceType || kind) + '">' +
        '<input type="hidden" name="sourceId" value="' + E(row?.sourceId || source) + '">' +
        input('title', 'Activity', row?.title || title, { wide: true, extra: ' maxlength="300" data-initial-focus' }) +
        select('category', 'Category', F.categories, row?.category || category || 'personal') +
        dateInput('date', 'Date spent', row?.date || (day && day <= today ? day : today)) +
        input('minutes', 'Actual minutes spent', row?.minutes || '', { type: 'number', extra: ' min="1" max="1440"' }) +
        (!row && kind === 'practice' ? check('done', 'Mark practice done', true) : '');
      const task = kind === 'task' && D.byId(current().entries, source);
      const recorded = task?.actualMinutes ? '<p class="muted">' + E(duration(task.actualMinutes) + ' already recorded on this task for ' +
        date(task.actualDate || task.date) + '.') + '</p>' : '';
      form('plan-time-form', row ? 'Edit logged time' : 'Log actual time', fields, 'Save time', row || null, recorded,
        row ? btn('Delete time log', 'plan-time-remove', { id: row.id }, { cls: 'danger' }) : '');
    }

    async function saveTime(element, previous) {
      const values = new FormData(element);
      const title = D.tidy(values.get('title'));
      const category = formValue(values, 'category');
      const day = readDate(values, 'date', 'the date spent', true);
      const minutes = number(values, 'minutes', 'Actual time', 1, 1440);
      const sourceType = formValue(values, 'sourceType');
      const sourceId = formValue(values, 'sourceId');
      if (!title || title.length > 300 || day > now().date || !Object.hasOwn(F.categories, category)) {
        throw new Error('Enter an activity, a category, and a date up to today.');
      }
      await commit(data => {
        saveRow(data.timeLogs, previous, { title, category, date: day, minutes, sourceType, sourceId });
        if (sourceType === 'practice' && values.has('done')) {
          const row = D.byId(data.practiceQueue, sourceId);
          if (row?.status === 'open') Object.assign(row, { status: 'done', completedAt: D.stamp(), updatedAt: D.stamp(), editToken: D.uid() });
        }
      }, 'Actual time saved.');
    }

    function removeTime({ id }) {
      ask('Delete this time log?', 'The time totals will recalculate.', 'Delete time log', async () => {
        await commit(data => { data.timeLogs = data.timeLogs.filter(row => !D.same(row.id, id)); }, 'Time log deleted.');
        closeDialog(true);
      });
    }

    function reportPreset(key) {
      const today = now().date;
      if (key === 'all') return ['', ''];
      if (key === 'month') return [D.monthRange(today)[0], today];
      return [D.addDays(today, -6), today];
    }

    async function saveReportRange(element) {
      const values = new FormData(element);
      const start = readDate(values, 'start', 'the from date');
      const end = readDate(values, 'end', 'the through date');
      if (start && end && end < start) throw new Error('Choose a through date on or after the from date.');
      reportRange = [start, end];
      render();
    }

    function reportPage() {
      const [start, end] = reportRange || reportPreset('week');
      const report = F.timeReport(current(), start, end);
      const filters = '<div class="actions">' + short('Last 7 days', 'plan-report-range', { key: 'week' }) +
        short('This month', 'plan-report-range', { key: 'month' }) + short('All recorded time', 'plan-report-range', { key: 'all' }) + '</div>' +
        '<form id="plan-time-range" class="form-grid plan-report-range" novalidate>' + dateInput('start', 'From', start) + dateInput('end', 'Through', end) +
        '<div class="wide"><button type="submit" class="small">Apply dates</button></div></form>';
      const totals = '<div class="plan-time-totals"><strong>' + E(duration(report.minutes) + ' recorded') + '</strong>' +
        report.totals.map(([key, minutes]) => chip(F.categories[key] + ' · ' + duration(minutes))).join('') + '</div>';
      const rows = report.rows.map(row => '<article class="plan-review-row"><div><strong>' + E(row.title) + '</strong><small>' +
        E([date(row.date), F.categories[row.category], duration(row.minutes), row.source].join(' · ')) + '</small></div>' +
        (row.source === 'Time log' ? short('Edit', 'plan-time-log', { id: row.id }) : '') + '</article>').join('');
      return panel('Where your time went', filters + totals + (rows || empty('No actual time logged in this period.')),
        '<div class="actions">' + short('Log time', 'plan-time-log', {}, { cls: 'primary small' }) + short('Download CSV', 'plan-time-csv') + '</div>');
    }

    function downloadTime() {
      const [start, end] = reportRange || reportPreset('week');
      const label = [start, end].filter(Boolean).join('_to_') || 'all';
      download(F.timeCsv(F.timeReport(current(), start, end)), 'Diary_Time_Report_' + label + '.csv', 'text/csv;charset=utf-8');
    }

    function closeoutEdit({ date: day, shift }) {
      if (!D.dutyWindow({ date: day, shift }) || !current().roster.some(row => row.date === day && row.shift === shift)) {
        throw new Error('Save the working duty to the roster before closing it out.');
      }
      const data = current();
      const saved = D.byId(data.shiftCloseouts, F.closeoutId(day, shift));
      const items = F.closeoutItems(data, day, shift);
      const suggested = new Set((saved?.openIds || D.pendingHandover(data, day, shift).map(item => item.row.id)).map(D.str));
      const closed = new Set((saved?.closedIds || items.completed.map(row => row.id)).map(D.str));
      const checks = (rows, key, chosen) => rows.map(row => {
        const waiting = row.status === 'waiting' && (row.waitingOn || row.person);
        return '<label class="check"><input type="checkbox" name="' + key + '" value="' + E(row.id) + '"' +
          (chosen.has(D.str(row.id)) ? ' checked' : '') + '><span>' + E(row.title + (waiting ? ' · Waiting on ' + waiting : '')) + '</span></label>';
      }).join('');
      form('plan-closeout-form', 'Five-minute shift closeout',
        '<fieldset class="wide"><legend>Confirm what closed</legend><div class="link-picker">' +
        (checks(items.completed, 'closed', closed) || empty('No closures recorded during this duty.')) + '</div></fieldset>' +
        '<fieldset class="wide"><legend>Carry open items and responses</legend><div class="link-picker">' +
        (checks(items.open, 'open', suggested) || empty('No open work items for this duty.')) + '</div></fieldset>' +
        input('firstAction', 'First action for the next duty', saved?.firstAction, { wide: true, extra: ' maxlength="500"' }) +
        textarea('notes', 'Shift notes', saved?.notes), 'Save closeout', { date: day, shift, updatedAt: saved?.updatedAt },
        '<p class="muted">' + E(date(day) + ' · ' + shift) + '</p>',
        saved ? btn('Copy saved handover draft', 'plan-copy-handover', { date: day, shift }) : '');
    }

    async function saveCloseout(element, duty) {
      const values = new FormData(element);
      const closedIds = new Set(values.getAll('closed'));
      const openIds = new Set(values.getAll('open'));
      const firstAction = D.tidy(values.get('firstAction'));
      const notes = D.tidy(values.get('notes'));
      await commit(data => {
        const { date: day, shift } = duty;
        const id = F.closeoutId(day, shift);
        const row = D.byId(data.shiftCloseouts, id);
        if (row?.updatedAt !== duty.updatedAt || !data.roster.some(item => item.date === day && item.shift === shift)) {
          throw new Error('The roster or closeout changed. Reopen it to review.');
        }
        const items = F.closeoutItems(data, day, shift);
        const completed = items.completed.filter(item => closedIds.has(D.str(item.id)));
        const open = items.open.filter(item => openIds.has(D.str(item.id)));
        if (completed.length !== closedIds.size || open.length !== openIds.size) throw new Error('One or more selected items changed. Reopen the closeout.');
        const at = D.stamp();
        const fields = { id, date: day, shift, firstAction, notes, closedIds: completed.map(item => item.id), openIds: open.map(item => item.id),
          draftText: F.handoverDraft(data, day, shift, completed, open, firstAction, notes), updatedAt: at };
        if (row) Object.assign(row, fields);
        else data.shiftCloseouts.push({ ...fields, createdAt: at });
      }, 'Closeout saved. Copy the handover draft from this duty.');
    }

    function closeoutButtons(day, shift) {
      if (!current().roster.some(row => row.date === day && row.shift === shift && D.SHIFT[shift]?.start)) return '';
      const saved = D.byId(current().shiftCloseouts, F.closeoutId(day, shift));
      return short(saved ? 'View closeout' : 'Shift closeout', 'plan-closeout', { date: day, shift }) +
        (saved ? short('Copy handover', 'plan-copy-handover', { date: day, shift }) : '');
    }

    function quickPick({ minutes = '15', place } = {}) {
      const local = now();
      const location = place || (current().roster.some(row => {
        const duty = F.dutyWindow(current(), row);
        const time = D.instant(local.date, local.time);
        return duty && time >= duty.start && time < duty.end;
      }) ? 'plant' : 'home');
      const choices = [15, 30, 60].map(value => short(value + ' min', 'plan-find-now', { minutes: value, place: location },
        { pressed: Number(minutes) === value })).join('');
      const places = short('At the plant', 'plan-find-now', { minutes, place: 'plant' }, { pressed: location === 'plant' }) +
        short('At home', 'plan-find-now', { minutes, place: 'home' }, { pressed: location === 'home' });
      const result = P.findNow(current(), Number(minutes), location);
      const title = result.row?.title || result.practice?.title || result.title;
      const log = result.practice ? { kind: 'practice', source: result.practice.id, title, category: 'learning' } :
        result.row ? { kind: result.row.type, source: result.row.id, title, category: result.row.scope === 'work' ? 'work' : 'personal' } :
          { title, category: 'learning' };
      const action = result.row ? short('Open task', 'entry-view', { id: result.row.id }) : '';
      openDialog('plan-quick-pick', 'What can I finish now?', '<div class="actions section-actions">' + choices + '</div><div class="actions">' + places +
        '</div><div class="section-actions">' + (title ? '<h3>' + E(title) + '</h3><p>' + E(duration(result.minutes) + ' estimate · ' +
          duration(result.available) + ' available') + '</p><div class="actions">' + action + short('Log time', 'plan-time-log', log) + '</div>' :
          empty(result.available ? 'No ready task or practice fits the ' + duration(result.available) + ' available now.' :
            'A fixed block is using this time.')) + '</div>', btn('Close', 'close-dialog'));
    }

    function periodItems(items, day) {
      if (!items.length) return '';
      const list = items.map(item => {
        const { row, prep, adjustment, course, assignment } = item;
        const title = row && (!row.forecast || row.virtual) ? btn(item.title, 'entry-view', { id: remember(row) }, { cls: 'row-title' }) :
          assignment ? btn(item.title, 'portfolio-open', { id: assignment.id }, { cls: 'row-title' }) : '<strong>' + E(item.title) + '</strong>';
        const edit = row ? P.tracked(row) ? adjustTaskButton(row) : D.timed(row) ?
          short('Adjust time', row.planLockCategory && !row.virtual ? 'plan-lock' : 'entry-edit', { id: remember(row) }) : '' :
          assignment ? short('Progress', 'progress-edit', { type: 'assignment', id: assignment.id }) +
            short('Edit assignment', 'portfolio-edit', { id: assignment.id }) +
            short('Schedule task', 'quick-task', { assignment: assignment.id, schedule: 'yes', date: day || state.date }) :
          adjustment ? short('Adjust time', 'plan-adjust-block', { type: adjustment.blockType, 'anchor-date': adjustment.anchorDate,
            shift: adjustment.shift }) : course ? short('Adjust session', 'course-edit', { id: course.id }) : '';
        const prepare = prep ? (row?.type === 'task' && !row.forecast && !row.shiftScheduleKey ? short('Plan prep', 'plan-adjust-task', { id: row.id, date: prep }) :
          short('Add prep task', 'plan-new-task', { title: 'Prepare · ' + item.title, date: prep })) : '';
        return '<li><div>' + title + '<small>' + E([item.label, item.time, prep && 'Prepare on ' + date(prep)].filter(Boolean).join(' · ')) +
          '</small></div>' + (edit || prepare ? '<div class="actions">' + edit + prepare + '</div>' : '') + '</li>';
      }).join('');
      return '<ul class="plan-period-items">' + list + '</ul>';
    }

    function periodPage(mode) {
      const startOfWeek = D.weekStart(state.date);
      const [start, end] = mode === 'month' ? D.monthRange(state.date) :
        mode === 'week' ? [startOfWeek, D.addDays(startOfWeek, 6)] : [state.date, D.addDays(state.date, 29)];
      const cards = F.period(current(), start, end).map(day => {
        const stickies = mode !== 'lookahead' && day.shiftRows.length ? '<details class="period-stickies" data-keep-open="period-' + E(day.date) +
          '"><summary>Shift stickies (' + day.shiftRows.length + ')</summary>' + periodItems(day.shiftRows) + '</details>' : '';
        return '<section class="plan-period-day"><div class="plan-period-head">' + short(date(day.date), 'navigate',
          { view: 'dayplan', sub: 'day', date: day.date }) + chip(day.duty?.shift) + '</div>' + periodItems(day.rows, day.date) + stickies +
          '<details class="period-add"><summary>Add to day</summary><div class="actions">' + short('Add task', 'plan-new-task', { date: day.date }) +
          short('Lock time', 'plan-lock', { date: day.date }) + '</div></details></section>';
      });
      const label = mode === 'week' ? 'Week plan' : mode === 'month' ? 'Month plan' : '30-day lookahead';
      return panel(label, '<div class="plan-period-grid">' + cards.join('') + '</div>', '', periodLabel(start, end));
    }

    function weeklyPage() {
      const start = D.weekStart(state.date);
      const end = D.addDays(start, 6);
      const report = F.weekly(current(), start, end, now().date);
      const onTime = new Set(report.onTime.map(item => D.str(item.row.id)));
      const late = new Set(report.late.map(item => D.str(item.row.id)));
      const completed = report.completed.map(({ row, date: done }) => '<article class="plan-review-row"><div>' +
        btn(row.title, 'entry-view', { id: row.id }, { cls: 'row-title' }) + '<small>' + E('Closed ' + date(done)) + '</small></div>' +
        chip(onTime.has(D.str(row.id)) ? 'On time' : late.has(D.str(row.id)) ? 'Late' : row.dueDate ? 'Time unrecorded' : 'No due date') + '</article>').join('');
      const metrics = '<div class="plan-time-totals">' + chip(report.completed.length + ' closed') + chip(report.onTime.length + ' on time') +
        chip(report.late.length + ' late') + chip(duration(report.time.totals.find(([key]) => key === 'learning')?.[1]) + ' learning') + '</div>';
      return panel('Weekly review', metrics + (completed || empty('No closures recorded this week.')) +
        (report.carry.length ? carryList(end < now().date ? end : now().date) : empty('No repeat carryovers flagged.')),
        short('Time report', 'plan-view', { value: 'report' }), periodLabel(start, end));
    }

    function adjustTaskButton(row, block = null) {
      if (!P.tracked(row)) return '';
      if (row.virtual) return short('Edit occurrence', 'entry-edit', { id: remember(row) });
      const start = block && D.parts(block.start);
      const label = D.workflow.isSticky(row) || row.shiftScheduleKey ? 'Adjust sticky' : 'Adjust task';
      return short(label, 'plan-adjust-task', { id: row.id, 'start-date': start?.date, 'start-time': start?.time,
        minutes: block ? (block.end - block.start) / F.minute : '',
        'forecast-day': row.forecast ? row.routineDate || row.shiftStickyDay || row.dutyDate || row.date : '' });
    }

    function blockActions(block, day) {
      const actions = [];
      if (block.kind === 'duty') {
        if (current().roster.some(row => row.date === block.date && row.shift === block.shift)) {
          actions.push(short('Adjust duty time', 'plan-finish', { date: block.date, shift: block.shift }));
          if (block.date <= now().date) actions.push(closeoutButtons(block.date, block.shift));
        }
      } else if (block.adjustable) {
        const start = D.parts(block.start);
        actions.push(short('Adjust time', 'plan-adjust-block', { type: block.adjustable.type, 'anchor-date': block.adjustable.anchorDate,
          shift: block.adjustable.shift, date: start.date, time: start.time, title: block.title, minutes: (block.end - block.start) / F.minute }));
      } else if (block.kind === 'personal') {
        const start = D.parts(block.start);
        const end = D.parts(block.end);
        actions.push(short('Adjust time', 'plan-lock', { date: start.date, time: start.time, title: block.title,
          'end-time': end.time, 'end-date': end.date }));
      } else if (block.kind === 'locked' && !block.row.virtual) actions.push(short('Edit lock', 'plan-lock', { id: block.row.id }));
      else if (block.row && P.tracked(block.row)) actions.push(adjustTaskButton(block.row, block));
      else if (block.row && D.timed(block.row)) actions.push(short('Adjust time', 'entry-edit', { id: remember(block.row) }));
      else if (block.kind === 'study' && block.booked && block.course) actions.push(short('Adjust session', 'course-edit', { id: block.course.id }));
      if (day <= now().date && block.start <= Date.now() && block.kind !== 'study') {
        const category = block.category || (block.kind === 'rest' ? 'rest' : block.kind === 'meal' ? 'meal' :
          block.row?.scope === 'work' ? 'work' : 'personal');
        actions.push(short('Log time', 'plan-time-log', { date: day, title: block.row?.title || block.title, category,
          kind: block.row?.type || '', source: block.row?.id || '' }));
      }
      return actions.join('');
    }

    return { dayControls, blockActions, adjustTaskButton, change, closeoutButtons, carryList, practiceList, periodItems, periodPage, weeklyPage, reportPage,
      forms: { 'plan-finish-form': saveFinish, 'plan-lock-form': saveLock, 'plan-task-form': saveTask, 'plan-block-form': saveBlock, 'plan-rollover-form': saveRollover,
        'plan-practice-form': savePractice, 'plan-time-form': saveTime, 'plan-time-range': saveReportRange, 'plan-closeout-form': saveCloseout },
      actions: { 'plan-finish': finishEdit, 'plan-finish-reset': resetFinish, 'plan-lock': lockEdit, 'plan-lock-remove': removeLock,
        'plan-adjust-block': adjustBlock, 'plan-block-reset': resetBlock,
        'plan-adjust-task': taskAdjust, 'plan-book-dcs': bookDcs, 'plan-rollover': rolloverEdit, 'plan-practice': practiceEdit, 'plan-time-log': timeEdit,
        'plan-time-remove': removeTime, 'plan-time-csv': downloadTime, 'plan-report-range': ({ key }) => { reportRange = reportPreset(key); render(); },
        'plan-practice-reopen': ({ id }) => commit(data => {
          const row = D.byId(data.practiceQueue, id);
          if (row?.status === 'done') Object.assign(row, { status: 'open', completedAt: '', updatedAt: D.stamp(), editToken: D.uid() });
        }, 'Practice reopened.'),
        'plan-closeout': closeoutEdit, 'plan-copy-handover': ({ date: day, shift }) => {
          const row = D.byId(current().shiftCloseouts, F.closeoutId(day, shift));
          if (!row) throw new Error('Save a closeout before copying its handover.');
          return copyText(row.draftText, 'Copy handover draft');
        }, 'plan-find-now': quickPick, 'plan-new-task': ({ date: day, title }) => newTask(day, title) }
    };
  };
})(Diary);
