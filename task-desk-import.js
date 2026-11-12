/* Adapter for the JSON and attachment archives produced by the supplied Task Desk. */
(function (D) {
  'use strict';

  const status = { pending: 'todo', 'in-progress': 'doing', waiting: 'waiting', completed: 'done' };
  const date = ms => Number.isFinite(ms) ? D.parts(ms).date : '';
  const clock = ms => Number.isFinite(ms) ? D.parts(ms).time : '';
  const stamp = ms => Number.isFinite(ms) ? new Date(ms).toISOString() : '';

  function fromTask(task) {
    const dueDate = date(task.dueAt);
    const planned = task.dutyDate || dueDate || date(task.createdAt);
    const repeated = task.repeat ? {
      interval: task.repeat.every, unit: task.repeat.unit,
      mode: task.repeat.from === 'completion' ? 'completion' : 'fixed',
      anchorDay: task.repeat.anchorDay, planOffset: D.daysBetween(dueDate || planned, planned), hasDeadline: true
    } : null;
    return {
      id: task.id, type: 'task', scope: task.category === 'Personal' ? 'personal' : 'work',
      title: task.text, body: task.notes, status: status[task.status], priority: task.priority,
      date: planned, originalDate: planned, dueDate, originalDueDate: dueDate, dueTime: clock(task.dueAt),
      position: task.order, createdAt: stamp(task.createdAt), updatedAt: stamp(task.updatedAt),
      completedAt: stamp(task.completedAt), deletedAt: task.deleted ? stamp(task.updatedAt) : '',
      editToken: D.uid(), area: task.area, equipment: task.equipment, shift: task.shift, dutyDate: task.dutyDate,
      assignedBy: task.assignedBy, person: task.responsible, department: task.department, contactDetails: task.contact,
      number: task.mwr, mwrStatus: task.mwrStatus, closingComment: task.closingComment, handover: task.handover,
      color: task.color, remind: !!dueDate && task.reminderMinutes >= 0, remindMinutes: Math.max(0, task.reminderMinutes),
      recurrence: repeated, seriesId: task.seriesId === task.id ? '' : task.seriesId,
      occurrenceDate: repeated ? dueDate || planned : '',
      ...(repeated ? { legacySeries: { id: task.seriesId || task.id, index: task.occurrence } } : {}),
      previousOccurrenceId: task.occurrence === 1 ? task.seriesId :
        task.occurrence > 1 ? task.seriesId + ':' + (task.occurrence - 1) : '',
      history: task.history.map(item => ({ ...item, at: stamp(item.at) })),
      subtasks: task.subtasks.map(item => ({ id: item.id, title: item.text, done: item.done })),
      attachments: task.attachments.map(file => ({
        id: file.id, name: file.name, type: file.type, size: file.size,
        createdAt: stamp(file.createdAt), missing: true, taskDeskFile: true
      }))
    };
  }

  function importJson(raw) {
    const source = D.taskDesk.normalizeState(raw);
    const data = D.empty();
    data.entries = source.tasks.map(fromTask);
    for (const duty of source.roster) {
      const { deleted, ...fields } = duty;
      const row = { ...fields, group: '', updatedAt: stamp(duty.updatedAt) };
      if (deleted) data.dutyHistory.push({ id: 'task-desk-deleted:' + duty.id, date: duty.date,
        before: row, after: null, at: row.updatedAt, reason: 'Duty cleared in Task Desk' });
      else data.roster.push(row);
    }
    data.reports = source.reports.map(row => ({
      id: row.id, date: row.date, shift: row.shift, status: row.ready ? 'ready' : 'draft',
      incharge: row.incharge, recipient: row.handoverTo, createdAt: stamp(row.createdAt), updatedAt: stamp(row.updatedAt),
      deletedAt: row.deleted ? stamp(row.updatedAt) : '', editToken: D.uid(), versions: [], sources: [],
      sections: Object.fromEntries(Object.keys(D.REPORT).map(key => [key,
        key === 'verbal' ? row.verbalSummary : row[key] || '']))
    }));
    const count = new Set(data.entries.flatMap(row => row.attachments).map(file => file.id)).size;
    const warnings = count ? ['Task Desk JSON lists attachment names. Choose the matching Task Desk attachment ZIP for the file bytes.'] : [];
    return { data, bindings: [], warnings, kind: 'legacy', source: 'Task Desk JSON v' + (Array.isArray(raw) ? 1 : raw.schemaVersion) };
  }

  function archiveName(file) {
    return file.id + '_' + file.name.replace(/[\\/\r\n]/g, '_');
  }

  // The original exporter writes stored ZIP files with UTF-8 names. Check both
  // headers, the central directory and CRCs before any local storage is opened.
  async function readArchive(blob) {
    if (blob.size > 100100000) throw new Error('Choose a Task Desk attachment ZIP of up to 100 MB.');
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const view = new DataView(bytes.buffer);
    const u16 = offset => view.getUint16(offset, true);
    const u32 = offset => view.getUint32(offset, true);
    const decoder = new TextDecoder('utf-8', { fatal: true });
    const bad = () => new Error('Choose an intact attachment ZIP exported by Task Desk.');
    const end = bytes.length - 22;
    if (end < 0 || u32(end) !== 0x06054b50 || u16(end + 4) || u16(end + 6) || u16(end + 20)) throw bad();
    const count = u16(end + 10);
    const central = u32(end + 16);
    if (!count || u16(end + 8) !== count || central + u32(end + 12) !== end) throw bad();
    const files = new Map();
    let local = 0;
    let at = central;
    for (let i = 0; i < count; i += 1) {
      if (at + 46 > end || local + 30 > central || u32(at) !== 0x02014b50 ||
          u32(local) !== 0x04034b50 || u32(at + 42) !== local) throw bad();
      const flags = u16(at + 8);
      const size = u32(at + 24);
      const crc = u32(at + 16);
      const nameSize = u16(at + 28);
      const start = local + 30 + u16(local + 26) + u16(local + 28);
      const next = at + 46 + nameSize + u16(at + 30) + u16(at + 32);
      if (flags & ~2048 || u16(at + 10) || u16(local + 6) !== flags || u16(local + 8) ||
          !nameSize || u16(local + 26) !== nameSize || size > 10000000 || start + size > central ||
          next > end || u32(local + 14) !== crc || u32(local + 18) !== size ||
          u32(local + 22) !== size || u32(at + 20) !== size) throw bad();
      const name = decoder.decode(bytes.subarray(at + 46, at + 46 + nameSize));
      if (!name || /[\\/\x00-\x1f]/.test(name) ||
          files.has(name) || name !== decoder.decode(bytes.subarray(local + 30, local + 30 + nameSize))) throw bad();
      const content = bytes.subarray(start, start + size);
      if (D.storage.crc32(content) !== crc) throw new Error('An attachment ZIP file failed its checksum.');
      files.set(name, content);
      local = start + size;
      at = next;
    }
    if (local !== central || at !== end) throw bad();
    return files;
  }

  async function attachArchive(prepared, blob) {
    const files = await readArchive(blob);
    const expected = new Map();
    for (const task of prepared.data.entries) {
      for (const ref of D.list(task.attachments).filter(ref => ref.taskDeskFile)) {
        const name = archiveName(ref);
        const group = expected.get(name) || [];
        group.push(ref);
        expected.set(name, group);
      }
    }
    let matched = 0;
    let already = 0;
    for (const [name, content] of files) {
      const group = expected.get(name);
      if (!group) continue;
      matched += 1;
      if (group.some(ref => ref.size !== content.byteLength)) {
        throw new Error('Attachment size differs from its Task Desk JSON record. Choose the matching backup pair.');
      }
      if (group.every(ref => !ref.missing)) { already += 1; continue; }
      const key = D.uid();
      const bytes = new Blob([content], { type: group[0].type });
      for (const ref of group.filter(ref => ref.missing)) prepared.bindings.push({ row: ref, blob: bytes, key });
    }
    if (!matched) throw new Error('This ZIP has no files that match these records. Import the matching Task Desk JSON first.');
    const repaired = new Set(prepared.bindings.map(binding => binding.row));
    const absent = [...expected.values()].flat().filter(ref => ref.missing && !repaired.has(ref));
    prepared.warnings = [];
    if (files.size > matched) prepared.warnings.push((files.size - matched) + ' ZIP files have no matching record and will be skipped.');
    if (already) prepared.warnings.push(already + ' matching files are already present.');
    if (absent.length) prepared.warnings.push(new Set(absent.map(ref => ref.id)).size + ' referenced files are absent from this ZIP.');
    return prepared;
  }

  D.legacy = { importJson, attachArchive };
})(Diary);
