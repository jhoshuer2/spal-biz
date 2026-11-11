// Spal service worker.
// 1. Shows reminders and opens the app when one is tapped.
// 2. Lets the app open with no signal: it keeps the last copy of the page and the files it uses.
// Never touches /api, so a note is always sent live or kept by the app itself. Pages are fetched fresh whenever there is signal.
const VERSION = "v2";
const STATIC = "spal-static-" + VERSION;
const PAGES = "spal-pages-" + VERSION;

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) =>
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (!k.endsWith(VERSION)) await caches.delete(k);
    await self.clients.claim();
  })()),
);

async function cacheFirst(req) {
  const cache = await caches.open(STATIC);
  const hit = await cache.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok && res.type === "basic") cache.put(req, res.clone());
  return res;
}

async function pageNetworkFirst(req) {
  const cache = await caches.open(PAGES);
  try {
    const res = await Promise.race([fetch(req), new Promise((_, rej) => setTimeout(() => rej(new Error("slow")), 4000))]);
    if (res.ok && res.type === "basic") cache.put(req, res.clone());
    return res;
  } catch (e) {
    return (await cache.match(req)) || (await cache.match("/")) || Response.error();
  }
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith("/api/")) return;
  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/")) { event.respondWith(cacheFirst(req)); return; }
  if (req.mode === "navigate") event.respondWith(pageNetworkFirst(req));
});

self.addEventListener("push", (event) => {
  let d = {};
  try { d = event.data ? event.data.json() : {}; } catch (e) { d = { title: "Spal", body: event.data ? event.data.text() : "" }; }
  event.waitUntil(
    self.registration.showNotification(d.title || "Spal", {
      body: d.body || "",
      icon: "/icons/icon-192.png",
      badge: "/icons/badge-96.png",
      tag: d.tag || "spal",
      data: { url: d.url || "/" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const c of list) if ("focus" in c) { c.navigate && c.navigate(url).catch(() => {}); return c.focus(); }
      return self.clients.openWindow(url);
    }),
  );
});
