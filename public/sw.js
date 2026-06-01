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
  const navUrl = payload.navUrl || null;
  const options = {
    body: payload.body,
    icon: "/icon.png",
    badge: "/icon.png",
    tag: payload.tag || "nomans-combi-ping",
    renotify: true,
    requireInteraction: false,
    vibrate: [200, 80, 200, 80, 200],
    data: { url: payload.url || "/driver", navUrl },
    // A tappable "Navigate" button (where the platform supports notification
    // actions — Android Chrome, recent iOS). Opens maps straight to the
    // pickup; the notification body still opens the /driver queue.
    actions: navUrl ? [{ action: "navigate", title: "🧭 Navigate" }] : [],
  };
  event.waitUntil(self.registration.showNotification(payload.title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const data = event.notification.data || {};
  const navUrl = data.navUrl || null;
  const queueUrl = data.url || "/driver";

  // Tapping the "Navigate" action goes straight to the maps app (external
  // URL — just open it, no window-focusing). Any other tap opens the queue.
  if (event.action === "navigate" && navUrl) {
    event.waitUntil(self.clients.openWindow(navUrl));
    return;
  }

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
        if (url.pathname === queueUrl && "focus" in client) {
          return client.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(queueUrl);
      }
    })(),
  );
});
