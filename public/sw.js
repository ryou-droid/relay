/* Only public static files are cached. Never cache authenticated pages, Auth or API responses. */
const CACHE = "relay-static-v2";
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
