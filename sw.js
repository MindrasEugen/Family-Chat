const CACHE_NAME = "chat-app-shell-v3";
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

// Il client avvisa il SW di quale camera è attualmente in primo piano,
// così la notifica push di quella stessa camera può essere soppressa
// senza sopprimere anche quelle delle altre camere in background.
let activeRoomId = null;

self.addEventListener("message", (event) => {
  if (event.data?.type === "ACTIVE_ROOM") activeRoomId = event.data.roomId || null;
});

// Notifiche push: arrivano anche ad app chiusa o schermo spento, a
// differenza della vibrazione via canale realtime (che richiede la pagina
// attiva). Il payload arriva dalla Edge Function "send-push" e include
// room_id, l'account/camera d'origine del messaggio.
self.addEventListener("push", (event) => {
  let data = { title: "Chat Famiglia", body: "Nuovo messaggio", room_id: null };
  try {
    if (event.data) data = event.data.json();
  } catch {}

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      // Controlla se almeno una finestra è visibile o in focus
      const hasVisibleClient = clientList.some(
        (client) => client.focused || client.visibilityState === "visible"
      );

      // Sopprimi solo se l'app è visibile ED è aperta proprio sulla camera
      // del messaggio: se è aperta su un'altra camera (o sulla lista), la
      // notifica di questa deve comunque comparire.
      const sameRoomOpen = hasVisibleClient && data.room_id && activeRoomId === data.room_id;
      if (sameRoomOpen) {
        return Promise.resolve();
      }

      return self.registration.showNotification(data.title, {
        body: data.body,
        icon: "icons/icon-192.png",
        badge: "icons/icon-192.png",
        vibrate: [200],
        data: { room_id: data.room_id || null },
      });
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  const roomId = event.notification.data?.room_id || null;
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then(async (allClients) => {
      const existing = allClients.find((c) => "focus" in c);
      if (existing) {
        await existing.focus();
        if (roomId) existing.postMessage({ type: "OPEN_ROOM", roomId });
        return;
      }
      return clients.openWindow(roomId ? `./?room=${encodeURIComponent(roomId)}` : "./");
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
