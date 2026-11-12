/* Offline prayer timetable, written zikr, and personal practice records. */
(function (D) {
  'use strict';
  const PALETTES = { green: 'Forest green', blue: 'Ocean blue', plum: 'Plum', amber: 'Warm amber', slate: 'Slate' };
  const PRAYERS = { fajr: 'Fajr', dhuhr: 'Dhuhr', asr: 'Asr', maghrib: 'Maghrib', isha: 'Isha' };
  const TIMETABLE = { fajr: 'Fajr', sunrise: 'Sunrise', dhuhr: 'Dhuhr', asr: 'Asr', maghrib: 'Maghrib', isha: 'Isha' };
  const ZIKR_WHEN = {
    morning: 'Morning', evening: 'Evening', both: 'Morning and evening', after: 'After each namaz', anytime: 'Anytime'
  };
  const ZIKR_SLOTS = { morning: 'Morning', evening: 'Evening', ...PRAYERS, anytime: 'Anytime' };
  const ZIKR_MAX = 100000;
  const AFTER = [
    ['forgiveness', 'Astaghfirullah', 'أَسْتَغْفِرُ اللَّهَ', 'I seek Allah’s forgiveness.', 3, '591'],
    ['tasbih', 'Subhanallah', 'سُبْحَانَ اللَّهِ', 'Glory be to Allah.', 33, '596a'],
    ['tahmid', 'Alhamdulillah', 'الْحَمْدُ لِلَّهِ', 'All praise belongs to Allah.', 33, '596a'],
    ['takbir', 'Allahu Akbar', 'اللَّهُ أَكْبَرُ', 'Allah is the Greatest.', 34, '596a']
  ];

  function starterZikr() {
    const item = ([id, title, arabic, meaning, target, reference], when) => ({
      id: 'starter-' + id, title, arabic, meaning, target, when, required: false, archived: false,
      reference: 'Sahih Muslim ' + reference, source: 'https://sunnah.com/muslim:' + reference
    });
    return [...AFTER.map(row => item(row, 'after')),
      item(['praise', 'Subhanallahi wa bihamdihi', 'سُبْحَانَ اللَّهِ وَبِحَمْدِهِ',
        'Glory and praise belong to Allah.', 100, '2692'], 'both')];
  }

  function normalizeAdditions(data) {
    if (data.settings.palette === undefined) data.settings.palette = 'green';
    for (const key of D.EXTRA_LISTS) {
      if (data[key] === undefined) data[key] = key === 'zikrItems' ? starterZikr() : [];
    }
  }

  function validDay(value) {
    return typeof value === 'string' && !!value && D.parseDate(value) === value;
  }

  function validateNamaz(row) {
    const filled = Object.keys(TIMETABLE).map(key => row.times?.[key] || '');
    if (!validDay(row.date) || row.id !== row.date || typeof row.source !== 'string' ||
        Object.keys(PRAYERS).some(key => !D.timePattern.test(row.times?.[key])) ||
        filled.some(time => time && (typeof time !== 'string' || !D.timePattern.test(time)))) {
      throw new Error('Enter all five namaz times as HH:mm. Sunrise is optional.');
    }
    const times = filled.filter(Boolean);
    if (times.some((time, index) => index > 0 && time <= times[index - 1])) {
      throw new Error('Namaz times must be in order from Fajr to Isha.');
    }
    return row;
  }

  function validateZikr(item) {
    if (typeof item.title !== 'string' || !D.tidy(item.title) || typeof item.arabic !== 'string' ||
        typeof item.meaning !== 'string' || !D.tidy(item.arabic) ||
        !Number.isInteger(item.target) || item.target < 1 || item.target > ZIKR_MAX ||
        !Object.hasOwn(ZIKR_WHEN, item.when) || typeof item.required !== 'boolean' ||
        typeof item.archived !== 'boolean' || typeof item.reference !== 'string' ||
        (item.source && (typeof item.source !== 'string' || !/^https:\/\/sunnah\.com\/muslim:\d+[a-z]?$/.test(item.source)))) {
      throw new Error('Enter a zikr name, written words, timing and a count from 1 to 100,000.');
    }
    return item;
  }

  const zikrLogId = (date, slot, id) => date + ':' + slot + ':' + id;

  function validateAdditions(data) {
    if (!Object.hasOwn(PALETTES, data.settings.palette)) throw new Error('The diary colour preference is invalid.');
    for (const row of data.entries) {
      if ((row.assignment && !Object.hasOwn(D.ASSIGNERS, row.assignment)) ||
          (row.routineHeading !== undefined && typeof row.routineHeading !== 'string')) {
        throw new Error('A task has an invalid work heading or assigning role.');
      }
    }
    for (const rule of data.workRules) D.validateWorkRule(rule);
    for (const row of data.namazTimes) validateNamaz(row);
    for (const row of data.namazLog) {
      if (!validDay(row.date) || !Object.hasOwn(PRAYERS, row.prayer) || row.id !== row.date + ':' + row.prayer ||
          typeof row.at !== 'string' || !Number.isFinite(Date.parse(row.at))) throw new Error('The namaz log has an invalid entry.');
    }
    for (const row of data.zikrItems) validateZikr(row);
    for (const row of data.zikrLog) {
      if (!validDay(row.date) || !Object.hasOwn(ZIKR_SLOTS, row.slot) || typeof row.itemId !== 'string' ||
          row.id !== zikrLogId(row.date, row.slot, row.itemId) || typeof row.title !== 'string' ||
          !Number.isInteger(row.count) || row.count < 1 || row.count > ZIKR_MAX ||
          !Number.isInteger(row.target) || row.target < 1 || row.target > ZIKR_MAX) throw new Error('The zikr log has an invalid count.');
    }
    for (const row of data.faithNotes) {
      if (!validDay(row.date) || row.id !== row.date || typeof row.body !== 'string') throw new Error('A faith diary note is invalid.');
    }
  }

  function nextNamaz(data, local = D.parts()) {
    for (const date of [local.date, D.addDays(local.date, 1)]) {
      const schedule = D.byId(data.namazTimes, date);
      if (!schedule) continue;
      for (const [key, title] of Object.entries(PRAYERS)) {
        const time = schedule.times[key];
        if (date !== local.date || time >= local.time) return { date, time, title };
      }
    }
    return null;
  }

  function zikrFor(item, slot) {
    if (item.when === 'both') return slot === 'morning' || slot === 'evening';
    if (item.when === 'after') return Object.hasOwn(PRAYERS, slot);
    return item.when === slot;
  }

  function parseNamazTable(text, source) {
    const lines = text.trim().replace(/^\uFEFF/, '').split(/\r?\n/).filter(line => line.trim());
    if (lines.length < 2 || lines.length > 367) throw new Error('Paste a header and 1 to 366 daily timetable rows.');
    const separator = lines[0].includes('\t') ? '\t' : ',';
    const cells = line => line.split(separator).map(value => value.trim());
    const headers = cells(lines[0]).map(key => key.toLowerCase());
    if (new Set(headers).size !== headers.length || headers.some(key => key !== 'date' && !Object.hasOwn(TIMETABLE, key)) ||
        ['date', ...Object.keys(PRAYERS)].some(key => !headers.includes(key))) {
      throw new Error('Use the header date,fajr,dhuhr,asr,maghrib,isha. You can also include sunrise.');
    }
    const dates = new Set();
    return lines.slice(1).map((line, index) => {
      const values = cells(line);
      if (values.length !== headers.length) throw new Error('Check the number of columns on line ' + (index + 2) + '.');
      const row = Object.fromEntries(headers.map((key, i) => [key, values[i]]));
      const date = D.parseDate(row.date);
      delete row.date;
      if (dates.has(date)) throw new Error('The timetable repeats a date on line ' + (index + 2) + '.');
      dates.add(date);
      try { return validateNamaz({ id: date, date, times: row, source }); }
      catch (error) { throw new Error('Line ' + (index + 2) + ' · ' + error.message); }
    });
  }

  Object.assign(D, { PALETTES, PRAYERS, TIMETABLE, ZIKR_WHEN, ZIKR_SLOTS, ZIKR_MAX, starterZikr,
    normalizeAdditions, validateAdditions, validateNamaz, validateZikr, nextNamaz, zikrFor, zikrLogId, parseNamazTable });
})(typeof module === 'object' && module.exports ? require('./core.js') : Diary);
