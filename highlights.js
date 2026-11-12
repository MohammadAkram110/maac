/* Quick shift highlights share the existing duty report and its version history. */
(function (D) {
  'use strict';

  const duties = { '': 'Choose shift', ...Object.fromEntries(D.WORKING_SHIFTS.map(shift => [shift, shift])) };
  const working = shift => !!D.SHIFT[shift]?.start;
  const reportFor = (data, day, shift) => data.reports.find(row => !row.deletedAt && row.date === day && row.shift === shift);

  D.createShiftHighlights = function (ui) {
    const { state, current, E, btn, empty, page, panel, dateNav, select, openDialog, render, commit, copyText, versionOf } = ui;
    const N = D.notebook;
    let selection;

    function show(date, shift) {
      selection = working(shift) ? { date, shift } : null;
    }

    function selected(data, day) {
      if (selection?.date === day) return selection.shift;
      const duty = data.roster.find(row => row.date === day);
      return working(duty?.shift) ? duty.shift : data.reports.find(row => !row.deletedAt && row.date === day)?.shift || '';
    }

    function pageView() {
      const data = current();
      const day = state.date;
      const shift = selected(data, day);
      const report = reportFor(data, day, shift);
      const content = N.render(report?.sections?.highlights, report?.noteStyles?.highlights);
      const body = content || empty(shift ? 'Add the key updates for this duty.' : 'Choose a shift for this date.');
      const write = btn(content ? 'Edit highlights' : 'Write highlights', 'highlights-edit', { date: day, shift },
        { cls: 'primary small', icon: content ? 'edit' : 'plus', disabled: !shift });
      const tools = report ? '<div class="actions">' +
        (D.tidy(report.sections?.highlights) ? btn('Copy for email', 'highlights-copy', { id: report.id }, { cls: 'small' }) : '') +
        btn('Open shift report', 'report-view', { id: report.id }, { cls: 'small' }) + '</div>' : '';
      const other = report && Object.entries(D.REPORT).filter(([key]) => key !== 'highlights' && D.tidy(report.sections[key]))
        .map(([key, label]) => '<section><h3>' + E(label) + '</h3>' + N.render(report.sections[key], report.noteStyles?.[key]) + '</section>').join('');
      const recent = data.reports.filter(row => !row.deletedAt && row.id !== report?.id && D.tidy(row.sections?.highlights))
        .sort((a, b) => b.date.localeCompare(a.date) || D.str(b.updatedAt).localeCompare(D.str(a.updatedAt))).slice(0, 6);
      const history = recent.length ? panel('Recent highlights', '<div class="rows">' + recent.map(row => '<article class="row">' +
        btn(D.formatDate(row.date) + ' · ' + row.shift, 'navigate', { view: 'highlights', date: row.date, shift: row.shift }, { cls: 'row-title' }) +
        '</article>').join('') + '</div>') : '';
      return page('', 'Shift Highlights', D.formatDate(day), dateNav()) +
        '<div class="highlights-toolbar">' + select('highlightShift', 'Shift', duties, shift, ' data-highlight-shift') + write + '</div>' +
        '<div class="stack">' + panel('Highlights', '<div class="highlight-note">' + body + '</div>' +
          (other ? '<details class="highlight-sections"><summary>Other report sections</summary>' + other + '</details>' : ''), tools,
        report ? report.status === 'ready' ? 'Ready report' : 'Report draft' : '') + history + '</div>';
    }

    function edit({ date, shift }) {
      const day = D.parseDate(date);
      if (!day || !working(shift)) throw new Error('Choose a date and working shift for these highlights.');
      const report = reportFor(current(), day, shift);
      openDialog('shift-highlights', 'Write shift highlights', '<p class="muted">' + E(D.formatDate(day) + ' · ' + shift) + '</p>' +
        '<form id="shift-highlights-form" class="form-grid" novalidate>' +
        N.field('highlights', 'Shift highlights', report?.sections?.highlights, 'Key events, completed work or points for the next shift') +
        '</form>', btn('Cancel', 'close-dialog') +
        '<button type="submit" form="shift-highlights-form" class="primary">Save highlights</button>',
        { row: { day, shift, id: report?.id, editToken: report?.editToken }, noteStyles: report?.noteStyles });
    }

    async function save(form, previous) {
      const values = new FormData(form);
      const text = D.str(values.get('highlights'));
      await commit(data => {
        const existing = reportFor(data, previous.day, previous.shift);
        if (!D.same(existing?.id, previous.id) || existing?.editToken !== previous.editToken) {
          throw new Error('This report changed. Reopen its highlights before saving.');
        }
        const at = D.stamp();
        const noteStyles = N.capture(values, existing?.noteStyles);
        if (!existing && !D.tidy(text) && !noteStyles?.highlights) throw new Error('Write at least one highlight to save.');
        if (existing && D.str(existing.sections.highlights) === text && JSON.stringify(noteStyles) === JSON.stringify(existing.noteStyles)) return false;
        const fields = { sections: { ...existing?.sections, highlights: text }, noteStyles,
          status: 'draft', updatedAt: at, editToken: D.uid() };
        if (existing) {
          existing.versions = [...D.list(existing.versions), versionOf(existing)];
          Object.assign(existing, fields);
        } else data.reports.push({ id: D.uid(), date: previous.day, shift: previous.shift, createdAt: at, sources: [], versions: [], ...fields });
      }, 'Shift highlights saved to the report draft.');
    }

    function copy({ id }) {
      const row = D.byId(current().reports, id);
      if (!row || row.deletedAt || !D.tidy(row.sections?.highlights)) return;
      return copyText('Shift highlights · ' + D.formatDate(row.date) + ' · ' + row.shift + '\n\n' + row.sections.highlights, 'Copy shift highlights');
    }

    function change(control) {
      if (!control.matches('[data-highlight-shift]')) return false;
      selection = { date: state.date, shift: working(control.value) ? control.value : '' };
      render();
      return true;
    }

    return { page: pageView, show, edit, save, copy, change };
  };
})(Diary);
