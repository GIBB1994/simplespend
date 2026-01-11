// sw.js — SimpleSpend v0.7
const CACHE_NAME = "simplespend-v0.7";

const FILES = [
  "./",
  "./index.html",
  "./manifest.json",
  "./VERSION.txt",
  "./css/styles.css",
  "./js/app.js",
  "./assets/icon-192.png",
  "./assets/icon-512.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(FILES))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.map((k) => (k === CACHE_NAME ? null : caches.delete(k))))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request)
        .then((resp) => {
          // Cache same-origin GET requests for offline use
          if (
            event.request.method === "GET" &&
            new URL(event.request.url).origin === self.location.origin
          ) {
            const copy = resp.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
          }
          return resp;
        })
        .catch(() => cached); // best-effort fallback
    })
  );
});
