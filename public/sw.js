/*
 * Service worker застосунку.
 *
 * Свідомо НЕ кешує сторінки застосунку й відповіді API. Спокуса показати
 * збережену головну без мережі велика, але тоді людина побачила б учорашній
 * баланс і не зрозуміла б цього. Застарілі гроші гірші за чесне «немає
 * зв'язку», тож офлайн ми показуємо саме його.
 *
 * Кешується лише оболонка: офлайн-сторінка, значки й нерухома статика Next,
 * у якої в імені є хеш вмісту — вона не може застаріти.
 */

const VERSION = "v2";
const SHELL = `taskly-shell-${VERSION}`;
const OFFLINE_URL = "/offline.html";
const PRECACHE = [OFFLINE_URL, "/manifest.json", "/icon-192.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key !== SHELL).map((key) => caches.delete(key))),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  // Перехід між сторінками: спершу мережа, і лише коли її немає —
  // пояснення замість білого екрана браузера.
  if (request.mode === "navigate") {
    event.respondWith(fetch(request).catch(() => caches.match(OFFLINE_URL)));
    return;
  }

  const url = new URL(request.url);
  if (url.origin === self.location.origin && url.pathname.startsWith("/_next/static")) {
    event.respondWith(
      caches.match(request).then(
        (hit) =>
          hit ||
          fetch(request).then((response) => {
            const copy = response.clone();
            caches.open(SHELL).then((cache) => cache.put(request, copy));
            return response;
          }),
      ),
    );
  }
});

self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = { body: event.data ? event.data.text() : "" };
  }

  event.waitUntil(
    self.registration.showNotification(payload.title || "Taskly", {
      body: payload.body || "",
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      // Однаковий tag замінює попереднє нагадування замість того, щоб
      // складати їх у стовпчик: щоденне нагадування має бути одне.
      tag: payload.tag || "taison-reminder",
      data: { url: payload.url || "/" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || "/";

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if (client.url.includes(target)) return client.focus();
      }
      return self.clients.openWindow(target);
    }),
  );
});
