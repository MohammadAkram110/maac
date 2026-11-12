/* Task Desk source rules retained for accurate import and repeat scheduling. */
(function (root) {
  "use strict";
  const STATUSES = ["pending", "in-progress", "waiting", "completed"];
  const PRIORITIES = ["critical", "high", "normal", "low"];
  const CATEGORIES = ["Work", "Personal"];
  const SHIFTS = ["", "Morning", "Evening", "Night", "Off", "Leave"];
  const AREAS = [
    "",
    "Ground Floor",
    "AN/ANC",
    "LGU",
    "Granulation",
    "Cooling and Coating",
    "Screening and Crushing",
    "Operation and Scrubbing",
    "Other",
  ];
  const REPORT_SECTIONS = [
    ["hse", "HSE/SCD Highlights"],
    ["lab", "Lab Highlights"],
    ["plant1", "Plant Highlights-1"],
    ["plant2", "Plant Highlights-2"],
    ["plant3", "Plant Highlights-3"],
    ["pending", "Pending work / next shift"],
  ];
  const REPORT_FIELDS = [
    ...REPORT_SECTIONS.map(([key]) => key),
    "verbalSummary",
    "incharge",
    "handoverTo",
  ];
  const fields = [
    "area",
    "equipment",
    "assignedBy",
    "responsible",
    "department",
    "contact",
    "shift",
    "mwr",
    "notes",
    "closingComment",
    "handover",
  ];
  const offset = 5 * 60 * 60 * 1000;
  const uuid = () =>
    globalThis.crypto?.randomUUID?.() ||
    Date.now().toString(36) + Math.random().toString(36).slice(2);
  const pad = (n) => String(n).padStart(2, "0");
  function parts(ms) {
    const d = new Date(ms + offset);
    return {
      year: d.getUTCFullYear(),
      month: d.getUTCMonth(),
      day: d.getUTCDate(),
      hours: d.getUTCHours(),
      minutes: d.getUTCMinutes(),
    };
  }
  function dateInput(ms) {
    if (ms === null || ms === undefined) return "";
    const p = parts(ms);
    return `${p.year}-${pad(p.month + 1)}-${pad(p.day)}`;
  }
  function timeInput(ms) {
    if (ms === null || ms === undefined) return "";
    const p = parts(ms);
    return `${pad(p.hours)}:${pad(p.minutes)}`;
  }
  function fromInputs(date, time) {
    return date
      ? Date.parse(date + "T" + (time || "23:59") + ":00+05:00")
      : null;
  }
  function freshTask(data = {}, now = Date.now(), order = 0) {
    const t = {
      id: uuid(),
      text: "",
      status: "pending",
      priority: "normal",
      category: "Work",
      dueAt: null,
      reminderMinutes: 15,
      repeat: null,
      seriesId: "",
      occurrence: 0,
      createdAt: now,
      updatedAt: now,
      completedAt: null,
      deleted: false,
      order,
      history: [],
      subtasks: [],
      attachments: [],
      color: "",
      dutyDate: "",
      mwrStatus: "none",
      ...Object.fromEntries(fields.map((f) => [f, ""])),
      ...data,
    };
    if (!t.seriesId) t.seriesId = t.id;
    return t;
  }
  function validateTask(raw, legacy = false) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw))
      throw new Error("A task is not valid.");
    const id = raw.id;
    if (typeof id !== "string" || !id || id.length > 180)
      throw new Error("A task ID is not valid.");
    if (
      typeof raw.text !== "string" ||
      !raw.text.trim() ||
      raw.text.length > 500
    )
      throw new Error("Each task needs a description of 1–500 characters.");
    const t = freshTask({}, 0, 0);
    t.id = id;
    t.text = raw.text.trim();
    if (legacy && typeof raw.completed !== "boolean")
      throw new Error("A task status is not valid.");
    t.status = legacy ? (raw.completed ? "completed" : "pending") : raw.status;
    if (!STATUSES.includes(t.status))
      throw new Error("A task status is not valid.");
    t.priority = raw.priority ?? "normal";
    t.category = raw.category ?? "Work";
    if (!PRIORITIES.includes(t.priority) || !CATEGORIES.includes(t.category))
      throw new Error("A priority or category is not valid.");
    for (const field of fields) {
      const v = raw[field] ?? "";
      if (typeof v !== "string" || v.length > 6000)
        throw new Error("A task detail is too long or not valid.");
      t[field] = v;
    }
    if (!SHIFTS.includes(t.shift)) throw new Error("A shift is not valid.");
    for (const f of ["createdAt", "updatedAt", "order"]) {
      const v = raw[f] ?? (f === "updatedAt" ? raw.createdAt : 0);
      if (
        typeof v !== "number" ||
        !Number.isFinite(v) ||
        (f !== "order" && Math.abs(v) > 8.64e15)
      )
        throw new Error("A task date or position is not valid.");
      t[f] = v;
    }
    for (const f of ["dueAt", "completedAt"]) {
      const v = raw[f] ?? null;
      if (
        v !== null &&
        (typeof v !== "number" || !Number.isFinite(v) || Math.abs(v) > 8.64e15)
      )
        throw new Error("A task date is not valid.");
      t[f] = v;
    }
    t.deleted = raw.deleted === true;
    const lead = raw.reminderMinutes ?? 15;
    if (![-1, 0, 5, 15, 30, 60, 1440].includes(lead))
      throw new Error("A reminder is not valid.");
    t.reminderMinutes = lead;
    if (raw.repeat) {
      const r = raw.repeat;
      if (
        !Number.isInteger(r.every) ||
        r.every < 1 ||
        r.every > 365 ||
        !["day", "week", "month", "year"].includes(r.unit) ||
        !["schedule", "completion"].includes(r.from)
      )
        throw new Error("A repeat schedule is not valid.");
      t.repeat = {
        every: r.every,
        unit: r.unit,
        from: r.from,
        anchorDay: Number.isInteger(r.anchorDay)
          ? Math.min(31, Math.max(1, r.anchorDay))
          : parts(t.dueAt ?? t.createdAt).day,
      };
    } else t.repeat = null;
    t.seriesId =
      typeof raw.seriesId === "string" && raw.seriesId.length < 160
        ? raw.seriesId
        : id;
    t.occurrence =
      Number.isInteger(raw.occurrence) && raw.occurrence >= 0
        ? raw.occurrence
        : 0;
    if (raw.history !== undefined && !Array.isArray(raw.history))
      throw new Error("Task history is not valid.");
    t.history = (raw.history ?? []).slice(-100).map((h) => {
      if (
        !h ||
        !Number.isFinite(h.at) ||
        typeof h.action !== "string" ||
        h.action.length > 200 ||
        typeof (h.note ?? "") !== "string" ||
        (h.note ?? "").length > 6000
      )
        throw new Error("Task history is not valid.");
      return { at: h.at, action: h.action, note: h.note ?? "" };
    });
    t.color = raw.color ?? "";
    if (
      typeof t.color !== "string" ||
      (t.color && !/^#[0-9a-fA-F]{6}$/.test(t.color))
    )
      throw new Error("Invalid task colour.");
    t.dutyDate = raw.dutyDate ?? "";
    if (t.dutyDate && !validDate(t.dutyDate))
      throw new Error("Invalid duty date.");
    t.mwrStatus = raw.mwrStatus ?? (t.mwr ? "raised" : "none");
    if (!["none", "to-raise", "raised", "closed"].includes(t.mwrStatus))
      throw new Error("Invalid MWR status.");
    if (
      raw.subtasks !== undefined &&
      (!Array.isArray(raw.subtasks) || raw.subtasks.length > 100)
    )
      throw new Error("A task can have up to 100 steps.");
    const ids = new Set();
    t.subtasks = (raw.subtasks ?? []).map((x) => {
      if (
        !x ||
        typeof x.id !== "string" ||
        !x.id ||
        x.id.length > 100 ||
        ids.has(x.id) ||
        typeof x.text !== "string" ||
        !x.text.trim() ||
        x.text.length > 500 ||
        typeof x.done !== "boolean"
      )
        throw new Error("Invalid checklist step.");
      ids.add(x.id);
      return { id: x.id, text: x.text.trim(), done: x.done };
    });
    if (
      raw.attachments !== undefined &&
      (!Array.isArray(raw.attachments) || raw.attachments.length > 20)
    )
      throw new Error("A task can have up to 20 attachments.");
    const files = new Set();
    t.attachments = (raw.attachments ?? []).map((f) => {
      if (
        !f ||
        typeof f.id !== "string" ||
        !/^[-a-zA-Z0-9_]{8,80}$/.test(f.id) ||
        files.has(f.id) ||
        typeof f.name !== "string" ||
        !f.name ||
        f.name.length > 255 ||
        typeof f.type !== "string" ||
        f.type.length > 150 ||
        !Number.isInteger(f.size) ||
        f.size < 0 ||
        f.size > 10000000 ||
        !Number.isFinite(f.createdAt)
      )
        throw new Error("Invalid attachment.");
      files.add(f.id);
      return {
        id: f.id,
        name: f.name,
        type: f.type,
        size: f.size,
        createdAt: f.createdAt,
        uploaded: f.uploaded === true,
      };
    });
    return t;
  }
  function validDate(s) {
    return (
      typeof s === "string" &&
      /^\d{4}-\d{2}-\d{2}$/.test(s) &&
      dateInput(fromInputs(s, "00:00")) === s
    );
  }
  function normalizeRoster(items = []) {
    if (!Array.isArray(items) || items.length > 4000)
      throw new Error("Invalid roster.");
    const ids = new Set();
    return items.map((r) => {
      if (
        !r ||
        !validDate(r.date) ||
        r.id !== r.date ||
        ids.has(r.id) ||
        !SHIFTS.slice(1).includes(r.shift) ||
        typeof r.note !== "string" ||
        r.note.length > 2000 ||
        !Number.isFinite(r.updatedAt)
      )
        throw new Error("Invalid duty.");
      ids.add(r.id);
      return {
        id: r.id,
        date: r.date,
        shift: r.shift,
        note: r.note,
        updatedAt: r.updatedAt,
        deleted: r.deleted === true,
      };
    });
  }
  function freshReport(date, shift, now = Date.now()) {
    return {
      id: date + ":" + shift,
      date,
      shift,
      createdAt: now,
      updatedAt: now,
      ready: false,
      deleted: false,
      ...Object.fromEntries(REPORT_FIELDS.map((key) => [key, ""])),
    };
  }
  function normalizeReports(items = []) {
    if (!Array.isArray(items) || items.length > 4000)
      throw new Error("A backup can contain up to 4,000 shift reports.");
    const seen = new Set();
    return items.map((raw) => {
      if (
        !raw ||
        !validDate(raw.date) ||
        !["Morning", "Evening", "Night"].includes(raw.shift) ||
        raw.id !== raw.date + ":" + raw.shift ||
        seen.has(raw.id)
      )
        throw new Error("A shift report date or shift is not valid.");
      seen.add(raw.id);
      const r = freshReport(raw.date, raw.shift, 0);
      for (const key of REPORT_FIELDS) {
        const value = raw[key] ?? "";
        if (
          typeof value !== "string" ||
          value.length > (["incharge", "handoverTo"].includes(key) ? 150 : 6000)
        )
          throw new Error("A shift report field is too long or not valid.");
        r[key] = value;
      }
      for (const key of ["createdAt", "updatedAt"]) {
        if (!Number.isFinite(raw[key]) || Math.abs(raw[key]) > 8.64e15)
          throw new Error("A shift report save date is not valid.");
        r[key] = raw[key];
      }
      if (
        (raw.ready !== undefined && typeof raw.ready !== "boolean") ||
        (raw.deleted !== undefined && typeof raw.deleted !== "boolean")
      )
        throw new Error("A shift report status is not valid.");
      r.ready = raw.ready === true;
      r.deleted = raw.deleted === true;
      return r;
    });
  }
  function reportLines(text) {
    return String(text ?? "")
      .replace(/(?:^|\s)--(?=\S)/g, "\n")
      .split(/\r?\n/)
      .map((s) => s.replace(/^\s*[•]\s*/, "").trim())
      .filter(Boolean);
  }
  function normalizeState(raw) {
    const legacy = Array.isArray(raw);
    const items = legacy ? raw : raw?.tasks;
    if (!legacy && ![2, 3, 4].includes(raw?.schemaVersion))
      throw new Error("This is not a supported Task Desk backup.");
    if (!Array.isArray(items) || items.length > 10000)
      throw new Error(
        "A backup must contain a task list with at most 10,000 records.",
      );
    const seen = new Set();
    const tasks = items.map((item, i) => {
      const t = validateTask(legacy ? { ...item, order: i } : item, legacy);
      if (seen.has(t.id))
        throw new Error("The backup contains duplicate task IDs.");
      seen.add(t.id);
      return t;
    });
    const settings = legacy ? {} : (raw.settings ?? {});
    if (
      !settings ||
      Array.isArray(settings) ||
      typeof settings !== "object" ||
      (settings.updatedAt !== undefined &&
        !Number.isFinite(settings.updatedAt)) ||
      (settings.backgroundReminders !== undefined &&
        typeof settings.backgroundReminders !== "boolean")
    )
      throw new Error("Invalid task settings.");
    return {
      schemaVersion: 4,
      tasks,
      roster: normalizeRoster(legacy ? [] : (raw.roster ?? [])),
      reports: normalizeReports(legacy ? [] : (raw.reports ?? [])),
      settings: {
        updatedAt: settings.updatedAt ?? 0,
        backgroundReminders: settings.backgroundReminders ?? true,
      },
    };
  }
  function addPeriod(ms, repeat, n = 1) {
    const p = parts(ms),
      d = new Date(ms + offset);
    if (repeat.unit === "day" || repeat.unit === "week")
      d.setUTCDate(p.day + repeat.every * n * (repeat.unit === "week" ? 7 : 1));
    else {
      const total =
        p.year * 12 +
        p.month +
        (repeat.unit === "year" ? 12 : 1) * repeat.every * n;
      const y = Math.floor(total / 12),
        m = total % 12;
      const day = Math.min(
        repeat.anchorDay || p.day,
        new Date(Date.UTC(y, m + 1, 0)).getUTCDate(),
      );
      d.setUTCFullYear(y, m, day);
    }
    return d.getTime() - offset;
  }
  function nextDueAt(task, now) {
    const r = task.repeat;
    if (!r) return null;
    if (r.from === "completion")
      return addPeriod(now, { ...r, anchorDay: parts(now).day });
    const base = task.dueAt ?? now;
    let n = 1;
    if (base < now && (r.unit === "day" || r.unit === "week"))
      n = Math.max(
        1,
        Math.floor(
          (now - base) / (86400000 * r.every * (r.unit === "week" ? 7 : 1)),
        ) + 1,
      );
    else if (base < now) {
      const a = parts(base),
        b = parts(now);
      n = Math.max(
        1,
        Math.floor(
          ((b.year - a.year) * 12 + b.month - a.month) /
            (r.every * (r.unit === "year" ? 12 : 1)),
        ),
      );
    }
    let next = addPeriod(base, r, n);
    while (next <= now) {
      n++;
      next = addPeriod(base, r, n);
    }
    return next;
  }
  const api = {
    AREAS,
    normalizeState,
    dateInput,
    timeInput,
    fromInputs,
    nextDueAt,
    reportLines,
  };
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.TaskDeskRules = api;
})(globalThis);
