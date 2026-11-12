/* Cache only the static app files. Diary records are stored in IndexedDB. */
'use strict';

const CACHE = 'shift-life-shell-web-131ea1b33c7d373e';
const FILES = [
  "index.html",
  "styles.css",
  "task-desk.js",
  "core.js",
  "work-routines.js",
  "shift-schedule.js",
  "faith.js",
  "browser-legacy.js",
  "device-db.js",
  "task-desk-import.js",
  "work-hierarchy.js",
  "progress.js",
  "budgeting.js",
  "storage.js",
  "notebook.js",
  "expenses.js",
  "workflow.js",
  "clock.js",
  "day-tools.js",
  "shift-companion.js",
  "planning-tools.js",
  "day-plan.js",
  "planning-ui.js",
  "roster-support.js",
  "shift-companion-ui.js",
  "activity.js",
  "day-plan-ui.js",
  "assignments.js",
  "dashboard.js",
  "highlights.js",
  "coach.js",
  "workbook.js",
  "app.js",
  "icon.svg",
  "icon-192.png",
  "icon-512.png",
  "manifest.webmanifest"
];
const scope = new URL(self.registration.scope);
const urls = new Set(FILES.map(name => new URL(name, scope).href));
const home = new URL('index.html', scope).href;

self.addEventListener('install', event => {
  const requests = [...urls].map(url => new Request(url, { cache: 'reload' }));
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(requests)));
});

self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys
    .filter(key => key.startsWith('shift-life-shell-') && key !== CACHE)
    .map(key => caches.delete(key)))).then(() => self.clients.claim()));
});

self.addEventListener('message', event => {
  if (event.data === 'activate-update') event.waitUntil(self.skipWaiting());
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  url.search = '';
  const entry = request.mode === 'navigate' && url.href === scope.href ? home : url.href;
  if (!urls.has(entry)) return;
  event.respondWith(caches.match(entry, { cacheName: CACHE }).then(cached => cached || fetch(request)));
});
