/*
 * Our Share service worker: lets the app open and record expenses without signal.
 * - Screens (/t/...): network first; offline, the last copy seen (or warmed by src/app/offline).
 * - Build files (/_next/static, icons): cache first; their names change on every deploy.
 * - Everything else (Server Actions, data, other sites) goes straight to the network.
 * Cache names must match src/app/offline/client.ts.
 */
const PAGES = "pages-v1";
const ASSETS = "assets-v1";
const NAV_TIMEOUT_MS = 4000;

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      for (const name of await caches.keys()) if (name !== PAGES && name !== ASSETS) await caches.delete(name);
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/") || url.pathname === "/icon.svg") {
    event.respondWith(cacheFirst(req));
    return;
  }
  if (req.mode === "navigate" && url.pathname.startsWith("/t/")) {
    event.respondWith(networkFirst(req, url));
  }
});

async function cacheFirst(req) {
  const cache = await caches.open(ASSETS);
  const hit = await cache.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok) cache.put(req, res.clone());
  return res;
}

async function networkFirst(req, url) {
  const cache = await caches.open(PAGES);
  try {
    const res = await Promise.race([
      fetch(req),
      new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), NAV_TIMEOUT_MS)),
    ]);
    if (res.ok && !res.redirected) cache.put(url.pathname, res.clone());
    return res;
  } catch {
    const hit = (await cache.match(url.pathname)) ?? (await cache.match(req, { ignoreSearch: true }));
    if (hit) return hit;
    // A screen never opened before: fall back to quick add of the same trip if we have it.
    const trip = url.pathname.match(/^\/t\/[^/]+/)?.[0];
    const add = trip && (await cache.match(`${trip}/nuevo`));
    return add ?? offlinePage();
  }
}

function offlinePage() {
  const html = `<!doctype html><html lang="es-CO"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Sin conexión · Our Share</title><body style="margin:0;font-family:system-ui,sans-serif;background:#f4f7fb;color:#0e1f3a;display:grid;place-items:center;min-height:100dvh;text-align:center;padding:24px">
<div><p style="font-size:20px;font-weight:700;margin:0 0 8px">Sin conexión</p>
<p style="color:#52637e;margin:0">Abre el viaje una vez con señal para poder usarlo sin conexión.</p></div></body></html>`;
  return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8" } });
}

/* Web Push: one quiet notice; the same tag replaces the previous one instead of stacking. */
self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data ? event.data.text() : "" };
  }
  event.waitUntil(
    self.registration.showNotification(data.title || "Our Share", {
      body: data.body || "",
      tag: data.tag,
      data: { url: data.url || "/" },
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.url || "/", self.location.origin).href;
  event.waitUntil(
    (async () => {
      const open = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const client of open) {
        if (new URL(client.url).origin === self.location.origin && "focus" in client) {
          await client.navigate(url).catch(() => {});
          return client.focus();
        }
      }
      return self.clients.openWindow(url);
    })(),
  );
});
