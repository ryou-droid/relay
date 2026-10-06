/* Only public static files are cached. Never cache authenticated pages, Auth or API responses. */
const CACHE = "relay-static-v3";
const OFFLINE = "/offline.html";
const PUBLIC_FILES = [OFFLINE, "/launch.html", "/app-shell.css", "/app-shell.js", "/icons/relay-192.png", "/icons/relay-512.png", "/icons/relay-maskable-512.png", "/icons/apple-touch-icon.png", "/icons/relay.svg", "/favicon.ico"];
const MAX_ENTRIES = 64;

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(PUBLIC_FILES)));
  // Wait for old app windows to close before activating a new worker.
});
self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    for (const name of await caches.keys()) {
      if (name.startsWith("relay-static-") && name !== CACHE) await caches.delete(name);
    }
    await self.clients.claim();
  })());
});
self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin) return;
  // Codes and tokens must always go straight to the server, even offline.
  if (url.pathname.startsWith("/auth/")) return;
  if (request.mode === "navigate") {
    event.respondWith((async () => {
      // Existing installed PWAs still start at /app. Return ONLY the public
      // launch document; its script opens the real, uncached protected route.
      // Query-bearing URLs (including Auth parameters/RSC) never take this path.
      if ((url.pathname === "/app" || url.pathname === "/launch.html") && !url.search) {
        const shell = await caches.match("/launch.html");
        if (shell) return shell;
      }
      return fetch(request).catch(async () => (await caches.match(OFFLINE)) || Response.error());
    })());
    return;
  }
  const isStatic = !url.search && (
    PUBLIC_FILES.includes(url.pathname) ||
    /^\/_next\/static\/.+\.(?:css|js|woff2?)$/.test(url.pathname)
  );
  if (!isStatic || request.headers.has("range")) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const cached = await cache.match(request);
    if (cached) return cached;
    const response = await fetch(request);
    if (response.ok && response.type === "basic" && !response.redirected) {
      // Cache failures must never break successful network requests.
      event.waitUntil((async () => {
        try {
          await cache.put(request, response.clone());
          const keys = await cache.keys();
          const expendable = keys.filter((key) => !PUBLIC_FILES.includes(new URL(key.url).pathname));
          for (const key of expendable.slice(0, Math.max(0, keys.length - MAX_ENTRIES))) await cache.delete(key);
        } catch { /* Storage unavailable: keep the app working online. */ }
      })());
    }
    return response;
  })());
});


self.addEventListener("message", (event) => {
  if (event.data?.type === "relay-push-support") event.ports[0]?.postMessage({ newPostPush: true });
});
self.addEventListener("push", (event) => {
  event.waitUntil((async () => {
    try {
      const data = event.data?.json();
      const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (data?.kind !== "new_post" || !uuid.test(data.event_id || "") || !uuid.test(data.post_id || "")) return;
      // Recheck the current browser account, membership and suspension immediately
      // before display. Never show another account's queued push after logout/switch.
      const result = await fetch("/api/push/verify", { method: "POST", credentials: "include", cache: "no-store",
        headers: { "Content-Type": "application/json" }, body: JSON.stringify({ event_id: data.event_id }) });
      if (!result.ok || (await result.json()).allowed !== true) return;
      await self.registration.showNotification("Relay", {
        body: "新しい投稿が追加されました", icon: "/icons/relay-192.png", badge: "/icons/relay-192.png",
        tag: `relay-new-post-${data.event_id}`, renotify: false,
        data: { url: `/app/posts/${data.post_id}` },
      });
    } catch { /* No content, device keys or provider errors are logged. */ }
  })());
});
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil((async () => {
    const raw = event.notification.data?.url;
    const path = typeof raw === "string" && /^\/app\/posts\/[0-9a-f-]{36}$/i.test(raw) ? raw : "/app";
    const url = new URL(path, self.location.origin).href;
    const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const client of windows) {
      try {
        if (new URL(client.url).origin !== self.location.origin) continue;
        if ("navigate" in client) {
          const navigated = await client.navigate(url);
          if (navigated) { await navigated.focus(); return; }
        }
      } catch { /* Try another window, then open a new one. */ }
    }
    await self.clients.openWindow(url);
  })());
});
