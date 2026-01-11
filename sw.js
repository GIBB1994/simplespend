const CACHE_NAME = "simplespend-v0.9.1";

const FILES = [
  "./",
  "./index.html",

  "./css/styles.css",

  // Entry + auth
  "./js/main.js",
  "./js/auth.js",
  "./js/appEntry.js",
  "./js/app.js",

  // Config (prod only)
  "./js/config.public.js",

  "./manifest.json",
  "./VERSION.txt",

  "./assets/icon-192.png",
  "./assets/icon-512.png"
];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(FILES))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => k !== CACHE_NAME)
          .map((k) => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (e) => {
  const { request } = e;

  // Never cache Supabase or external ESM
  if (
    request.url.includes("supabase") ||
    request.url.includes("esm.sh")
  ) {
    return;
  }

  e.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request);
    })
  );
});
