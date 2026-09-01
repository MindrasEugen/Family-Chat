const CACHE_NAME = "chat-app-shell-v2";
const APP_SHELL = [
  "./",
  "./index.html",
  "./style.css",
  "./app.js",
  "./manifest.json",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))
    )
  );
  self.clients.claim();
});

// Notifiche push: arrivano anche ad app chiusa o schermo spento, a
// differenza della vibrazione via canale realtime (che richiede la pagina
// attiva). Il payload arriva dalla Edge Function "send-push".
self.addEventListener("push", (event) => {
  let data = { title: "Chat Famiglia", body: "Nuovo messaggio" };
  try {
    if (event.data) data = event.data.json();
  } catch {}

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      // Controlla se almeno una finestra è visibile o in focus
      const hasVisibleClient = clientList.some(
        (client) => client.focused || client.visibilityState === "visible"
      );

      // Se c'è una finestra visibile, salta silenziosamente la notifica
      if (hasVisibleClient) {
        return Promise.resolve();
      }

      // Altrimenti mostra la notifica di sistema
      return self.registration.showNotification(data.title, {
        body: data.body,
        icon: "icons/icon-192.png",
        badge: "icons/icon-192.png",
        vibrate: [200],
      });
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: "window" }).then((allClients) => {
      const existing = allClients.find((c) => "focus" in c);
      if (existing) return existing.focus();
      return clients.openWindow("./");
    })
  );
});

// Cache solo l'app shell same-origin: le chiamate a Supabase (API, auth,
// realtime) restano sempre in rete, mai intercettate dal service worker.
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin || event.request.method !== "GET") return;

  event.respondWith(
    caches.match(event.request).then((cached) => {
      const network = fetch(event.request)
        .then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});
