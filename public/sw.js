// Minimal service worker: only caches the offline fallback page, and only
// intervenes for navigation requests. Deliberately does not attempt to
// cache API responses or app data — this app is Supabase-backed and
// auth-gated on every route, so there's no safe, generically-correct way
// to serve stale data offline. This just avoids the browser's default
// "no internet" error page when the network is down.

const CACHE_NAME = "life-os-shell-v1";
const OFFLINE_URL = "/offline.html";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.add(OFFLINE_URL)),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))),
      ),
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.mode !== "navigate") return;

  event.respondWith(
    fetch(event.request).catch(() =>
      caches.open(CACHE_NAME).then((cache) => cache.match(OFFLINE_URL)),
    ),
  );
});
