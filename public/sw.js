/* Feedwise Service Worker — Web Push notifications only (never caches API responses). */

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  let payload = {
    title: "Feedwise",
    body: "",
    url: "/reader",
    tag: undefined,
  };

  if (event.data) {
    try {
      const parsed = event.data.json();
      if (parsed && typeof parsed === "object") {
        payload = {
          title: typeof parsed.title === "string" && parsed.title ? parsed.title : "Feedwise",
          body: typeof parsed.body === "string" ? parsed.body : "",
          url: typeof parsed.url === "string" && parsed.url ? parsed.url : "/reader",
          tag: typeof parsed.tag === "string" && parsed.tag ? parsed.tag : undefined,
        };
      }
    } catch {
      const text = event.data.text();
      if (text) payload.body = text;
    }
  }

  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      tag: payload.tag,
      data: { url: payload.url },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const rawUrl =
    event.notification.data && typeof event.notification.data.url === "string"
      ? event.notification.data.url
      : "/reader";

  let targetUrl = new URL("/reader", self.location.origin).href;
  try {
    targetUrl = new URL(rawUrl, self.location.origin).href;
  } catch {
    // Fallback to /reader when payload URL is malformed.
  }

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url === targetUrl && "focus" in client) {
          return client.focus();
        }
      }
      for (const client of clientList) {
        if (client.url.startsWith(self.location.origin) && "focus" in client) {
          return client.navigate(targetUrl).then((navigated) => navigated?.focus());
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
      return undefined;
    }),
  );
});
