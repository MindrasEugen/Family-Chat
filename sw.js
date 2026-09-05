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
//
// Persistito in IndexedDB invece che in una semplice variabile: il browser
// termina un service worker inattivo e lo riesegue da zero al prossimo
// evento, azzerando qualunque variabile di modulo. Una "let activeRoomId"
// tornava quindi null ogni volta che il SW veniva riavviato tra un
// aggiornamento di stato e l'arrivo di una push — facendo fallire il
// confronto "stessa camera aperta" anche a chat aperta sulla camera
// giusta. IndexedDB sopravvive al riavvio del SW, la variabile no.
const STATE_DB_NAME = "chat-app-sw-state";
const STATE_STORE_NAME = "kv";
const ACTIVE_ROOM_ID_KEY = "activeRoomId";

function openStateDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(STATE_DB_NAME, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STATE_STORE_NAME);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function setPersistedActiveRoomId(roomId) {
  try {
    const db = await openStateDb();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STATE_STORE_NAME, "readwrite");
      tx.objectStore(STATE_STORE_NAME).put(roomId, ACTIVE_ROOM_ID_KEY);
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
  } catch {}
}

async function getPersistedActiveRoomId() {
  try {
    const db = await openStateDb();
    return await new Promise((resolve, reject) => {
      const req = db.transaction(STATE_STORE_NAME, "readonly").objectStore(STATE_STORE_NAME).get(ACTIVE_ROOM_ID_KEY);
      req.onsuccess = () => resolve(req.result ?? null);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return null;
  }
}

self.addEventListener("message", (event) => {
  if (event.data?.type !== "ACTIVE_ROOM") return;
  const roomId = event.data.roomId || null;
  // L'app manda questo messaggio ogni volta che torna in primo piano o
  // cambia camera, non solo quando si tocca una notifica: senza chiuderle
  // qui, le notifiche già mostrate restavano nel pannello di sistema anche
  // dopo aver aperto l'app e letto i messaggi, e andavano cancellate a
  // mano. Da qui in poi il badge dei non letti nella lista camere prende
  // il testimone della notifica di sistema, che ha già fatto il suo lavoro.
  event.waitUntil(
    Promise.all([
      setPersistedActiveRoomId(roomId),
      self.registration.getNotifications().then((notifications) => {
        notifications.forEach((n) => n.close());
      }),
    ])
  );
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
    Promise.all([
      self.clients.matchAll({ type: "window", includeUncontrolled: true }),
      getPersistedActiveRoomId(),
    ]).then(([clientList, activeRoomId]) => {
      // Controlla se almeno una finestra è visibile o in focus
      const hasVisibleClient = clientList.some(
        (client) => client.focused || client.visibilityState === "visible"
      );

      // Sopprimi solo se l'app è visibile ED è aperta proprio sulla camera
      // del messaggio: se è aperta su un'altra camera (o sulla lista), la
      // notifica di questa deve comunque comparire. Seconda rete di
      // sicurezza rispetto all'esclusione lato server in send-push (che
      // copre solo "non notificare chi ha scritto"): questa copre invece
      // "non notificare chi sta già guardando questa camera in questo
      // momento", utile per i messaggi di ALTRI membri della stessa camera.
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
