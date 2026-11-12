/* Dated updates and a shared next follow-up for diary work. */
(function (D) {
  'use strict';

  const validDay = value => typeof value === 'string' && !!value && D.parseDate(value) === value;
  const validPercent = value => Number.isInteger(value) && value >= 0 && value <= 100;
  const supports = row => row && ['task', 'followup', 'mwr'].includes(row.type);
  const required = D.hierarchy.required;
  const entryPercent = row => D.open(row) ? row.progressPercent ?? 0 : 100;
  const latestFirst = (a, b) => b.update.date.localeCompare(a.update.date) || b.update.at.localeCompare(a.update.at);

  function task(row, tree) {
    const children = tree.children(row);
    const remaining = tree.openChildren(row).length;
    const percent = children.length ?
      Math.floor(children.reduce((sum, item) => sum + task(item, tree).percent, 0) / children.length) : entryPercent(row);
    return { percent, complete: children.length - remaining, total: children.length, remaining };
  }

  function assignment(data, row, tree = D.hierarchy.index(data)) {
    const items = D.hierarchy.assignmentRoots(data, row.id, tree).filter(item => required(item, tree));
    const complete = items.filter(item => !D.open(item) && !tree.blocked(item)).length;
    const percent = row.completedAt ? 100 : items.length ?
      Math.floor(items.reduce((sum, item) => sum + task(item, tree).percent, 0) / items.length) : row.progressPercent ?? 0;
    return { percent, complete, total: items.length, remaining: items.length - complete };
  }

  function linkedUpdates(roots, tree) {
    const rows = roots.slice();
    const seen = new Set();
    const updates = [];
    for (const source of rows) {
      const id = D.str(source.id);
      if (seen.has(id)) continue;
      seen.add(id);
      rows.push(...tree.children(source));
      const original = source.sourceTaskId && tree.tasks.get(D.str(source.sourceTaskId));
      if (original) rows.push(original);
      for (const update of D.list(source.progressUpdates)) {
        if (D.tidy(update.note)) updates.push({ source, update });
      }
      const note = D.tidy(source.closeNotes || source.closingComment);
      const closedAt = source.completedAt;
      if (!D.open(source) && note && closedAt && Number.isFinite(Date.parse(closedAt)) &&
          !D.list(source.progressUpdates).some(update => update.note === note)) {
        updates.push({ source, update: { date: source.closedDate || D.parts(closedAt).date, at: closedAt, note } });
      }
    }
    return updates.sort(latestFirst);
  }

  function validate(data) {
    for (const row of [...data.entries.filter(supports), ...data.assignments]) {
      if (row.progressPercent != null && !validPercent(row.progressPercent) ||
          row.followStep != null && (typeof row.followStep !== 'string' || row.followStep.length > 500) ||
          row.assignmentRequired != null && typeof row.assignmentRequired !== 'boolean') {
        throw new Error('An item has an invalid progress or follow-up setting.');
      }
      if (row.progressUpdates == null) continue;
      if (!Array.isArray(row.progressUpdates)) throw new Error('An item has invalid progress updates.');
      const ids = new Set();
      for (const update of row.progressUpdates) {
        if (!update || typeof update.id !== 'string' || !update.id || ids.has(update.id) || !validDay(update.date) ||
            typeof update.at !== 'string' || !Number.isFinite(Date.parse(update.at)) ||
            typeof update.note !== 'string' || update.note.length > 3000 || !validPercent(update.percent) ||
            update.result != null && typeof update.result !== 'boolean' ||
            typeof update.followStep !== 'string' || update.followStep.length > 500 ||
            update.followDate && !validDay(update.followDate) || update.followTime && (!update.followDate || !D.timePattern.test(update.followTime))) {
          throw new Error('An item has an invalid dated progress update.');
        }
        ids.add(update.id);
      }
    }
  }

  const followText = row => row.followDate ? [D.formatDate(row.followDate), row.followTime, row.followStep].filter(Boolean).join(' · ') : '';
  D.progress = { supports, required, entryPercent, task, assignment, validate, followText };

  D.createProgressUI = function (ui) {
    const { current, now, E, btn, input, textarea, check, dateInput, timeInput, readDate, readTime, openDialog, commit } = ui;
    const openItem = (data, type, id) => type === 'assignment' ? D.portfolio.active(data, id) :
      D.byId(data.entries, id);
    const validItem = (row, type) => row && (type === 'assignment' || supports(row) && D.active(row));

    function panel(row, type = 'entry', branchIndex) {
      if (!validItem(row, type) || row.virtual) return '';
      const data = current();
      const tree = branchIndex || D.hierarchy.index(data);
      const work = type === 'assignment' ? assignment(data, row, tree) : task(row, tree);
      const percent = work.percent;
      const label = work.total ? work.complete + ' of ' + work.total + ' required items complete · ' + percent + '%' : percent + '% complete';
      const follow = (type === 'assignment' ? !row.completedAt : D.open(row)) ? followText(row) : '';
      const updates = D.list(row.progressUpdates).slice().sort((a, b) => b.date.localeCompare(a.date) || b.at.localeCompare(a.at));
      const recent = updates[0];
      const roots = type === 'assignment' ? D.hierarchy.assignmentRoots(data, row.id, tree) : tree.children(row);
      const linked = linkedUpdates(roots, tree);
      const linkedLatest = linked[0];
      const linkedPanel = linked.length ? '<details class="progress-history linked-results" data-keep-open="linked-results-' + E(row.id) + '">' +
        '<summary>Linked results (' + linked.length + ')</summary><ul>' + linked.map(({ source, update }) =>
          '<li><time>' + E(D.formatDate(update.date)) + '</time>' + btn(source.title, 'entry-view', { id: source.id }, { cls: 'row-title' }) +
          '<p>' + E(update.note) + '</p></li>').join('') + '</ul></details>' : '';
      const history = updates.length ? '<details class="progress-history"><summary>Progress history (' + updates.length + ')</summary><ul>' +
        updates.map(update => '<li><time>' + E(D.formatDate(update.date)) + '</time><span>' +
          E((update.result ? 'Result · ' : '') + update.percent + '%') + '</span>' +
          (update.note ? '<p>' + E(update.note) + '</p>' : '') + (update.followDate ? '<small>' + E('Next follow-up · ' + followText(update)) + '</small>' : '') +
          '</li>').join('') + '</ul></details>' : '';
      return '<section class="progress-panel" aria-label="Progress and follow-up"><div class="panel-head"><div><h3>Progress &amp; follow-up</h3>' +
        '<small>' + E(label) + '</small></div><div class="actions">' + btn('Log update', 'progress-edit', { id: row.id, type }, { cls: 'small' }) +
        (row.type === 'task' ? btn('Record result', 'progress-edit', { id: row.id, result: 'yes' }, { cls: 'small' }) : '') + '</div></div>' +
        '<progress max="100" value="' + percent + '" aria-label="Completion progress"></progress>' +
        (follow ? '<p class="progress-follow"><strong>Next follow-up</strong> ' + E(follow) + '</p>' : '') +
        (recent?.note ? '<p class="progress-latest">' + E(D.formatDate(recent.date) + ' · ' + recent.note) + '</p>' : '') +
        (linkedLatest ? '<p class="progress-latest"><strong>Latest linked result</strong> ' +
          E(linkedLatest.source.title + ' · ' + D.formatDate(linkedLatest.update.date) + ' · ' +
            (linkedLatest.update.note.length > 240 ? linkedLatest.update.note.slice(0, 239) + '…' : linkedLatest.update.note)) + '</p>' : '') +
        history + linkedPanel + '</section>';
    }

    function edit({ id, type = 'entry', result: kind }) {
      const data = current();
      const row = openItem(data, type, id);
      if (!validItem(row, type)) throw new Error('This item is no longer available.');
      const tree = D.hierarchy.index(data);
      const work = type === 'assignment' ? assignment(data, row, tree) : task(row, tree);
      const closed = type === 'assignment' ? !!row.completedAt : !D.open(row);
      const result = kind === 'yes';
      const percent = closed || work.total || result ? '' : input('percent', 'Progress (%)', row.progressPercent ?? 0,
        { type: 'number', extra: ' min="0" max="100" step="1"' });
      const complete = result && row.type === 'task' && !closed && !work.remaining;
      const parent = tree.parent(row);
      const portfolio = row.portfolioId && D.portfolio.active(data, row.portfolioId);
      const destination = result && (parent || portfolio) ? '<p class="muted">' +
        E('Visible in Linked results on ' + D.unique([parent?.title, portfolio?.title].filter(Boolean)).join(' and ') + '.') + '</p>' : '';
      const fields = dateInput('date', result ? 'Result date' : 'Update date', now().date) + percent +
        textarea('note', result ? 'Result or feedback' : 'Progress note', '', 'What changed or what did you find?') +
        (complete ? '<div class="wide">' + check('complete', 'Mark ' + (D.workflow.isSticky(row) ? 'sticky' : 'task') + ' done', false) + '</div>' : '') +
        (closed ? '' : dateInput('followDate', 'Next follow-up date (optional)', row.followDate) + timeInput('followTime', 'Follow-up time (optional)', row.followTime) +
          input('followStep', 'What to check next', row.followStep, { wide: true, extra: ' maxlength="500"' }));
      openDialog('progress', result ? 'Record result' : 'Progress & follow-up', '<p class="muted">' + E(row.title) + '</p>' + destination +
        '<form id="work-progress-form" class="form-grid" novalidate>' + fields + '</form>', btn('Cancel', 'close-dialog') +
        '<button class="primary" type="submit" form="work-progress-form">' + (result ? 'Save result' : 'Save update') + '</button>',
        { row: { id, type, result, editToken: row.editToken } });
    }

    async function save(form, previous) {
      const values = new FormData(form);
      const date = readDate(values, 'date', 'the update date', true);
      const followDate = readDate(values, 'followDate', 'the next follow-up date');
      const followTime = readTime(values, 'followTime', 'the follow-up time');
      const followStep = D.tidy(values.get('followStep'));
      const note = D.str(values.get('note')).trim();
      const percent = values.has('percent') ? Number(values.get('percent')) : null;
      if (followTime && !followDate) throw new Error('Choose a date for the follow-up time.');
      if (percent !== null && !validPercent(percent)) throw new Error('Enter a whole progress percentage from 0 to 100.');
      if (note.length > 3000 || followStep.length > 500) throw new Error('Shorten the progress note or next step.');
      if (previous.result && !note) throw new Error('Enter the result or feedback.');
      await commit(data => {
        const { id, type, editToken } = previous;
        const row = openItem(data, type, id);
        if (!validItem(row, type) || row.editToken !== editToken) throw new Error('This item changed. Open it again before saving.');
        const at = D.stamp();
        if (percent !== null) row.progressPercent = percent;
        const tree = D.hierarchy.index(data);
        if (previous.result && values.has('complete')) {
          if (row.type !== 'task' || !D.open(row) || tree.blocked(row)) throw new Error('Complete the linked work before closing this item.');
          D.setTaskStatus(row, 'done', at);
          row.closedDate = date;
        }
        const snapshot = type === 'assignment' ? assignment(data, row, tree).percent : task(row, tree).percent;
        const update = { id: D.uid(), date, at, note, percent: snapshot, followDate, followTime, followStep, ...(previous.result ? { result: true } : {}) };
        if (values.has('followDate')) Object.assign(row, { followDate, followTime, followStep });
        Object.assign(row, { progressUpdates: [...D.list(row.progressUpdates), update], updatedAt: at, editToken: D.uid() });
      }, previous.result ? 'Result saved.' : 'Progress update saved.');
    }

    return { panel, save, edit };
  };
})(Diary);
