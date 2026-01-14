const CACHE_NAME = "simplespend-v0.9.8";

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

  // Only handle GET
  if (request.method !== "GET") return;

  // Never touch Supabase or external ESM
  if (request.url.includes("supabase") || request.url.includes("esm.sh")) return;

  const url = new URL(request.url);

  // Only handle same-origin
  if (url.origin !== self.location.origin) return;

  const isNav = request.mode === "navigate";
  const isHTML = request.headers.get("accept")?.includes("text/html");
  const isJS = url.pathname.endsWith(".js");

  // NETWORK-FIRST for navigations, HTML, and JS (so updates actually land)
  if (isNav || isHTML || isJS) {
    e.respondWith(
      fetch(request)
        .then((res) => {
          // update cache
          const copy = res.clone();
          caches.open(CACHE_NAME).then((c) => c.put(request, copy));
          return res;
        })
        .catch(() => caches.match(request).then((r) => r || caches.match("./index.html")))
    );
    return;
  }

  // CACHE-FIRST for everything else (css, icons, manifest, etc)
  e.respondWith(
    caches.match(request).then((cached) => cached || fetch(request))
  );
});

