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
  const targetLocation = new URL(targetUrl);

  event.waitUntil(
    (async () => {
      const windowClients = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });

      const exactClient = windowClients.find((client) => {
        try {
          const clientUrl = new URL(client.url);
          return (
            clientUrl.origin === targetLocation.origin &&
            clientUrl.pathname === targetLocation.pathname &&
            clientUrl.search === targetLocation.search
          );
        } catch {
          return false;
        }
      });

      if (exactClient) {
        exactClient.postMessage({
          type: "notification-open",
          url: targetUrl,
          plantId: event.notification.data?.plantId || null,
        });
        await exactClient.focus();
        return;
      }

      if ("openWindow" in self.clients) {
        const openedClient = await self.clients.openWindow(targetUrl);

        if (openedClient) {
          try {
            openedClient.postMessage({
              type: "notification-open",
              url: targetUrl,
              plantId: event.notification.data?.plantId || null,
            });
          } catch {
            // Some browsers return a client without an active message channel yet.
          }

          await openedClient.focus();
          return;
        }
      }

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
