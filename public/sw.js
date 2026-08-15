self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  let payload = {};

  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = {
      body: event.data ? event.data.text() : "",
    };
  }

  const title = payload.title || "Nattuvaidyam";
  const url = payload.url || "/";

  event.waitUntil(
    self.registration.showNotification(title, {
      body: payload.body || "Tap to open the next medicinal plant update.",
      icon: payload.icon || "/favicon/web-app-manifest-192x192.png",
      badge: payload.badge || "/favicon/web-app-manifest-192x192.png",
      image: payload.image || undefined,
      tag: payload.tag || `plant-update-${payload.plantId || "latest"}`,
      data: {
        url,
        plantId: payload.plantId || null,
      },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const targetUrl = new URL(
    event.notification.data?.url || "/",
    self.location.origin,
  ).toString();

  event.waitUntil(
    (async () => {
      const windowClients = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });

      for (const client of windowClients) {
        const clientUrl = new URL(client.url);

        if (clientUrl.origin !== self.location.origin) {
          continue;
        }

        client.postMessage({
          type: "notification-open",
          url: targetUrl,
          plantId: event.notification.data?.plantId || null,
        });

        if ("navigate" in client) {
          try {
            await client.navigate(targetUrl);
          } catch {
            // Some PWA clients ignore navigate(); the app also handles the message directly.
          }
        }

        await client.focus();
        return;
      }

      const nextClient = await self.clients.openWindow(targetUrl);
      if (nextClient) {
        await nextClient.focus();
      }
    })(),
  );
});
