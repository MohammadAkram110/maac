/* Shared roster timing, last-slot bookings, and item-by-item handover records. */
(function (D) {
  'use strict';

  const minute = 60000;
  const rowId = D.str;
  const stampAt = value => Date.parse(value) || 0;
  const overlap = (a, b) => a.start < b.end && b.start < a.end;
  const working = data => data.roster.filter(row => D.SHIFT[row.shift]?.start)
    .map(row => ({ ...row, ...D.planning.dutyWindow(data, row) })).sort((a, b) => a.start - b.start);

  function lastSlotLimit(data, row, now, duties) {
    const P = D.dayPlan;
    const dates = P.deadlines(row, data);
    const deadline = dates.find(item => item.label !== 'Follow up') || dates[0];
    const today = D.parts(now).date;
    const rest = row.scope === 'work' && (!deadline || !P.atHome(row)) &&
      D.shiftSchedule.restBlocks(data.roster).find(block => {
        if (!deadline) return block.end >= today;
        return deadline.day >= block.start && deadline.day <= block.end ||
          block.next.some(item => item.date === deadline.day && deadline.at <= (duties.find(duty => duty.date === item.date)?.end ?? item.end));
      });
    if (rest) {
      const prior = duties.findLast(duty => duty.date < rest.start);
      const at = Math.max(D.instant(rest.start), prior?.end ?? 0);
      if (!deadline || at < deadline.at) {
        const shift = data.roster.find(item => item.date === rest.start)?.shift || 'Rest';
        return { at, day: rest.start, label: 'Before ' + shift };
      }
    }
    return deadline || null;
  }

  function planningBlocks(plan, row, duty) {
    return plan.busy.filter(block => !D.same(block.row?.id, row.id) &&
      block.kind !== 'personal' && block.kind !== 'priority' && (block.kind !== 'study' || block.booked) &&
      !(block.kind === 'duty' && block.date === duty?.date));
  }

  function lastWorkableSlot(data, row, now = Date.now(), visiblePlan) {
    const P = D.dayPlan;
    const F = D.planning;
    const C = D.shiftCompanion;
    if (!C.tracked(row) || !F.availableTask(data, row)) return { state: 'unavailable' };
    const duties = working(data);
    const limit = lastSlotLimit(data, row, now, duties);
    if (!limit) return { state: 'needs-limit' };
    const reasons = C.blockers(data, row);
    if (C.activePauses(data).some(item => D.same(item.taskId, row.id))) reasons.push({ title: 'Resume this paused task first' });
    if (reasons.length) return { state: 'blocked', limit, reasons };

    const length = F.estimate(row) * minute;
    const floor = Math.ceil(now / minute) * minute;
    const chosenDay = row.planNotBefore || row.planFlexible ? row.date : row.type === 'task' ? D.taskDay(row) : row.date;
    const saved = row.lastSlotBooking;
    const prior = saved && !row.planFlexible && row.date === saved.date && row.time === saved.time ? saved : null;
    const earliest = prior?.earliest ?? D.instant(chosenDay || D.parts(now).date, row.planFlexible && row.time ? row.time : '00:00');
    const allowEarly = prior?.allowEarly ?? (!row.planNotBefore && !row.planFlexible);
    const nextCheck = row.status === 'waiting' && row.followDate && limit.label !== 'Follow up' ?
      D.instant(row.followDate, row.followTime || '00:00') : 0;
    const beforeRest = limit.label.startsWith('Before ');
    const prepareEarly = beforeRest && allowEarly && D.parts(earliest).date >= limit.day;
    const ready = Math.max(floor, prepareEarly ? 0 : earliest, beforeRest ? 0 : nextCheck);
    if (limit.at - ready < length) return { state: 'no-slot', limit, minutes: length / minute };

    const plans = new Map();
    if (visiblePlan?.days?.length) plans.set(visiblePlan.days[0].date, visiblePlan);
    let best;
    const fit = (start, end, day, duty) => {
      if (end - start < length || best && end - length <= best.start) return;
      if (!plans.has(day)) plans.set(day, P.build(data, day, {}, now));
      const blocks = planningBlocks(plans.get(day), row, duty);
      const window = P.freeWindows(start, end, blocks).findLast(gap => gap.end - gap.start >= length);
      if (window && (!best || window.end - length > best.start)) best = { start: window.end - length, end: window.end, duty };
    };
    if (row.scope === 'work') {
      for (const duty of duties.slice().reverse()) {
        if (duty.end <= ready) continue;
        fit(Math.max(ready, duty.start), Math.min(limit.at, duty.end), duty.date, duty);
      }
    }
    if (P.atHome(row)) {
      const prefs = P.preferences(data.settings);
      const first = D.parts(ready).date;
      const last = D.parts(limit.at - 1).date;
      const longEnough = D.instant(first, prefs.homeEnd) - D.instant(first, prefs.homeStart) >= length;
      for (let day = last; longEnough && day >= first; day = D.addDays(day, -1)) {
        const end = Math.min(limit.at, D.instant(day, prefs.homeEnd));
        if (best && end - length <= best.start) break;
        fit(Math.max(ready, D.instant(day, prefs.homeStart)), end, day, null);
        if (best && D.parts(best.start).date >= day) break;
      }
    }
    return best ? { state: 'fit', ...best, limit, minutes: length / minute, earliest, allowEarly } :
      { state: 'no-slot', limit, minutes: length / minute };
  }

  function bookingChanged(data, row, plan, now = Date.now()) {
    const saved = row.lastSlotBooking;
    const F = D.planning;
    if (!saved || row.planFlexible || row.date !== saved.date || row.time !== saved.time ||
        !F.availableTask(data, row)) return false;
    const start = D.instant(saved.date, saved.time);
    const end = start + F.estimate(row) * minute;
    const duties = working(data);
    const duty = saved.onDuty ? duties.find(item => item.start <= start && item.end >= end) : null;
    const limit = lastSlotLimit(data, row, now, duties);
    const C = D.shiftCompanion;
    return end <= now || !limit || end > limit.at || saved.onDuty && !duty || C.blockers(data, row).length > 0 ||
      C.activePauses(data).some(item => D.same(item.taskId, row.id)) ||
      planningBlocks(plan, row, duty).some(block => overlap({ start, end }, block));
  }

  function acceptance(transfer, id) {
    return D.list(transfer?.acceptances).find(row => D.same(row.itemId, id));
  }

  function pendingAcceptance(data, duty, now = Date.now()) {
    const Dp = D.planning;
    const start = Dp.dutyWindow(data, duty)?.start;
    if (!Number.isFinite(start)) return [];
    const latest = new Map();
    for (const transfer of data.handovers) {
      if (transfer.deletedAt || stampAt(transfer.createdAt) > now) continue;
      const target = Dp.dutyWindow(data, { date: transfer.toDate, shift: transfer.toShift })?.start;
      if (!Number.isFinite(target) || target > start) continue;
      for (const id of transfer.itemIds) {
        const key = rowId(id);
        const prior = latest.get(key);
        if (!prior || target > prior.target || target === prior.target && stampAt(transfer.createdAt) >= stampAt(prior.transfer.createdAt)) {
          latest.set(key, { transfer, target, id });
        }
      }
    }
    return [...latest.values()].flatMap(({ transfer, target, id }) => {
      const row = D.byId(data.entries, id);
      return row && D.open(row) && !acceptance(transfer, id) ? [{ transfer, target, row }] : [];
    }).sort((a, b) => b.target - a.target || D.manualOrder(a.row, b.row));
  }

  function quietPeriods(data) {
    if (!data.settings.quietByRoster) return [];
    const duties = working(data);
    const since = data.settings.quietRosterSince ?? -Infinity;
    return D.shiftSchedule.restBlocks(data.roster).flatMap(block => {
      const prior = duties.findLast(row => row.date < block.start);
      const next = duties.find(row => row.date > block.end);
      const midnight = D.instant(block.start);
      const start = prior?.date === D.addDays(block.start, -1) ? prior.end : Math.max(midnight, prior?.end || 0);
      const end = next?.start ?? D.instant(D.addDays(block.end, 1));
      return end > Math.max(start, since) ? [{ start: Math.max(start, since), end, next }] : [];
    });
  }

  function quietAt(data, now = Date.now()) {
    const period = quietPeriods(data).findLast(row => row.start <= now && now < row.end);
    return period && !D.shiftCompanion.activeDuty(data, now) ? period : null;
  }

  const defer = (data, row) => row?.scope === 'work' && row.allowRosterReminder !== true &&
    !(data.settings.quietRosterCritical !== false && row.priority === 'critical');

  function workUpdates(data, now, quiet) {
    const local = D.parts(now);
    if (D.quietNow(data.settings, local.time)) return [];
    const day = D.shiftCompanion.activeDuty(data, now)?.date || local.date;
    const through = D.addDays(local.date, data.settings.soonDays);
    const duties = working(data);
    const rest = D.shiftSchedule.restBlocks(data.roster).find(block => {
      const prior = duties.findLast(duty => duty.date < block.start);
      return prior && prior.start <= now && now < Math.max(D.instant(block.start), prior.end);
    });
    const restLabel = rest && (data.roster.some(row => row.shift === 'Leave' && row.date >= rest.start && row.date <= rest.end) ? 'Leave' :
      data.roster.find(row => row.date === rest.start)?.shift || 'Rest');
    const restStart = rest && Math.max(D.instant(rest.start), duties.findLast(duty => duty.date < rest.start)?.end || 0);
    const restDuties = rest ? duties.filter(duty => duty.date > rest.end).slice(0, 2) : [];
    const inRest = ({ date, time, at }) => rest && ((date >= rest.start && date <= rest.end && (!time || at >= restStart)) ||
      restDuties.some(duty => date === duty.date || at >= duty.start && at < duty.end));
    const items = [];
    const when = (date, time, label, endOfDay = false) => ({ date, time, label,
      at: date ? endOfDay && !time ? D.instant(D.addDays(date, 1)) : D.instant(date, time || '00:00') : 0 });

    function add(row, type, dates, since = '') {
      const timing = dates.filter(item => item.date).sort((a, b) => a.at - b.at);
      const ahead = timing.find(item => inRest(item));
      const overdue = timing.find(item => item.at < now && ['Due', 'Follow up', 'Through'].includes(item.label));
      const upcoming = timing.find(item => item.date >= local.date && item.date <= through && item !== overdue);
      const age = since && D.daysBetween(since, local.date);
      const event = ahead || overdue || upcoming;
      const priority = ahead ? 0 : overdue ? 1 : age >= 7 ? 2 : upcoming ? 3 : null;
      if (priority === null) return;
      const label = ahead ? 'Before ' + restLabel : overdue ? 'Overdue' : age >= 7 ? 'Pending ' + age + ' days' : upcoming.label;
      const timingText = event && [event.label === label ? '' : event.label, D.formatDate(event.date), event.time].filter(Boolean).join(' ');
      const detail = ahead ? timingText + ' · ' + restLabel + ' starts ' + D.formatDate(rest.start) :
        timingText || 'Open since ' + D.formatDate(since);
      const key = 'work-update:' + JSON.stringify([type, row.id]);
      const signature = JSON.stringify([priority, event?.label, event?.date, event?.time, rest && ahead ? rest.start : '']);
      const saved = data.reminders[key];
      items.push({ row, type, key, day, signature, priority, at: event?.at ?? D.instant(since), label, detail,
        dismissed: saved?.day === day && saved.signature === signature });
    }

    const nextDutyEnd = restDuties.at(-1)?.end;
    const forecastThrough = [through, rest?.end || '', nextDutyEnd ? D.parts(nextDutyEnd).date : ''].sort().at(-1);
    const forecast = quiet ? [] : D.workSlots(data, local.date, forecastThrough).filter(slot => !slot.manual)
      .map(slot => ({ ...D.workSlotFields(slot), type: 'task', scope: 'work', status: 'todo', forecast: true }));
    for (const row of [...data.entries, ...forecast]) {
      if (!D.dayPlan.tracked(row) || !D.planning.availableTask(data, row) || quiet && defer(data, row)) continue;
      const routine = row.shiftStickyKey && !row.shiftDateOverride && !row.planOccurrenceOverride;
      const since = row.forecast || row.status === 'waiting' && row.followDate > local.date ? '' : row.originalDate || D.taskDay(row);
      const planned = !routine && row.date;
      add(row, 'entry', [when(row.dueDate, row.dueTime, 'Due', true), when(row.followDate, row.followTime, 'Follow up', true),
        when(planned, row.time, 'Planned')], since);
    }
    if (!quiet) for (const row of data.assignments) {
      if (!row.deletedAt && !row.completedAt) add(row, 'assignment', [when(row.assignedDate >= local.date && row.assignedDate, '', 'Starts'),
        when(row.endDate, '', 'Through', true), when(row.followDate, row.followTime, 'Follow up', true)]);
    }
    return items.sort((a, b) => a.priority - b.priority || a.at - b.at || a.row.title.localeCompare(b.row.title));
  }

  function rawReminders(data, now) {
    const rest = D.shiftSchedule.restAlerts(data, now);
    return {
      due: D.reminderRows(data, now),
      alarms: D.shiftSchedule.alarms(data, now, rest),
      warnings: D.workflow.rosterAlerts(data, D.parts(now), rest)
    };
  }

  function heldReminders(data, raw) {
    const items = new Map();
    const add = (row, label) => {
      if (defer(data, row) && !items.has(rowId(row.id))) items.set(rowId(row.id), { row, label });
    };
    for (const item of raw.alarms) add(item.row, item.label);
    for (const item of raw.due) add(item.row, 'Due reminder');
    for (const [id, item] of raw.warnings) add(item.row || D.byId(data.entries, id), item.label);
    return [...items.values()];
  }

  function reminderState(data, now = Date.now()) {
    const raw = rawReminders(data, now);
    const quiet = quietAt(data, now);
    const updates = workUpdates(data, now, quiet);
    if (!quiet) return { ...raw, quiet, updates, held: [] };
    const held = heldReminders(data, raw);
    const ids = new Set(held.map(item => rowId(item.row.id)));
    return { quiet, held, updates, due: raw.due.filter(item => !ids.has(rowId(item.row.id))),
      alarms: raw.alarms.filter(item => !ids.has(rowId(item.row.id))),
      warnings: new Map([...raw.warnings].filter(([id]) => !ids.has(id))) };
  }

  function heldForDuty(data, duty, now = Date.now()) {
    const period = quietPeriods(data).findLast(row => row.next?.date === duty.date && row.next.shift === duty.shift);
    if (!period || period.end > now) return [];
    const last = period.end - 1;
    const raw = rawReminders(data, last);
    // A roster deferral can span the user's separate daily quiet hours.
    raw.due = D.reminderRows(data, last, true);
    return heldReminders(data, raw);
  }

  D.rosterSupport = { lastWorkableSlot, bookingChanged, acceptance, pendingAcceptance, quietPeriods, quietAt, reminderState, heldForDuty };
  if (typeof module === 'object' && module.exports) module.exports = D.rosterSupport;
})(globalThis.Diary || (typeof require === 'function' ? require('./core.js') : undefined));
