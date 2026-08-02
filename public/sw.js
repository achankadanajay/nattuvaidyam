const CACHE_NAME = "nattuvaidyam-shell-v3";
const APP_SHELL = [
  "/",
  "/manifest.webmanifest?v=20260802a",
  "/favicon/favicon.ico?v=20260802a",
  "/favicon/favicon.svg?v=20260802a",
  "/favicon/favicon-96x96.png?v=20260802a",
  "/favicon/apple-touch-icon.png?v=20260802a",
  "/favicon/web-app-manifest-192x192.png?v=20260802a",
  "/favicon/web-app-manifest-512x512.png?v=20260802a",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;

  if (request.method !== "GET") {
    return;
  }

  const url = new URL(request.url);

  if (url.origin !== self.location.origin) {
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const cloned = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put("/", cloned));
          return response;
        })
        .catch(async () => {
          return (await caches.match(request)) || caches.match("/");
        }),
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cachedResponse) => {
      const networkResponse = fetch(request)
        .then((response) => {
          if (response.ok && response.type === "basic") {
            const cloned = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, cloned));
          }

          return response;
        })
        .catch(() => cachedResponse);

      return cachedResponse || networkResponse;
    }),
  );
});
