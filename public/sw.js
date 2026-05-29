// NoMans Combi service worker — handles Web Push delivery and click
// routing. Kept minimal: no offline caching strategy, no fetch
// interception. Pure notification path.

self.addEventListener("install", (event) => {
  // Skip the waiting phase so updates apply on next page load instead
  // of needing a hard refresh.
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  let payload = { title: "NoMans Combi", body: "New pickup", url: "/driver" };
  if (event.data) {
    try {
      const parsed = event.data.json();
      payload = { ...payload, ...parsed };
    } catch (e) {
      payload.body = event.data.text();
    }
  }
  const options = {
    body: payload.body,
    icon: "/icon.png",
    badge: "/icon.png",
    tag: payload.tag || "nomans-combi-ping",
    renotify: true,
    requireInteraction: false,
    vibrate: [200, 80, 200, 80, 200],
    data: { url: payload.url || "/driver" },
  };
  event.waitUntil(self.registration.showNotification(payload.title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url) || "/driver";
  event.waitUntil(
    (async () => {
      const allClients = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      // If /driver is already open in some window, focus it instead of
      // spawning a new tab.
      for (const client of allClients) {
        const url = new URL(client.url);
        if (url.pathname === targetUrl && "focus" in client) {
          return client.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
    })(),
  );
});
