/* Backup validation and local diary storage. */
(function (D) {
  'use strict';
  const DB = D.deviceDB;
  const PREVIOUS = D.APP + ':v5';
  const MAX_FILE = 15 * 1024 * 1024;
  const FILE_KEY = /^[A-Za-z0-9_-]{1,120}$/;
  const array = D.list;
  const object = value => value && typeof value === 'object' && !Array.isArray(value);
  const ownId = id => (typeof id === 'string' && id.length > 0 && id.length <= 500) || Number.isSafeInteger(id);
  const date = value => typeof value === 'string' && !!value && D.parseDate(value) === value;
  let cache = D.empty();
  let savedCopies = [];
  let channel;
  let listener;
  let reading = 0;

  function validateFile(file) {
    return object(file) && ownId(file.id) && typeof file.name === 'string' && !!file.name &&
      typeof file.type === 'string' && Number.isSafeInteger(file.size) && file.size >= 0 &&
      (file.missing === true || typeof file.key === 'string' && FILE_KEY.test(file.key));
  }

  function validate(data) {
    if (!object(data) || data.app !== D.APP || data.schemaVersion !== D.SCHEMA ||
        !object(data.settings) || !object(data.reminders)) {
      throw new Error('This is not a My Shift & Life Diary data file.');
    }
    D.normalizeAdditions(data);
    const settings = data.settings;
    if (['quietByRoster', 'quietRosterCritical'].some(key => settings[key] != null && typeof settings[key] !== 'boolean') ||
        settings.quietRosterSince != null && !Number.isFinite(settings.quietRosterSince)) {
      throw new Error('The backup contains invalid roster quiet preferences.');
    }
    if (!['system', 'light', 'dark'].includes(settings.theme) || !Number.isInteger(settings.soonDays) ||
        settings.soonDays < 1 || settings.soonDays > 30 || !D.timePattern.test(settings.reminderTime) ||
        typeof settings.notifications !== 'boolean' ||
        [settings.quietStart, settings.quietEnd].some(time => time && !D.timePattern.test(time))) {
      throw new Error('The backup contains invalid diary preferences.');
    }
    for (const key of D.LISTS) {
      if (!Array.isArray(data[key])) throw new Error('The backup is missing the ' + key + ' list.');
      const ids = new Set();
      for (const row of data[key]) {
        if (!object(row) || !ownId(row.id) || ids.has(String(row.id))) {
          throw new Error('The ' + key + ' list has a missing or duplicate ID.');
        }
        ids.add(String(row.id));
      }
    }
    for (const row of data.entries) {
      if (!Object.hasOwn(D.TYPES, row.type) || !['work', 'personal'].includes(row.scope) ||
          typeof row.title !== 'string' || (!row.draft && !D.tidy(row.title)) || !date(row.date)) {
        throw new Error('An entry has an invalid type, title, category or date.');
      }
      for (const field of ['dueDate', 'endDate', 'followDate', 'dutyDate', 'raisedDate', 'closedDate', 'occurrenceDate',
        'originalDate', 'originalDueDate', 'actualDate']) {
        if (row[field] && !date(row[field])) throw new Error('An entry has an invalid ' + field + '.');
      }
      for (const field of ['time', 'endTime', 'dueTime', 'followTime']) {
        if (row[field] && !D.timePattern.test(row[field])) throw new Error('An entry has an invalid time.');
      }
      for (const field of ['planMinutes', 'actualMinutes']) {
        if (row[field] != null && (!Number.isInteger(row[field]) || row[field] < 1 || row[field] > 1440)) {
          throw new Error('An entry has an invalid time total.');
        }
      }
      const slot = row.lastSlotBooking;
      if (row.stickyKind != null && !['shift', 'day'].includes(row.stickyKind)) throw new Error('An entry has an invalid sticky type.');
      if (slot != null && (!object(slot) || !date(slot.date) || !D.timePattern.test(slot.time) || typeof slot.onDuty !== 'boolean' ||
          !Number.isFinite(slot.earliest) || typeof slot.allowEarly !== 'boolean') ||
          row.allowRosterReminder != null && typeof row.allowRosterReminder !== 'boolean') {
        throw new Error('An entry contains an invalid last-slot booking or reminder exception.');
      }
      if (row.type === 'task' && (!Object.hasOwn(D.STATUS, row.status) || !Number.isFinite(row.position) ||
        !['critical', 'high', 'normal', 'low'].includes(row.priority))) {
        throw new Error('A task has an invalid status, priority or manual position.');
      }
      if (row.recurrence && !D.validRule(row.recurrence)) throw new Error('An entry has an invalid repeat rule.');
      if (row.legacySeries && (!ownId(row.legacySeries.id) ||
          !Number.isInteger(row.legacySeries.index) || row.legacySeries.index < 0)) {
        throw new Error('A Task Desk task has an invalid occurrence number.');
      }
      if (row.type === 'mwr' && !Object.hasOwn(D.MWR, row.status) ||
          row.type === 'followup' && !Object.hasOwn(D.STATUS, row.status)) {
        throw new Error('A follow-up or MWR has an invalid status.');
      }
      for (const field of ['attachments', 'history', 'subtasks', 'tags', 'links', 'updates']) {
        if (row[field] != null && !Array.isArray(row[field])) throw new Error('An entry has invalid ' + field + '.');
      }
      if (array(row.subtasks).some(item => !object(item) || !ownId(item.id) || typeof item.title !== 'string') ||
          array(row.links).some(id => !ownId(id)) || array(row.tags).some(tag => typeof tag !== 'string') ||
          array(row.updates).some(update => !object(update) || typeof update.text !== 'string')) {
        throw new Error('An entry has invalid subtasks, links, tags or updates.');
      }
    }
    for (const key of ['roster', 'reports', 'checklists', 'dutyHistory', 'money', 'handovers']) {
      for (const row of data[key]) {
        if (!date(row.date)) throw new Error('A ' + key + ' record has an invalid date.');
      }
    }
    for (const key of ['contacts', 'notebooks', 'templates', 'goals', 'checklists']) {
      if (data[key].some(row => typeof row.name !== 'string')) throw new Error('A ' + key + ' record has an invalid name.');
    }
    for (const row of data.reports) {
      if (!D.SHIFT[row.shift]?.start || !object(row.sections) || Object.values(row.sections).some(value => typeof value !== 'string') ||
          array(row.versions).some(version => !object(version))) {
        throw new Error('A shift report has an invalid duty, section or version.');
      }
    }
    const duties = new Set();
    for (const duty of data.roster) {
      if (!Object.hasOwn(D.SHIFT, duty.shift) || duties.has(duty.date)) {
        throw new Error('The roster contains an unknown shift or more than one duty on a date.');
      }
      duties.add(duty.date);
    }
    for (const row of [...data.checklists, ...data.templates]) {
      if (!Array.isArray(row.items) || row.items.some(item => !object(item) || !ownId(item.id) || typeof item.title !== 'string')) {
        throw new Error('A routine has invalid checklist steps.');
      }
    }
    if (data.goals.some(goal => !Number.isFinite(goal.target) || goal.target <= 0 ||
        array(goal.progress).some(item => !object(item) || !date(item.date) || !Number.isFinite(item.amount)))) {
      throw new Error('A goal or progress record is invalid.');
    }
    for (const row of data.handovers) {
      if (!date(row.toDate) || !D.SHIFT[row.shift]?.start || !D.SHIFT[row.toShift]?.start ||
          !Array.isArray(row.itemIds) || row.itemIds.some(id => !ownId(id)) ||
          D.dutyWindow({ date: row.toDate, shift: row.toShift }).start < D.dutyWindow(row).end) {
        throw new Error('A handover has an invalid source duty, destination duty or task link.');
      }
      if (row.acceptances != null && (!Array.isArray(row.acceptances) || row.acceptances.some(item => !object(item) ||
          !ownId(item.itemId) || !row.itemIds.some(id => D.same(id, item.itemId)) || typeof item.by !== 'string' ||
          !D.tidy(item.by) || item.by.length > 120 || typeof item.at !== 'string' || !Number.isFinite(Date.parse(item.at))) ||
          new Set(row.acceptances.map(item => D.str(item.itemId))).size !== row.acceptances.length)) {
        throw new Error('A handover has an invalid item acceptance.');
      }
    }
    const money = row => Number.isSafeInteger(row.amountMinor) && row.amountMinor > 0 &&
      row.amountMinor <= D.MONEY_LIMIT && typeof row.category === 'string';
    if (data.money.some(row => !money(row) || !D.tidy(row.category) || !['expense', 'income'].includes(row.type))) {
      throw new Error('An expense or income record has an invalid category, type or amount.');
    }
    const budgets = new Set();
    for (const row of data.budgets) {
      const key = row.month + ':' + D.categoryKey(row.category);
      if (!money(row) || typeof row.month !== 'string' || !date(row.month + '-01') || (!row.deletedAt && budgets.has(key))) {
        throw new Error('A monthly budget has an invalid amount, month or duplicate category.');
      }
      if (!row.deletedAt) budgets.add(key);
    }
    const attachmentSizes = new Map();
    for (const file of allAttachments(data)) {
      if (!validateFile(file) || (!file.missing && attachmentSizes.has(file.key) && attachmentSizes.get(file.key) !== file.size)) {
        throw new Error('The backup has an invalid or inconsistent attachment reference.');
      }
      if (!file.missing) attachmentSizes.set(file.key, file.size);
    }
    D.validateAdditions(data);
    D.portfolio.validate(data);
    D.progress.validate(data);
    D.budgeting.validate(data);
    D.dayPlan.validateLearning(data);
    D.planning.validate(data);
    D.shiftCompanion.validate(data);
    D.activity.validate(data);
    return data;
  }

  function toBase64(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result).split(',', 2)[1] ?? '');
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(blob);
    });
  }

  function fromBase64(encoded, type) {
    if (typeof encoded !== 'string' || encoded.length % 4 ||
        /[^A-Za-z0-9+/=]/.test(encoded) || /=[^=]/.test(encoded) || encoded.endsWith('===')) {
      throw new Error('The backup contains invalid attachment bytes.');
    }
    return new Blob([Uint8Array.fromBase64 ? Uint8Array.fromBase64(encoded) : Uint8Array.from(atob(encoded), c => c.charCodeAt(0))], { type });
  }

  async function digest(blob) {
    const bytes = new Uint8Array(await blob.arrayBuffer());
    if (globalThis.crypto?.subtle) {
      const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
      return 'sha256:' + Array.from(hash, value => value.toString(16).padStart(2, '0')).join('');
    }
    return 'crc32:' + crc32(bytes).toString(16).padStart(8, '0');
  }

  const crcTable = Uint32Array.from({ length: 256 }, (_, n) => {
    for (let i = 0; i < 8; i += 1) n = (n >>> 1) ^ (n & 1 ? 0xedb88320 : 0);
    return n >>> 0;
  });

  function crc32(bytes) {
    let value = 0xffffffff;
    for (const byte of bytes) value = (value >>> 8) ^ crcTable[(value ^ byte) & 255];
    return (value ^ 0xffffffff) >>> 0;
  }

  async function verifyDigest(blob, expected) {
    if (expected.startsWith('crc32:')) {
      const actual = crc32(new Uint8Array(await blob.arrayBuffer())).toString(16).padStart(8, '0');
      return expected === 'crc32:' + actual;
    }
    return expected === await digest(blob);
  }

  function allAttachments(data) {
    return [
      ...data.entries,
      ...data.reports.flatMap(report => [report, ...array(report.versions)])
    ].flatMap(row => array(row.attachments));
  }

  function upgrade(data) {
    if (DB.upgrade) data = DB.upgrade(data);
    if (data?.app === D.APP && data.schemaVersion === 5) {
      for (const key of ['handovers', 'money', 'budgets']) data[key] = [];
      data.schemaVersion = D.SCHEMA;
      const series = new Map();
      for (const row of data.entries) {
        if (row.type !== 'task' || !row.seriesId || !row.occurrenceDate) continue;
        const occurrences = series.get(String(row.seriesId)) || [];
        occurrences.push(row);
        series.set(String(row.seriesId), occurrences);
      }
      for (const [id, rows] of series) {
        let previous = id;
        for (const row of rows.sort((a, b) => a.occurrenceDate.localeCompare(b.occurrenceDate))) {
          row.previousOccurrenceId ||= previous;
          previous = row.id;
        }
      }
    }
    return validate(data);
  }

  function revised(data) {
    data.rev = D.uid();
    data.savedAt = D.stamp();
    return data;
  }

  function publish(data) {
    reading += 1;
    cache = data;
    channel?.postMessage({ rev: data.rev });
  }

  async function refresh() {
    const before = cache.rev;
    const token = ++reading;
    const stored = await DB.read('records', DB.MAIN);
    if (token !== reading) return false;
    cache = stored ? upgrade(stored) : D.empty();
    return cache.rev !== before;
  }

  async function refreshCopies() {
    const rows = await DB.read('copies');
    savedCopies = rows.map(({ data, ...summary }) => summary).sort((a, b) => b.at.localeCompare(a.at));
  }

  async function transact(change, expectedRev) {
    const result = await DB.update([], stored => {
      const before = stored ? upgrade(stored) : D.empty();
      if (expectedRev !== undefined && before.rev !== expectedRev) {
        throw new Error('The diary changed in another tab. Reopen this action to use the latest data.');
      }
      const after = D.clone(before);
      const value = change(after);
      if (value === false) return { before, data: before, result: value };
      D.hierarchy.reconcile(after, before);
      const generated = D.generateRecurrence(after) + D.generateWork(after);
      if (generated) D.hierarchy.reconcile(after, before);
      validate(after);
      return { next: revised(after), before, data: after, result: value };
    });
    if (result.next) publish(result.next);
    else cache = result.data;
    return result;
  }

  async function attach(files) {
    const entries = [...files].map(file => {
      if (file.size > MAX_FILE) throw new Error('“' + file.name + '” is larger than 15 MiB.');
      const key = D.uid();
      return { file, row: { id: key, key, name: file.name || 'Attachment', type: file.type, size: file.size } };
    });
    if (entries.length) await DB.put('files', entries.map(({ row, file }) => [row.key, file]));
    return entries.map(({ row }) => row);
  }

  const discardFiles = rows => rows.length ? DB.remove('files', rows.map(row => row.key)).catch(() => {}) : Promise.resolve();
  async function readAttachment(row) {
    if (!row.key || row.missing) throw new Error('Restore the attachment file for “' + row.name + '” first.');
    const file = await DB.read('files', row.key);
    if (!file || file.size !== row.size) throw new Error('A saved file is missing or damaged. Check “' + row.name + '”.');
    return file;
  }

  async function backup(data = cache) {
    const files = Object.create(null);
    const missing = [];
    for (const row of allAttachments(data)) {
      if (row.missing) {
        missing.push({ id: row.id, name: row.name });
        continue;
      }
      if (Object.hasOwn(files, row.key)) continue;
      const blob = await readAttachment(row);
      files[row.key] = { bytes: await toBase64(blob), size: blob.size, digest: await digest(blob), type: row.type };
    }
    return { app: D.APP, schemaVersion: D.SCHEMA, exportedAt: D.stamp(), data: D.clone(data), files, missing };
  }

  async function prepareImport(blob, zip) {
    let parsed;
    try { parsed = JSON.parse(await blob.text()); }
    catch { throw new Error('Choose a readable JSON backup file.'); }
    if (parsed?.app !== D.APP) {
      const legacy = D.legacy.importJson(parsed);
      return zip ? D.legacy.attachArchive(legacy, zip) : legacy;
    }
    if (![5, D.SCHEMA, DB.legacyVersion].includes(parsed.schemaVersion) || parsed.data?.schemaVersion !== parsed.schemaVersion) {
      throw new Error('This diary backup version is not supported.');
    }
    if (zip) throw new Error('Choose a Task Desk JSON for the attachment ZIP, or restore this diary JSON by itself.');
    const source = 'Digital Diary JSON v' + parsed.schemaVersion;
    const data = upgrade(parsed.data);
    const bindings = [];
    const files = object(parsed.files) ? parsed.files : {};
    const verified = new Map();
    const warnings = new Set();
    for (const row of allAttachments(data)) {
      if (row.missing) {
        warnings.add('Some attachment references have no file bytes in this backup.');
        continue;
      }
      if (!row.key || !Object.hasOwn(files, row.key)) throw new Error('“' + row.name + '” is missing from this backup.');
      const record = files[row.key];
      if (!verified.has(row.key)) {
        if (!object(record) || typeof record.digest !== 'string') throw new Error('A backup attachment has no checksum.');
        const bytes = fromBase64(record.bytes, record.type);
        if (bytes.size !== record.size || !await verifyDigest(bytes, record.digest)) {
          throw new Error('The checksum or size of “' + row.name + '” does not match.');
        }
        verified.set(row.key, { bytes, key: D.uid() });
      }
      const local = verified.get(row.key);
      if (local.bytes.size !== row.size) throw new Error('The size of “' + row.name + '” does not match.');
      bindings.push({ row, blob: local.bytes, key: local.key });
    }
    return { data, bindings, warnings: [...warnings], kind: 'native', source };
  }

  function prepareArchive(blob, data = cache) {
    return D.legacy.attachArchive({ data: D.clone(data), bindings: [], warnings: [],
      kind: 'attachments', source: 'Task Desk attachment ZIP' }, blob);
  }

  const matchKey = {
    roster: row => row.date,
    reports: row => row.date + ':' + row.shift,
    budgets: row => row.month + ':' + D.categoryKey(row.category),
    money: row => D.budgeting.billKey(row)
  };
  function merge(before, incoming) {
    const result = D.clone(before);
    const entries = D.shiftSchedule.mergeScreenshotTasks(result, incoming);
    let added = 0;
    let skipped = 0;
    for (const key of D.LISTS) {
      const ids = new Set(result[key].map(row => String(row.id)));
      const natural = matchKey[key];
      const matches = row => !row.deletedAt || !['budgets', 'money'].includes(key);
      const names = new Set(natural ? result[key].filter(matches).map(natural).filter(Boolean) : []);
      const append = [];
      for (const row of key === 'entries' ? entries : incoming[key]) {
        const match = natural && matches(row) ? natural(row) : '';
        if (ids.has(String(row.id)) || match && names.has(match)) {
          skipped += 1;
          continue;
        }
        append.push(row);
        ids.add(String(row.id));
        if (match) names.add(match);
      }
      if (key === 'entries') {
        let rank = result.entries.reduce((high, row) => row.type === 'task' ? Math.max(high, Number(row.position) || 0) : high, 0);
        for (const row of append.filter(row => row.type === 'task').sort(D.manualOrder)) row.position = ++rank;
      }
      result[key].push(...append);
      added += append.length;
    }
    for (const [key, state] of Object.entries(incoming.reminders)) {
      if (!Object.hasOwn(result.reminders, key)) Object.defineProperty(result.reminders, key, { value: state, enumerable: true });
    }
    // A paired archive can complete an earlier metadata-only import.
    const source = new Map(allAttachments(incoming).filter(file => file.taskDeskFile && file.key && !file.missing)
      .map(file => [D.legacyFileKey(file), file]));
    for (const file of allAttachments(result).filter(file => file.taskDeskFile && file.missing)) {
      const available = source.get(D.legacyFileKey(file));
      if (available) Object.assign(file, { key: available.key, missing: false });
    }
    return { data: result, added, skipped };
  }

  function summary(prepared) {
    const merged = prepared.kind === 'attachments' ? { added: 0, skipped: 0 } : merge(cache, D.clone(prepared.data));
    return { added: merged.added, skipped: merged.skipped, fileCount: new Set(prepared.bindings.map(binding => binding.key)).size };
  }

  function remap(prepared) {
    const data = D.clone(prepared.data);
    const targets = allAttachments(data);
    const references = new Map(allAttachments(prepared.data).map((row, i) => [row, targets[i]]));
    const files = new Map();
    for (const binding of prepared.bindings) {
      files.set(binding.key, binding.blob);
      Object.assign(references.get(binding.row), { key: binding.key, missing: false });
    }
    return { data, files };
  }

  function snapshot(data, name) {
    return { id: D.uid(), name, at: D.stamp(), count: data.entries.length + data.money.length, data };
  }

  async function saveCopy(data, name) {
    const copy = snapshot(D.clone(data), name);
    await DB.put('copies', [[undefined, copy]]);
    await refreshCopies();
    return copy;
  }

  async function deleteCopy(id) {
    await DB.remove('copies', [id]);
    await refreshCopies();
  }

  async function readCopy(id) {
    const copy = await DB.read('copies', id);
    if (!copy) throw new Error('This saved copy is unavailable.');
    return new Blob([JSON.stringify(await backup(upgrade(copy.data)))], { type: 'application/json' });
  }

  async function restore(prepared, expectedRev, mode) {
    if (!['merge', 'replace', 'attachments'].includes(mode) ||
        (prepared.kind === 'attachments') !== (mode === 'attachments')) throw new Error('Choose a restore method.');
    const incoming = remap(prepared);
    const result = await DB.update(['files', 'copies'], (stored, tx) => {
      const previous = stored ? upgrade(stored) : D.empty();
      if (previous.rev !== expectedRev) throw new Error('The diary changed after this preview. Open the backup again.');
      const next = mode === 'merge' ? merge(previous, incoming.data).data : incoming.data;
      const day = D.dutyAt(next.roster).current?.date || D.parts().date;
      D.syncShiftStickies(next, [day]);
      D.shiftSchedule.addScreenshotTasks(next);
      D.hierarchy.reconcile(next);
      validate(next);
      const used = new Set(allAttachments(next).filter(file => !file.missing).map(file => file.key));
      for (const [id, blob] of incoming.files) if (used.has(id)) tx.objectStore('files').put(blob, id);
      if (previous.rev) tx.objectStore('copies').put(snapshot(previous, 'Before ' +
        (mode === 'attachments' ? 'restoring attachments' : mode === 'merge' ? 'merge' : 'replace')));
      return { next: revised(next) };
    });
    publish(result.next);
    await refreshCopies().catch(() => {});
    return result.next;
  }

  // The first Diary release kept the document in localStorage and file bytes
  // in the private file area. Copy them into IndexedDB on the same origin.
  async function oldFile(folder, key, type) {
    if (!FILE_KEY.test(key)) throw new Error('A previous diary file ID is invalid.');
    if (navigator.storage?.getDirectory) {
      try {
        const root = await navigator.storage.getDirectory();
        const dir = await root.getDirectoryHandle(folder);
        return await (await dir.getFileHandle(key)).getFile();
      } catch (error) { if (error.name !== 'NotFoundError') throw error; }
    }
    const raw = localStorage.getItem(PREVIOUS + ':' + folder + ':' + key);
    if (raw === null) throw new Error('A previous diary file is missing.');
    return fromBase64(raw, type);
  }

  async function migrateEarlierDiary() {
    let raw;
    try { raw = localStorage.getItem(PREVIOUS); } catch { return ''; }
    if (!raw) return '';
    const data = upgrade(JSON.parse(raw));
    const files = new Map();
    const unavailable = new Set();
    for (const ref of allAttachments(data).filter(file => !file.missing)) {
      if (!files.has(ref.key) && !unavailable.has(ref.key)) {
        try {
          const file = await oldFile('diary-files', ref.key, ref.type);
          if (file.size !== ref.size) throw new Error('Attachment size differs.');
          files.set(ref.key, file);
        } catch { unavailable.add(ref.key); }
      }
      if (unavailable.has(ref.key)) ref.missing = true;
    }
    let copies = [];
    let unavailableCopies = 0;
    try { copies = array(JSON.parse(localStorage.getItem(PREVIOUS + ':copies') || '[]')); }
    catch { unavailableCopies += 1; }
    const migratedCopies = [];
    for (const copy of copies) {
      try {
        const prepared = await prepareImport(await oldFile('diary-copies', copy.id, 'application/json'));
        const moved = remap(prepared);
        migratedCopies.push({ id: copy.id, name: copy.name, at: copy.at, count: copy.count, data: moved.data });
        for (const [key, blob] of moved.files) files.set(key, blob);
      } catch { unavailableCopies += 1; }
    }
    await DB.update(['files', 'copies'], (stored, tx) => {
      if (stored) return {};
      for (const [key, file] of files) tx.objectStore('files').put(file, key);
      for (const copy of migratedCopies) tx.objectStore('copies').put(copy);
      return { next: revised(data) };
    });
    return unavailable.size || unavailableCopies
      ? 'Earlier diary records loaded. Some earlier attachments or saved copies could not be read.' : '';
  }

  async function start(onChange) {
    const stored = await DB.read('records', DB.MAIN);
    const message = stored ? '' : await migrateEarlierDiary();
    await refresh();
    await refreshCopies();
    listener = onChange;
    if (!DB.fileName && globalThis.BroadcastChannel) {
      channel = new BroadcastChannel(D.KEY);
      channel.onmessage = () => syncView().catch(() => {});
    }
    return message;
  }

  async function syncView() {
    if (await refresh()) {
      await refreshCopies();
      listener?.(cache);
    }
  }

  D.legacyFileKey = file => JSON.stringify([file.id, file.name, file.size]);
  D.storage = { start, syncView, refresh, read: () => cache, transact, attach, discardFiles, readAttachment, backup,
    prepareImport, prepareArchive, summary, copies: () => savedCopies, saveCopy, deleteCopy, readCopy, restore, crc32,
    fileFormat: { validate, allAttachments, toBase64, fromBase64, digest, verifyDigest } };
})(Diary);
