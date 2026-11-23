// TEKMĒ service worker (generated at build time by vite.config.ts from scripts/sw-template.js).
// Caches the app shell, fonts, artwork and the on-device model so TEKMĒ works offline.
// Only same-origin GET requests are handled; /api/* is never cached; message text is never part of a request.
const VERSION = "__VERSION__";
const PRECACHE = __FILES__;
const CACHE = "tekme-" + VERSION;

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith("tekme-") && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});
self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== self.location.origin || url.pathname.startsWith("/api/")) return;
  if (req.mode === "navigate") {
    // Network first for the page itself so updates arrive; fall back to the cached shell offline.
    event.respondWith(fetch(req).catch(() => caches.match("/index.html")));
    return;
  }
  event.respondWith(
    caches.match(req, { ignoreSearch: true }).then((hit) => hit || fetch(req).then((res) => {
      if (res.ok && res.type === "basic") { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
      return res;
    })),
  );
});
