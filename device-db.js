/* Device-only records, immutable attachment files and atomic restore checkpoints. */
(function (D) {
  'use strict';

  const NAME = 'my-shift-life-diary';
  const MAIN = 'current';
  let opening;

  function database() {
    if (opening) return opening;
    opening = new Promise((resolve, reject) => {
      if (!globalThis.indexedDB) return reject(new Error('This browser does not provide diary storage.'));
      const request = indexedDB.open(NAME, 1);
      request.onupgradeneeded = () => {
        const db = request.result;
        db.createObjectStore('records');
        db.createObjectStore('files');
        db.createObjectStore('copies', { keyPath: 'id' });
      };
      request.onsuccess = () => {
        const db = request.result;
        db.onversionchange = () => {
          db.close();
          opening = null;
        };
        resolve(db);
      };
      request.onerror = () => {
        opening = null;
        reject(request.error || new Error('Browser storage could not open.'));
      };
      request.onblocked = () => reject(new Error('Close the diary in other tabs, then reload this page.'));
    });
    return opening;
  }

  async function transaction(names, mode, operation) {
    const db = await database();
    return new Promise((resolve, reject) => {
      let tx;
      if (mode === 'readwrite') {
        try { tx = db.transaction(names, mode, { durability: 'strict' }); }
        catch (error) {
          if (!(error instanceof TypeError)) throw error;
          tx = db.transaction(names, mode);
        }
      } else tx = db.transaction(names, mode);
      let result;
      let failure;
      const abort = error => {
        failure = error;
        tx.abort();
      };
      tx.oncomplete = () => resolve(result);
      tx.onabort = () => reject(failure || tx.error || new Error('The browser could not save this change.'));
      const set = value => { result = value; };
      try { operation(tx, set, abort); }
      catch (error) { abort(error); }
    });
  }

  function read(store, key) {
    return transaction([store], 'readonly', (tx, set) => {
      const table = tx.objectStore(store);
      const request = key === undefined ? table.getAll() : table.get(key);
      request.onsuccess = () => set(request.result);
    });
  }

  function update(extraStores, action) {
    return transaction(['records', ...extraStores], 'readwrite', (tx, set, abort) => {
      const records = tx.objectStore('records');
      const request = records.get(MAIN);
      request.onsuccess = () => {
        try {
          const result = action(request.result, tx);
          if (result.next) records.put(result.next, MAIN);
          set(result);
        } catch (error) { abort(error); }
      };
    });
  }

  function put(store, records) {
    return transaction([store], 'readwrite', tx => {
      const table = tx.objectStore(store);
      for (const [key, value] of records) {
        if (key === undefined) table.put(value);
        else table.put(value, key);
      }
    });
  }

  function remove(store, keys) {
    return transaction([store], 'readwrite', tx => {
      const table = tx.objectStore(store);
      for (const key of keys) table.delete(key);
    });
  }

  D.deviceDB = { read, update, put, remove, MAIN, openFile: () => Promise.resolve(),
    legacyVersion: D.browserLegacy.version, upgrade: D.browserLegacy.upgrade };
})(Diary);
