/* Meal Prep Portal — service worker */
const CACHE_VERSION = "mp-portal-v5";
const APP_SHELL = ["/portal", "/portal/plans", "/portal/progress", "/portal/profile", "/manifest.webmanifest"];

// Offline page for a day that was never cached. The cached /portal shell shows
// whichever day it was saved for, so serving it here would show the wrong day.
const OFFLINE_DAY_HTML = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Offline</title></head>
<body style="font-family:system-ui,sans-serif;background:#f9fafb;color:#111827;margin:0;padding:24px;">
<h1 style="font-size:20px;margin:0 0 8px;">This day isn't saved offline</h1>
<p style="color:#4b5563;margin:0 0 16px;">Reconnect to load it, or go back to your latest saved day.</p>
<a href="/portal" style="color:#047857;font-weight:600;">Back to Today</a>
</body></html>`;

function fallbackFor(req, url) {
  if (url.searchParams.has("date")) {
    return new Response(OFFLINE_DAY_HTML, {
      status: 503,
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  }
  return caches.match("/portal").then((m) => m || Response.error());
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => cache.addAll(APP_SHELL).catch(() => undefined))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // App shell + portal navigation: network-first, fallback to cache
  if (req.mode === "navigate" || url.pathname.startsWith("/portal")) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE_VERSION).then((cache) => cache.put(req, copy)).catch(() => undefined);
          return res;
        })
        .catch(() => caches.match(req).then((m) => m ?? fallbackFor(req, url)))
    );
    return;
  }

  // Static assets: cache-first
  if (url.pathname.startsWith("/_next/") || url.pathname.startsWith("/icons/")) {
    event.respondWith(
      caches.match(req).then((cached) => {
        if (cached) return cached;
        return fetch(req).then((res) => {
          const copy = res.clone();
          caches.open(CACHE_VERSION).then((cache) => cache.put(req, copy)).catch(() => undefined);
          return res;
        });
      })
    );
  }
});
