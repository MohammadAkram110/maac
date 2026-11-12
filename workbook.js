/* A plain .xlsx export with readable sheets and text-safe cells. No runtime dependencies. */
(function (D) {
  'use strict';
  const mime = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  const xmlHead = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
  const NS = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
  const REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
  const rows = D.list;
  const text = D.str;
  const date = D.formatDate;
  const time = D.formatStamp;
  const yes = value => value ? 'Yes' : '';
  const xml = value => text(value).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\ufffe\uffff]/g, '')
    .replace(/_x[0-9a-fA-F]{4}_/g, match => '_x005F_' + match.slice(1))
    .replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[char]);
  const noteList = list => rows(list).map(item => item.title).join('\n');
  const json = value => value == null ? '' : JSON.stringify(value, null, 2);

  function col(n) {
    let result = '';
    for (n += 1; n > 0; n = Math.floor((n - 1) / 26)) result = String.fromCharCode(65 + (n - 1) % 26) + result;
    return result;
  }

  function records(data) {
    const result = [];
    const put = (name, headers, values) => result.push({ name, values: [headers, ...values] });
    const about = [
      ['App', 'My Shift & Life Digital Diary'], ['Time zone', D.ZONE], ['Export time', time(D.stamp())],
      ['Record count', data.entries.length], ['Backup', 'Use the JSON backup to restore records and attachment files.'],
      ...Object.entries(data.settings).map(([key, value]) => [key, typeof value === 'boolean' ? (value ? 'On' : 'Off') : value])
    ];
    put('About', ['Item', 'Value'], about);
    const baseHeaders = ['ID', 'Title', 'Category', 'Date', 'Time', 'Details', 'Tags', 'Project or notebook', 'Linked IDs',
      'Assignment ID', 'Assignment title', 'Pinned', 'Draft', 'Sample', 'Created', 'Updated', 'Deleted'];
    const baseRow = row => [text(row.id), row.title, row.scope === 'work' ? 'Work' : 'Personal', date(row.date), row.time,
      row.body, rows(row.tags).join(', '), D.byId(data.notebooks, row.notebookId)?.name, rows(row.links).join(', '),
      row.portfolioId, D.byId(data.assignments, row.portfolioId)?.title,
      yes(row.pinned), yes(row.draft), yes(row.sample), time(row.createdAt), time(row.updatedAt), time(row.deletedAt)];
    const workHeaders = ['Area', 'Equipment', 'Person', 'Department', 'Contact', 'Contact ID'];
    const workRow = row => [row.area, row.equipment, row.person, row.department, D.byId(data.contacts, row.contactId)?.name, row.contactId];
    const deadlineHeaders = ['Due date', 'Due time'];
    const deadlineRow = row => [date(row.dueDate), row.dueTime];
    const repeatHeaders = ['Repeat mode', 'Every', 'Interval', 'Repeat until', 'Series ID', 'Occurrence'];
    const repeatRow = row => [row.recurrence?.mode, row.recurrence?.interval, row.recurrence?.unit, date(row.recurrence?.until), row.seriesId, date(row.occurrenceDate)];
    const remindHeaders = ['Reminder enabled', 'Minutes before'];
    const remindRow = row => [yes(row.remind), row.remindMinutes];
    const followHeaders = ['Waiting on', 'Next follow-up', 'Follow-up time', 'Waiting reason', 'Closure confirmed by', 'Closure date', 'Closure confirmation'];
    const followRow = row => [row.waitingOn, date(row.followDate), row.followTime, row.waitingReason, row.verifiedBy, date(row.closedDate), row.closeNotes];
    const eventHeaders = ['End date', 'End time', 'Duration (min)'];
    const eventRow = row => {
      const window = D.eventWindow(row);
      return [date(row.endDate || (row.endTime && row.date)), row.endTime, window ? (window.end - window.start) / 60000 : ''];
    };
    const types = {
      task: ['Tasks', ['Status', 'Priority', 'Manual position', 'Top priority', 'Completed', 'Original planned date', 'Original due date',
        'Responsibility group', 'Assigned shift', 'Duty starting date', 'Assigned by', 'Assigning role', 'Work heading', 'Routine ID',
        'Contact details', 'MWR number', 'MWR status',
        'Handover notes', 'Closing comment', 'Planned minutes', 'Actual minutes', 'Date spent', 'Shown as sticky', 'Pinned in Tasks panel',
        'Can do in personal time', ...deadlineHeaders, ...workHeaders, ...followHeaders, ...repeatHeaders, ...remindHeaders], row =>
        [D.STATUS[row.status], row.priority, row.position, yes(row.focus), time(row.completedAt), date(row.originalDate),
          date(row.originalDueDate), row.role, row.shift, date(row.dutyDate), D.workflow.personName(row), D.ASSIGNERS[D.assignmentOf(row)],
          row.routineHeading, row.routineId, row.contactDetails, row.number, row.mwrStatus,
          row.handover, row.closingComment, row.planMinutes, row.actualMinutes, date(row.actualDate), yes(D.workflow.isSticky(row)), yes(row.taskPinned),
          yes(row.personalTime), ...deadlineRow(row), ...workRow(row), ...followRow(row), ...repeatRow(row), ...remindRow(row)]],
      note: ['Diary Notes', [], () => []],
      event: ['Events', ['Event type', ...eventHeaders, ...repeatHeaders, ...remindHeaders], row =>
        [row.kind, ...eventRow(row), ...repeatRow(row), ...remindRow(row)]],
      meeting: ['Meetings', ['Participants', 'Agenda', 'Minutes', 'Decisions', ...eventHeaders, ...repeatHeaders, ...remindHeaders], row =>
        [row.participants, row.agenda, row.minutes, row.decisions, ...eventRow(row), ...repeatRow(row), ...remindRow(row)]],
      log: ['Shift Log', ['Duty starting date', 'Duty', 'Shift phase', 'Readings', ...workHeaders], row =>
        [date(row.dutyDate), row.dutyShift, D.PHASES[row.phase], row.readings, ...workRow(row)]],
      mwr: ['MWRs', ['MWR number', 'Status', 'Date raised', 'Age (days)', ...workHeaders, ...followHeaders, ...remindHeaders], row =>
        [row.number, D.MWR[row.status], date(row.raisedDate), row.raisedDate ? Math.max(0, D.daysBetween(row.raisedDate,
          row.status === 'closed' && row.closedDate ? row.closedDate : D.parts().date)) : '', ...workRow(row), ...followRow(row), ...remindRow(row)]],
      followup: ['Follow-ups', ['Status', 'Assigned by', 'Assigning role', 'Group', 'Contact details', ...workHeaders, ...deadlineHeaders, ...followHeaders, ...remindHeaders], row =>
        [D.STATUS[row.status], row.assignedBy, D.ASSIGNERS[D.assignmentOf(row)], row.role, row.contactDetails,
          ...workRow(row), ...deadlineRow(row), ...followRow(row), ...remindRow(row)]]
    };
    for (const [key, [title, headers, values]] of Object.entries(types)) {
      put(title, [...baseHeaders, ...headers], data.entries.filter(row => row.type === key).map(row => [...baseRow(row), ...values(row)]));
    }
    put('Subtasks', ['Task ID', 'Task title', 'Subtask ID', 'Title', 'Done'], data.entries.flatMap(row =>
      rows(row.subtasks).map(item => [text(row.id), row.title, text(item.id), item.title, yes(item.done)])));
    put('Updates', ['Entry ID', 'Title', 'Date and time', 'Update'], data.entries.flatMap(row =>
      rows(row.updates).map(item => [text(row.id), row.title, time(item.at), item.text])));
    put('Entry history', ['Entry ID', 'Title', 'Date and time', 'Action', 'Reason', 'Details'], data.entries.flatMap(row =>
      rows(row.history).map(item => [text(row.id), row.title, time(item?.at || item?.timestamp), item?.action || text(item),
        item?.reason || item?.note, rows(item?.changes).length ? item.changes.filter(Boolean).map(change => change.field + ': ' + text(change.before) + ' → ' +
          text(change.after)).join('\n') : [item?.from, item?.to].filter(Boolean).join(' → ')])));
    put('Roster', ['ID', 'Duty starting date', 'Shift', 'Group', 'Notes', 'Updated'], data.roster.map(row =>
      [text(row.id), date(row.date), row.shift, row.group, row.note, time(row.updatedAt)]));
    put('Roster history', ['Date', 'Before', 'After', 'Reason', 'Changed at'], data.dutyHistory.map(row =>
      [date(row.date), [row.before?.shift, row.before?.group, row.before?.note].filter(Boolean).join(' · '),
        [row.after?.shift, row.after?.group, row.after?.note].filter(Boolean).join(' · '), row.reason, time(row.at)]));
    const reportFields = Object.keys(D.REPORT);
    const reportHeaders = ['Report ID', 'Duty starting date', 'Duty', 'Status', 'Updated', 'Deleted', 'Shift in-charge', 'Recipient', 'Acknowledgement',
      ...Object.values(D.REPORT), 'Linked IDs'];
    const reportValues = (row, id) => [text(id), date(row.date), row.shift, row.status, time(row.updatedAt || row.at), time(row.deletedAt),
      row.incharge, row.recipient, row.acknowledgement, ...reportFields.map(key => row.sections?.[key]), rows(row.sources).map(source => source?.id).join(', ')];
    put('Shift reports', reportHeaders, data.reports.map(row => reportValues(row, row.id)));
    put('Report versions', reportHeaders, data.reports.flatMap(row => rows(row.versions).map(version =>
      reportValues({ date: row.date, shift: row.shift, ...version }, row.id))));
    put('Attachments', ['Owner ID', 'Record title', 'Filename', 'Bytes', 'File type', 'File unavailable'], [...data.entries, ...data.reports].flatMap(row =>
      rows(row.attachments).map(file => [text(row.id), row.title || row.shift + ' report', file.name, file.size, file.type, yes(file.missing)])));
    put('Contacts', ['ID', 'Name', 'Department', 'Contact details', 'Notes', 'Deleted'], data.contacts.map(row =>
      [text(row.id), row.name, row.department, row.details, row.notes, time(row.deletedAt)]));
    put('Notebooks', ['ID', 'Name', 'Description', 'Deleted'], data.notebooks.map(row => [text(row.id), row.name, row.notes, time(row.deletedAt)]));
    put('Checklist templates', ['ID', 'Name', 'Use for', 'Category', 'Items', 'Deleted'], data.templates.map(row =>
      [text(row.id), row.name, row.frequency, row.scope, noteList(row.items), time(row.deletedAt)]));
    put('Checklists', ['ID', 'Template ID', 'Date', 'Duty', 'Name', 'Item', 'Done', 'Checked at'], data.checklists.flatMap(row =>
      rows(row.items).map(item => [text(row.id), text(row.templateId), date(row.date), row.shift, row.name, item.title, yes(item.done), time(item.checkedAt)])));
    put('Goals', ['ID', 'Name', 'Target', 'Unit', 'Target date', 'Complete', 'Review notes', 'Deleted'], data.goals.map(row =>
      [text(row.id), row.name, row.target, row.unit, date(row.dueDate), yes(row.closed), row.notes, time(row.deletedAt)]));
    const portfolio = D.portfolio;
    put('Assignments', ['ID', 'Title', 'Source', 'Assigned by', 'Role or team', 'Assigned on', 'Through date', 'Status', 'Completed',
      'Open tasks', 'Open follow-ups', 'Scope and notes', 'Deleted'], data.assignments.map(row => {
      const open = portfolio.linkedEntries(data, row.id).filter(D.open);
      return [text(row.id), row.title, portfolio.levels[row.level], row.assignedBy, portfolio.roleLabel(row), date(row.assignedDate),
        date(row.endDate), portfolio.statuses[portfolio.status(row)], time(row.completedAt), open.filter(item => item.type === 'task').length,
        open.filter(item => item.type === 'followup').length, row.body, time(row.deletedAt)];
    }));
    put('Update Log', ['ID', 'Change', 'Details', 'Status', 'Logged', 'Applied', 'Deleted'], data.updateNotes.map(row =>
      [text(row.id), row.title, row.body, row.appliedAt ? 'Applied' : 'For next update', time(row.createdAt), time(row.appliedAt), time(row.deletedAt)]));
    put('Goal progress', ['Goal ID', 'Goal', 'Date', 'Amount', 'Note'], data.goals.flatMap(row =>
      rows(row.progress).map(item => [text(row.id), row.name, date(item.date), item.amount, item.note])));
    put('Handover', ['ID', 'From duty date', 'From shift', 'Next duty date', 'Next shift', 'Linked entry IDs', 'Note', 'Deleted', 'Item acceptance'],
      data.handovers.map(row => [text(row.id), date(row.date), row.shift, date(row.toDate), row.toShift, row.itemIds.join(', '), row.note, time(row.deletedAt),
        D.list(row.acceptances).map(item => [item.itemId, item.by, D.formatStamp(item.at)].join(' · ')).join('\n')]));
    put('Expenses and income', ['ID', 'Date', 'Type', 'Category', 'Description', 'Note', 'Amount (PKR)', 'Updated', 'Deleted'],
      data.money.map(row => [text(row.id), date(row.date), row.type, row.category, row.title, row.note, row.amountMinor / 100,
        time(row.updatedAt), time(row.deletedAt)]));
    put('Budgets', ['ID', 'Month starting date', 'Category', 'Budget (PKR)', 'Updated', 'Deleted'],
      data.budgets.map(row => [text(row.id), date(row.month + '-01'), row.category || 'Monthly total',
        row.amountMinor / 100, time(row.updatedAt), time(row.deletedAt)]));
    put('Reminder history', ['Reminder key', 'Snoozed until', 'Acknowledged'], Object.entries(data.reminders).map(([key, item]) =>
      [key, item.snooze ? time(new Date(item.snooze).toISOString()) : '', time(item.ack)]));
    put('Work routines', ['ID', 'Heading', 'Task title', 'Notes', 'Repeat', 'Starts', 'Ends', 'Weekday', 'Day of month', 'Rostered shift',
      'Night choice', 'Start time', 'End time', 'Assigning role', 'Enabled'], data.workRules.map(row =>
      [row.id, row.heading, row.title, row.body, D.CADENCES[row.cadence], date(row.startDate), date(row.endDate),
        D.hasWeekday(row.cadence) ? D.WEEKDAYS[row.weekday] : '', D.hasMonthDay(row.cadence) ? row.monthDay : '',
        row.shift, row.cadence === 'night-weekly' ? D.NIGHT_OPTIONS[row.night] : '', row.time, row.endTime,
        D.ASSIGNERS[row.assignment], yes(row.enabled)]));
    put('Namaz timetable', ['Date', ...Object.values(D.TIMETABLE), 'Source'], data.namazTimes.map(row =>
      [date(row.date), ...Object.keys(D.TIMETABLE).map(key => row.times[key]), row.source]));
    put('Namaz log', ['Date', 'Prayer', 'Logged'], data.namazLog.map(row => [date(row.date), D.PRAYERS[row.prayer], time(row.at)]));
    put('Written zikr', ['ID', 'Name', 'Words', 'Meaning', 'Session', 'Target count', 'My required zikr', 'Reference', 'Archived'],
      data.zikrItems.map(row => [row.id, row.title, row.arabic, row.meaning, D.ZIKR_WHEN[row.when], row.target, yes(row.required),
        row.reference, yes(row.archived)]));
    put('Zikr log', ['Date', 'Session', 'Zikr', 'Count', 'Target', 'Updated'], data.zikrLog.map(row =>
      [date(row.date), D.ZIKR_SLOTS[row.slot], row.title, row.count, row.target, time(row.at)]));
    put('Faith diary', ['Date', 'Reflection', 'Updated'], data.faithNotes.map(row => [date(row.date), row.body, time(row.updatedAt)]));
    put('Skills and courses', ['ID', 'Course or skill', 'Current module', 'Status', 'Next session date', 'Next session time', 'Planned minutes', 'Updated'],
      data.learningCourses.map(row => [row.id, row.title, row.module, D.dayPlan.courseStates[row.status], date(row.nextDate), row.nextTime,
        row.plannedMinutes, time(row.updatedAt)]));
    put('Learning sessions', ['ID', 'Course or skill', 'Date', 'Module', 'Planned minutes', 'Actual minutes', 'Practical takeaway', 'Next action'],
      data.learningSessions.map(row => [row.id, D.byId(data.learningCourses, row.courseId)?.title, date(row.date), row.module,
        row.plannedMinutes, row.actualMinutes, row.takeaway, row.nextAction]));
    put('Time report', ['Date', 'Category', 'Activity', 'Actual minutes', 'Source'], D.planning.timeReport(data).rows.map(row =>
      [date(row.date), D.planning.categories[row.category], row.title, row.minutes, row.source]));
    put('Recorded activity', ['Date', 'Time', 'Finish date', 'Finish time', 'Activity', 'Category', 'Shift', 'Minutes'], data.actualActivities.map(row =>
      [date(row.date), row.time, date(row.endDate), row.endTime, row.title, D.planning.categories[row.category], row.context.shift, row.minutes]));
    put('Practice queue', ['Course or skill', 'Exercise', 'Estimated minutes', 'Status', 'Completed'], data.practiceQueue.map(row =>
      [D.byId(data.learningCourses, row.courseId)?.title, row.title, row.minutes, row.status, time(row.completedAt)]));
    put('Shift closeouts', ['Duty date', 'Shift', 'First action', 'Notes', 'Handover draft'], data.shiftCloseouts.map(row =>
      [date(row.date), row.shift, row.firstAction, row.notes, row.draftText]));
    put('Meals', ['Date', 'Meal', 'In', 'Out'], rows(data.mealLogs).filter(row => row.inAt || row.outAt).map(row =>
      [date(row.date), D.workflow.meals[row.meal]?.label, time(row.inAt), time(row.outAt)]));
    if (data.legacy) put('Legacy fields', ['Field', 'Content'], Object.entries(data.legacy).map(([key, value]) => [key, json(value)]));
    return result;
  }

  function sheetXml(values, name, overflow) {
    const headers = values[0];
    const columns = headers.map((title, index) => '<col min="' + (index + 1) + '" max="' + (index + 1) +
      '" width="' + (/details|summary|notes|description|contents?|agenda|minutes|decisions|readings|items|update|highlight/i.test(title) ? 45 :
        /title|name|reason/i.test(title) ? 31 : /\bid\b/i.test(title) ? 27 : 19) + '" customWidth="1"/>').join('');
    const contents = values.map((row, i) => {
      const cells = row.map((value, index) => {
        if (value === undefined || value === null || value === '') return '';
        const ref = col(index) + (i + 1);
        const style = i === 0 ? '1' : '2';
        if (typeof value === 'number' && Number.isFinite(value)) return '<c r="' + ref + '" s="' + style + '"><v>' + value + '</v></c>';
        let content = text(value);
        if (content.length > 32700) {
          for (let j = 0, part = 1; j < content.length; part += 1) {
            let end = j + 32000;
            if (/[\ud800-\udbff]/.test(content[end - 1] || '')) end -= 1;
            overflow.push([name, ref, part, content.slice(j, end)]);
            j = end;
          }
          content = content.slice(0, 1800) + '\n[Full text in the Overflow sheet]';
        }
        return '<c r="' + ref + '" s="' + style + '" t="inlineStr"><is><t xml:space="preserve">' + xml(content) + '</t></is></c>';
      }).join('');
      return '<row r="' + (i + 1) + '"' + (i ? '' : ' ht="24" customHeight="1"') + '>' + cells + '</row>';
    }).join('');
    return xmlHead + '<worksheet xmlns="' + NS + '"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/>' +
      '</sheetView></sheetViews><sheetFormatPr defaultRowHeight="16"/><cols>' + columns + '</cols><sheetData>' +
      contents + '</sheetData><autoFilter ref="A1:' + col(headers.length - 1) + values.length + '"/></worksheet>';
  }

  const styles = xmlHead + '<styleSheet xmlns="' + NS + '">' +
    '<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font></fonts>' +
    '<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>' +
    '<fill><patternFill patternType="solid"><fgColor rgb="FF236347"/><bgColor indexed="64"/></patternFill></fill></fills>' +
    '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>' +
    '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="3">' +
    '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' +
    '<xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment wrapText="1" vertical="center"/></xf>' +
    '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment wrapText="1" vertical="top"/></xf></cellXfs>' +
    '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>';

  function zip(files) {
    const encoder = new TextEncoder();
    const chunks = [];
    const directory = [];
    let offset = 0;
    for (const [name, content] of files) {
      const filename = encoder.encode(name);
      const bytes = encoder.encode(content);
      const checksum = D.storage.crc32(bytes);
      const local = new DataView(new ArrayBuffer(30));
      local.setUint32(0, 0x04034b50, true);
      local.setUint16(4, 20, true);
      local.setUint16(12, 0x21, true);
      local.setUint32(14, checksum, true);
      local.setUint32(18, bytes.length, true);
      local.setUint32(22, bytes.length, true);
      local.setUint16(26, filename.length, true);
      chunks.push(local.buffer, filename, bytes);
      const entry = new DataView(new ArrayBuffer(46));
      entry.setUint32(0, 0x02014b50, true);
      entry.setUint16(4, 20, true);
      entry.setUint16(6, 20, true);
      entry.setUint16(14, 0x21, true);
      entry.setUint32(16, checksum, true);
      entry.setUint32(20, bytes.length, true);
      entry.setUint32(24, bytes.length, true);
      entry.setUint16(28, filename.length, true);
      entry.setUint32(42, offset, true);
      directory.push(entry.buffer, filename);
      offset += 30 + filename.length + bytes.length;
    }
    const tail = new DataView(new ArrayBuffer(22));
    tail.setUint32(0, 0x06054b50, true);
    tail.setUint16(8, files.length, true);
    tail.setUint16(10, files.length, true);
    tail.setUint32(12, directory.reduce((sum, chunk) => sum + chunk.byteLength, 0), true);
    tail.setUint32(16, offset, true);
    return new Blob([...chunks, ...directory, tail.buffer], { type: mime });
  }

  D.workbook = function (data) {
    const sheets = records(data);
    const overflow = [];
    const worksheets = sheets.map((sheet, i) => ['xl/worksheets/sheet' + (i + 1) + '.xml', sheetXml(sheet.values, sheet.name, overflow)]);
    if (overflow.length) {
      sheets.push({ name: 'Overflow' });
      worksheets.push(['xl/worksheets/sheet' + sheets.length + '.xml', sheetXml(
        [['Sheet', 'Cell', 'Part', 'Full text (part)'], ...overflow], 'Overflow', [])]);
    }
    const manifest = sheets.map((sheet, i) => '<sheet name="' + xml(sheet.name) + '" sheetId="' + (i + 1) + '" r:id="rId' + (i + 1) + '"/>').join('');
    const type = 'application/vnd.openxmlformats-officedocument.spreadsheetml.';
    const types = xmlHead + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>' +
      '<Override PartName="/xl/workbook.xml" ContentType="' + type + 'sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="' +
      type + 'styles+xml"/>' + worksheets.map(([path]) => '<Override PartName="/' + path + '" ContentType="' + type + 'worksheet+xml"/>').join('') + '</Types>';
    const rels = 'http://schemas.openxmlformats.org/package/2006/relationships';
    const makeRel = (id, kind, path) => '<Relationship Id="' + id + '" Type="' + REL + '/' + kind + '" Target="' + path + '"/>';
    const workbookRels = worksheets.map(([path], i) => makeRel('rId' + (i + 1), 'worksheet', path.slice(3))).join('') +
      makeRel('rId' + (sheets.length + 1), 'styles', 'styles.xml');
    return zip([
      ['[Content_Types].xml', types],
      ['_rels/.rels', xmlHead + '<Relationships xmlns="' + rels + '">' + makeRel('rId1', 'officeDocument', 'xl/workbook.xml') + '</Relationships>'],
      ['xl/workbook.xml', xmlHead + '<workbook xmlns="' + NS + '" xmlns:r="' + REL + '"><sheets>' + manifest + '</sheets></workbook>'],
      ['xl/_rels/workbook.xml.rels', xmlHead + '<Relationships xmlns="' + rels + '">' + workbookRels + '</Relationships>'],
      ['xl/styles.xml', styles], ...worksheets
    ]);
  };
})(Diary);
