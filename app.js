// Progetto Supabase dedicato "todo-list-app" (eu-central-1).
// URL e anon key presi da Project Settings -> API su supabase.com.
const SUPABASE_URL = "https://qamvkevkddfwyxhbftoy.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFhbXZrZXZrZGRmd3l4aGJmdG95Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODgxOTQxMTQsImV4cCI6MjEwMzc3MDExNH0.CAJ3dYCJ84XHYKNPC5-KMAuK4nlS2vIPsQmGVOt0RvU";

const PHOTO_BUCKET = "chat-photos";
const SIGNED_URL_TTL_SECONDS = 60 * 60 * 24 * 7;
const RETENTION_DAYS = 30;
const TRANSLATE_FUNCTION = "translate-message";
const VAPID_PUBLIC_KEY = "BJhBpx9peKaS2Ze3xFzAgQUb5hzRPI35LhCKi9eqNigP_xRDyM1haDB6RRhpRbIr48o-rX1XzPM10ay78LbjJrE";
const PENDING_ROOM_KEY = "pendingRoomStorageKey";

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  });
}

// Riferimenti agli elementi del DOM
const authSection = document.getElementById("auth-section");
const authBackBtn = document.getElementById("auth-back-btn");
const roomListSection = document.getElementById("room-list-section");
const roomList = document.getElementById("room-list");
const addRoomBtn = document.getElementById("add-room-btn");
const appSection = document.getElementById("app-section");
const roomBackBtn = document.getElementById("room-back-btn");
const roomTitle = document.getElementById("room-title");
const authMessage = document.getElementById("auth-message");
const chatMessage = document.getElementById("chat-message");
const emailInput = document.getElementById("email");
const passwordInput = document.getElementById("password");
const loginBtn = document.getElementById("login-btn");
const signupBtn = document.getElementById("signup-btn");
const logoutBtn = document.getElementById("logout-btn");
const chatForm = document.getElementById("chat-form");
const messageInput = document.getElementById("message-input");
const messageList = document.getElementById("message-list");
const loadingOverlay = document.getElementById("loading-overlay");
const photoInput = document.getElementById("photo-input");
const photoPreview = document.getElementById("photo-preview");
const photoPreviewImg = document.getElementById("photo-preview-img");
const photoPreviewRemoveBtn = document.getElementById("photo-preview-remove");
const deviceNameOverlay = document.getElementById("device-name-overlay");
const deviceNameInput = document.getElementById("device-name-input");
const deviceNameConfirmBtn = document.getElementById("device-name-confirm-btn");
const notificationsToggleBtn = document.getElementById("notifications-toggle-btn");
const translationToggleBtn = document.getElementById("translation-toggle-btn");

// Ogni "camera" è un account Supabase con la propria sessione, isolata dalle
// altre tramite una storageKey dedicata: tutte restano vive contemporaneamente
// (sessione, canale realtime, push) anche quando non sono quella aperta.
const rooms = new Map(); // storageKey -> room
let activeRoomKey = null;
let pendingClient = null;
let pendingStorageKey = null;
let deviceNamePrompted = false;

let loadingCount = 0;
let selectedPhotoFile = null;
let previewObjectUrl = null;

function showLoading(isLoading) {
  loadingCount = Math.max(0, loadingCount + (isLoading ? 1 : -1));
  loadingOverlay.classList.toggle("hidden", loadingCount === 0);
}

function setMessage(el, text, type) {
  el.textContent = text || "";
  el.classList.remove("error", "success");
  if (type) el.classList.add(type);
}

function updateEmptyState() {
  const hasItems = messageList.querySelectorAll("li:not(.empty-state)").length > 0;
  let emptyState = messageList.querySelector(".empty-state");
  if (!hasItems && !emptyState) {
    emptyState = document.createElement("div");
    emptyState.className = "empty-state";
    emptyState.innerHTML = '<div class="empty-state-icon">💬</div><p class="empty-state-text">Nessun messaggio. Scrivi il primo!</p>';
    messageList.appendChild(emptyState);
  } else if (hasItems && emptyState) {
    emptyState.remove();
  }
}

function scrollToBottom() {
  messageList.scrollTop = messageList.scrollHeight;
}

// Ridimensiona e ricomprime la foto lato client prima dell'upload:
// le foto scattate da un cellulare possono pesare diversi MB, inaccettabile su rete mobile.
async function compressImage(file, maxDimension = 1600, quality = 0.8) {
  const bitmap = await createImageBitmap(file);
  let { width, height } = bitmap;
  if (width > maxDimension || height > maxDimension) {
    const scale = maxDimension / Math.max(width, height);
    width = Math.round(width * scale);
    height = Math.round(height * scale);
  }
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  canvas.getContext("2d").drawImage(bitmap, 0, 0, width, height);
  return new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
}

function getDeviceLang() {
  return (navigator.language || "en").split("-")[0].toLowerCase();
}

// Nome del dispositivo: salvato solo in locale (localStorage), condiviso da
// tutte le camere di questo device. Serve solo a mostrare "chi" ha scritto
// un messaggio, dato che più persone possono condividere lo stesso account/camera.
function getDeviceName() {
  try {
    return localStorage.getItem("deviceName");
  } catch {
    return null;
  }
}

function setDeviceName(name) {
  try {
    localStorage.setItem("deviceName", name);
  } catch {}
}

function getBoolPref(key, defaultValue) {
  try {
    const stored = localStorage.getItem(key);
    return stored === null ? defaultValue : stored === "true";
  } catch {
    return defaultValue;
  }
}

function setBoolPref(key, value) {
  try {
    localStorage.setItem(key, String(value));
  } catch {}
}

function areNotificationsEnabled() {
  return getBoolPref("notificationsEnabled", true);
}

function isAutoTranslateEnabled() {
  return getBoolPref("autoTranslateEnabled", true);
}

function showDeviceNamePrompt(onDone) {
  deviceNameOverlay.classList.remove("hidden");
  deviceNameInput.value = "";
  deviceNameInput.focus();

  const confirmName = () => {
    const name = deviceNameInput.value.trim();
    if (!name) return;
    setDeviceName(name);
    deviceNameOverlay.classList.add("hidden");
    deviceNameConfirmBtn.removeEventListener("click", confirmName);
    deviceNameInput.removeEventListener("keydown", onKeydown);
    onDone();
  };
  const onKeydown = (e) => {
    if (e.key === "Enter") confirmName();
  };

  deviceNameConfirmBtn.addEventListener("click", confirmName);
  deviceNameInput.addEventListener("keydown", onKeydown);
}

function ensureDeviceNamePrompted() {
  if (deviceNamePrompted || getDeviceName()) return;
  deviceNamePrompted = true;
  showDeviceNamePrompt(() => {});
}

// Cache locale (per dispositivo): evita di ritradurre lo stesso messaggio
// ad ogni apertura dell'app, risparmiando chiamate e costo verso Mistral.
// Le chiavi sono per messageId (UUID globalmente unico su tutte le camere,
// che condividono la stessa tabella "messages"), nessun rischio di collisione.
function getCachedTranslation(messageId, lang) {
  try {
    return localStorage.getItem(`translation_${messageId}_${lang}`);
  } catch {
    return null;
  }
}

function setCachedTranslation(messageId, lang, text) {
  try {
    localStorage.setItem(`translation_${messageId}_${lang}`, text);
  } catch {}
}

async function translateText(client, messageId, text) {
  const lang = getDeviceLang();
  const cached = getCachedTranslation(messageId, lang);
  if (cached) return cached;
  try {
    const { data, error } = await client.functions.invoke(TRANSLATE_FUNCTION, {
      body: { text, targetLang: lang },
    });
    if (error || !data?.translatedText) return null;
    setCachedTranslation(messageId, lang, data.translatedText);
    return data.translatedText;
  } catch {
    return null;
  }
}

async function renderMessage(room, message) {
  if (messageList.querySelector(`li[data-id="${message.id}"]`)) return;
  const li = document.createElement("li");
  li.className = "chat-bubble";
  li.dataset.id = message.id;
  li.dataset.imagePath = message.image_path || "";

  const senderHtml = message.device_name ? `<span class="bubble-sender">${escapeHtml(message.device_name)}</span>` : "";
  const imgHtml = message.image_path
    ? '<div class="bubble-image-wrap"><img class="bubble-image" alt="Foto"></div>'
    : "";
  const textHtml = message.content ? `<p class="bubble-text">${escapeHtml(message.content)}</p>` : "";
  const time = new Date(message.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  li.innerHTML = `${senderHtml}${imgHtml}${textHtml}<div class="bubble-footer"><span class="bubble-time">${time}</span><button class="msg-delete-btn" data-id="${message.id}" aria-label="Elimina messaggio">🗑</button></div>`;
  messageList.appendChild(li);
  requestAnimationFrame(() => {
    li.classList.add("enter");
  });
  scrollToBottom();
  updateEmptyState();

  if (message.image_path) {
    const { data, error } = await room.client.storage
      .from(PHOTO_BUCKET)
      .createSignedUrl(message.image_path, SIGNED_URL_TTL_SECONDS);
    if (!error && data?.signedUrl) {
      const img = li.querySelector(".bubble-image");
      if (img) img.src = data.signedUrl;
      scrollToBottom();
    }
  }

  if (message.content && isAutoTranslateEnabled()) {
    const translated = await translateText(room.client, message.id, message.content);
    if (translated && translated !== message.content) {
      const textEl = li.querySelector(".bubble-text");
      if (textEl) textEl.textContent = translated;
      const footer = li.querySelector(".bubble-footer");
      if (footer && !footer.querySelector(".translated-badge")) {
        const badge = document.createElement("span");
        badge.className = "translated-badge";
        badge.textContent = "🌐";
        badge.title = "Messaggio tradotto automaticamente";
        footer.insertBefore(badge, footer.firstChild);
      }
    }
  }
}

function removeMessageFromList(id) {
  const li = messageList.querySelector(`li[data-id="${id}"]`);
  if (!li) return;
  li.classList.add("leave");
  const onAnimationEnd = () => {
    li.removeEventListener("animationend", onAnimationEnd);
    li.remove();
    updateEmptyState();
  };
  li.addEventListener("animationend", onAnimationEnd);
  setTimeout(() => {
    if (li.parentElement) {
      li.removeEventListener("animationend", onAnimationEnd);
      li.remove();
      updateEmptyState();
    }
  }, 250);
}

async function loadMessages(room) {
  showLoading(true);
  messageList.innerHTML = "";
  const { data, error } = await room.client
    .from("messages")
    .select("*")
    .order("created_at", { ascending: true });
  showLoading(false);
  if (error) {
    setMessage(chatMessage, "Errore nel caricamento dei messaggi.", "error");
    updateEmptyState();
    return;
  }
  data.forEach((message) => renderMessage(room, message));
  updateEmptyState();
}

// Ultimo messaggio + conteggio non letti per la riga di questa camera nella
// lista: il "letto" è tracciato per dispositivo (localStorage), non sincronizzato
// tra i device della stessa camera — coerente con device_name, anch'esso locale.
function getLastRead(userId) {
  try {
    return localStorage.getItem(`chatFamiglia.lastRead.${userId}`);
  } catch {
    return null;
  }
}

function setLastRead(userId, iso) {
  try {
    localStorage.setItem(`chatFamiglia.lastRead.${userId}`, iso);
  } catch {}
}

async function loadRoomPreview(room) {
  const { data: last } = await room.client
    .from("messages")
    .select("id,content,image_path,device_name,created_at")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  room.lastMessage = last || null;
  const lastReadIso = getLastRead(room.userId);
  const { count } = await room.client
    .from("messages")
    .select("id", { count: "exact", head: true })
    .gt("created_at", lastReadIso || "1970-01-01T00:00:00.000Z");
  room.unreadCount = count || 0;
}

// Elimina i messaggi (e le foto collegate) più vecchi di RETENTION_DAYS.
// Girando lato client con la sessione autenticata della camera, sfrutta le
// stesse policy RLS già in vigore: nessun ruolo privilegiato o servizio
// esterno necessario. Le eliminazioni si propagano agli altri dispositivi
// tramite il canale realtime già sottoscritto.
async function cleanupOldMessages(room) {
  const cutoffIso = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const { data: oldMessages, error: selectError } = await room.client
    .from("messages")
    .select("id, image_path")
    .lt("created_at", cutoffIso);
  if (selectError || !oldMessages || oldMessages.length === 0) return;

  const imagePaths = oldMessages.filter((m) => m.image_path).map((m) => m.image_path);
  if (imagePaths.length > 0) {
    room.client.storage.from(PHOTO_BUCKET).remove(imagePaths).catch(() => {});
  }
  await room.client.from("messages").delete().lt("created_at", cutoffIso);
}

// Sottoscrive questo dispositivo alle notifiche push del sistema operativo per
// questa camera: a differenza della vibrazione via canale realtime, queste
// arrivano anche ad app chiusa o schermo spento. Il browser ha un solo
// endpoint push condiviso da tutte le camere: qui si registra solo la riga
// DB (endpoint, user_id) per questa camera, il permesso/subscribe è per device.
async function setupPushSubscriptionForRoom(room) {
  if (!("serviceWorker" in navigator) || !("PushManager" in window) || !room.userId) return;
  try {
    const registration = await navigator.serviceWorker.ready;
    let subscription = await registration.pushManager.getSubscription();
    if (!subscription) {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") return;
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      });
    }
    const json = subscription.toJSON();
    await room.client.from("push_subscriptions").upsert(
      {
        user_id: room.userId,
        device_name: getDeviceName(),
        endpoint: json.endpoint,
        p256dh: json.keys.p256dh,
        auth: json.keys.auth,
      },
      { onConflict: "endpoint,user_id" }
    );
  } catch {
    // Permesso negato o sottoscrizione fallita: l'app continua a funzionare
    // normalmente, semplicemente senza notifiche push per questa camera.
  }
}

// Rimuove solo la riga di questa camera: l'endpoint push resta condiviso
// dalle altre camere ancora attive su questo device, non va disiscritto qui.
async function disablePushSubscriptionForRoom(room) {
  if (!room.userId) return;
  try {
    await room.client.from("push_subscriptions").delete().eq("user_id", room.userId);
  } catch {}
}

async function unsubscribeSharedPushEndpoint() {
  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    if (subscription) await subscription.unsubscribe();
  } catch {}
}

// Il canale realtime può cadere senza preavviso (schermo del telefono
// bloccato, app in background, rete che va e viene) e supabase-js non
// riconsegna gli eventi persi alla riconnessione: prima di questa fix
// l'unico modo per rivedere i messaggi arrivati nel frattempo era
// ricaricare l'intera app. Ora ogni SUBSCRIBED (sia il primo che quelli
// dopo una riconnessione) fa anche un fetch di recupero dei messaggi più
// recenti dell'ultimo visto, e un CHANNEL_ERROR/TIMED_OUT/CLOSED
// pianifica una nuova sottoscrizione invece di restare morto in silenzio.
function subscribeRealtimeForRoom(room) {
  if (room.reconnectTimer) {
    clearTimeout(room.reconnectTimer);
    room.reconnectTimer = null;
  }
  if (room.channel) room.client.removeChannel(room.channel);
  room.channel = room.client
    .channel(`messages-changes-${room.userId}`)
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages", filter: `user_id=eq.${room.userId}` }, (payload) => {
      onRoomMessageInsert(room, payload.new);
    })
    .on("postgres_changes", { event: "DELETE", schema: "public", table: "messages", filter: `user_id=eq.${room.userId}` }, (payload) => {
      onRoomMessageDelete(room, payload.old.id);
    })
    .subscribe((status) => {
      if (status === "SUBSCRIBED") {
        catchUpMessages(room);
      } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
        scheduleRealtimeResubscribe(room);
      }
    });
}

function scheduleRealtimeResubscribe(room) {
  if (room.reconnectTimer || !rooms.has(room.storageKey)) return;
  room.reconnectTimer = setTimeout(() => {
    room.reconnectTimer = null;
    if (rooms.get(room.storageKey) === room && room.userId) subscribeRealtimeForRoom(room);
  }, 3000);
}

// Recupera i messaggi (insert e, indirettamente, gli aggiornamenti di lista)
// arrivati mentre il canale realtime era giù. Sicuro da richiamare anche
// quando non è successo nulla: la query non trova righe più recenti
// dell'ultimo messaggio noto e non fa nulla.
async function catchUpMessages(room) {
  if (!room.userId) return;
  const sinceIso = room.lastMessage?.created_at || "1970-01-01T00:00:00.000Z";
  const { data, error } = await room.client
    .from("messages")
    .select("*")
    .gt("created_at", sinceIso)
    .order("created_at", { ascending: true });
  if (error || !data) return;
  data.forEach((message) => onRoomMessageInsert(room, message));
}

function unsubscribeRealtimeForRoom(room) {
  if (room.reconnectTimer) {
    clearTimeout(room.reconnectTimer);
    room.reconnectTimer = null;
  }
  if (room.channel) {
    room.client.removeChannel(room.channel);
    room.channel = null;
  }
}

function onRoomMessageInsert(room, message) {
  room.lastMessage = message;
  if (activeRoomKey === room.storageKey) {
    renderMessage(room, message);
    setLastRead(room.userId, message.created_at);
    room.unreadCount = 0;
  } else {
    room.unreadCount += 1;
  }
  renderRoomList();
}

function onRoomMessageDelete(room, id) {
  if (activeRoomKey === room.storageKey) removeMessageFromList(id);
  if (room.lastMessage?.id === id) loadRoomPreview(room).then(renderRoomList);
}

function clearPhotoSelection() {
  selectedPhotoFile = null;
  photoInput.value = "";
  if (previewObjectUrl) {
    URL.revokeObjectURL(previewObjectUrl);
    previewObjectUrl = null;
  }
  photoPreviewImg.src = "";
  photoPreview.classList.add("hidden");
}

function showScreen(name) {
  authSection.classList.toggle("hidden", name !== "auth");
  roomListSection.classList.toggle("hidden", name !== "rooms");
  appSection.classList.toggle("hidden", name !== "chat");
  // Voce di navigazione verso la sezione Traduttore (translator.js):
  // lookup lazy perché translator.js è caricato dopo app.js.
  document.getElementById("translator-section")?.classList.toggle("hidden", name !== "translator");
}

function createSupabaseClientForRoom(storageKey, opts = {}) {
  return window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { storageKey, persistSession: true, autoRefreshToken: true, detectSessionInUrl: false, ...opts },
  });
}

// Prima di questa funzione l'app aveva un solo account per device, con la
// sessione nella storageKey di default di supabase-js. Al primo avvio dopo
// l'aggiornamento la spostiamo su una storageKey "sb-room-*" dedicata e la
// registriamo come prima camera, senza forzare un logout.
function migrateLegacySessionIfNeeded() {
  if (loadRoomRegistry().length > 0) return;
  const legacyKey = findLegacyStorageKey();
  if (!legacyKey) return;
  const value = localStorage.getItem(legacyKey);
  if (!value) return;
  const newKey = `sb-room-${crypto.randomUUID()}`;
  localStorage.setItem(newKey, value);
  localStorage.removeItem(legacyKey);
  upsertRegistryEntry({ storageKey: newKey, userId: null, label: null, pendingConfirmation: false });
}

async function startRoom(room) {
  room.chatStarted = true;
  await Promise.all([loadRoomPreview(room), cleanupOldMessages(room)]);
  subscribeRealtimeForRoom(room);
  if (areNotificationsEnabled()) setupPushSubscriptionForRoom(room);
  renderRoomList();
}

// Gestisce ogni cambio di sessione per una camera: prima registrazione,
// refresh automatico, logout, o rientro dopo un login/relogin manuale.
// È l'unico punto che avvia/riprende una camera, sia per il flusso
// "aggiungi camera" sia per il ripristino da localStorage all'avvio.
async function handleRoomAuthChange(room, session) {
  if (session?.user) {
    const duplicate = [...rooms.values()].find((r) => r !== room && r.userId === session.user.id);
    if (duplicate) {
      try {
        await room.client.auth.signOut();
      } catch {}
      rooms.delete(room.storageKey);
      try {
        localStorage.removeItem(room.storageKey);
      } catch {}
      removeRegistryEntry(room.storageKey);
      if (pendingStorageKey === room.storageKey) {
        setMessage(authMessage, "Questo account è già stato aggiunto.", "error");
      }
      renderRoomList();
      return;
    }

    const wasNeedsLogin = room.needsLogin;
    room.userId = session.user.id;
    room.label = room.label || session.user.email;
    room.needsLogin = false;
    room.pendingConfirmation = false;
    upsertRegistryEntry({ storageKey: room.storageKey, userId: room.userId, label: room.label, pendingConfirmation: false });

    if (!room.chatStarted) {
      await startRoom(room);
    } else if (wasNeedsLogin) {
      subscribeRealtimeForRoom(room);
      if (areNotificationsEnabled()) setupPushSubscriptionForRoom(room);
    }
    ensureDeviceNamePrompted();

    if (pendingStorageKey === room.storageKey) {
      pendingClient = null;
      pendingStorageKey = null;
      showScreen("rooms");
    }
  } else {
    room.needsLogin = true;
    unsubscribeRealtimeForRoom(room);
  }
  renderRoomList();
  if (activeRoomKey === room.storageKey) refreshChatHeader(room);
}

async function initRoomFromRegistryEntry(entry) {
  const client = createSupabaseClientForRoom(entry.storageKey);
  const room = {
    storageKey: entry.storageKey,
    userId: entry.userId,
    label: entry.label,
    client,
    channel: null,
    reconnectTimer: null,
    chatStarted: false,
    needsLogin: false,
    pendingConfirmation: !!entry.pendingConfirmation,
    lastMessage: null,
    unreadCount: 0,
  };
  rooms.set(entry.storageKey, room);
  client.auth.onAuthStateChange((_event, session) => handleRoomAuthChange(room, session));
  const {
    data: { session },
  } = await client.auth.getSession();
  await handleRoomAuthChange(room, session);
}

// Consuma il redirect di conferma email dopo una signUp: succede in un
// caricamento di pagina completamente nuovo, quindi si affida a
// localStorage (PENDING_ROOM_KEY) per sapere a quale camera "in sospeso"
// appartiene la sessione appena confermata.
async function consumePendingEmailConfirmation() {
  const hasAuthParams = location.hash.includes("access_token") || new URLSearchParams(location.search).has("code");
  const storageKey = localStorage.getItem(PENDING_ROOM_KEY);
  if (!hasAuthParams || !storageKey) return;
  localStorage.removeItem(PENDING_ROOM_KEY);

  const client = createSupabaseClientForRoom(storageKey, { detectSessionInUrl: true });
  const room = {
    storageKey,
    userId: null,
    label: null,
    client,
    channel: null,
    reconnectTimer: null,
    chatStarted: false,
    needsLogin: true,
    pendingConfirmation: false,
    lastMessage: null,
    unreadCount: 0,
  };
  rooms.set(storageKey, room);
  client.auth.onAuthStateChange((_event, session) => handleRoomAuthChange(room, session));
  const {
    data: { session },
  } = await client.auth.getSession();
  history.replaceState(null, "", location.pathname);
  await handleRoomAuthChange(room, session);
}

function startAddRoomFlow({ isFirstRoom }) {
  const storageKey = `sb-room-${crypto.randomUUID()}`;
  const client = createSupabaseClientForRoom(storageKey, { detectSessionInUrl: true });
  const room = {
    storageKey,
    userId: null,
    label: null,
    client,
    channel: null,
    reconnectTimer: null,
    chatStarted: false,
    needsLogin: true,
    pendingConfirmation: false,
    lastMessage: null,
    unreadCount: 0,
  };
  rooms.set(storageKey, room);
  client.auth.onAuthStateChange((_event, session) => handleRoomAuthChange(room, session));

  pendingClient = client;
  pendingStorageKey = storageKey;
  authBackBtn.classList.toggle("hidden", isFirstRoom);
  setMessage(authMessage, "");
  emailInput.value = "";
  passwordInput.value = "";
  showScreen("auth");
}

function startReloginFlow(room) {
  pendingClient = room.client;
  pendingStorageKey = room.storageKey;
  authBackBtn.classList.remove("hidden");
  setMessage(authMessage, "");
  emailInput.value = "";
  passwordInput.value = "";
  showScreen("auth");
}

async function removeRoom(storageKey) {
  const room = rooms.get(storageKey);
  if (!room) return;
  await disablePushSubscriptionForRoom(room);
  unsubscribeRealtimeForRoom(room);
  try {
    await room.client.auth.signOut();
  } catch {}
  try {
    localStorage.removeItem(storageKey);
  } catch {}
  if (room.userId) {
    try {
      localStorage.removeItem(`chatFamiglia.lastRead.${room.userId}`);
    } catch {}
  }
  rooms.delete(storageKey);
  removeRegistryEntry(storageKey);
  if (rooms.size === 0) await unsubscribeSharedPushEndpoint();
  if (activeRoomKey === storageKey) {
    closeRoomToList();
  } else {
    renderRoomList();
  }
}

function notifyServiceWorkerActiveRoom(userId) {
  navigator.serviceWorker.controller?.postMessage({ type: "ACTIVE_ROOM", roomId: userId || null });
}

function refreshChatHeader(room) {
  roomTitle.textContent = room.label || "Chat Famiglia";
}

function openRoom(storageKey) {
  const room = rooms.get(storageKey);
  if (!room || !room.userId) return;
  activeRoomKey = storageKey;
  showScreen("chat");
  refreshChatHeader(room);
  setMessage(chatMessage, "");
  clearPhotoSelection();
  loadMessages(room);
  setLastRead(room.userId, new Date().toISOString());
  room.unreadCount = 0;
  renderRoomList();
  notifyServiceWorkerActiveRoom(room.userId);
}

function closeRoomToList() {
  activeRoomKey = null;
  messageList.innerHTML = "";
  showScreen("rooms");
  renderRoomList();
  notifyServiceWorkerActiveRoom(null);
}

function openRoomByUserId(userId) {
  const entry = [...rooms.entries()].find(([, r]) => r.userId === userId);
  if (entry) openRoom(entry[0]);
}

function maybeOpenRoomFromUrl() {
  const roomParam = new URLSearchParams(location.search).get("room");
  if (!roomParam) return;
  openRoomByUserId(roomParam);
  history.replaceState(null, "", location.pathname);
}

function renderRoomList() {
  const entries = [...rooms.values()].sort((a, b) => (b.lastMessage?.created_at || "").localeCompare(a.lastMessage?.created_at || ""));
  roomList.innerHTML = "";
  for (const room of entries) {
    const li = document.createElement("li");
    li.className = "room-row" + (room.needsLogin ? " needs-login" : "");
    li.dataset.storageKey = room.storageKey;
    const time = room.lastMessage ? new Date(room.lastMessage.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "";
    const previewText = room.needsLogin
      ? "Tocca per accedere di nuovo"
      : room.pendingConfirmation
      ? "In attesa di conferma email"
      : formatPreviewText(room.lastMessage);
    li.innerHTML = `
      <div class="room-avatar">${escapeHtml(roomInitial(room.label))}</div>
      <div class="room-info">
        <div class="room-label">${escapeHtml(room.label || "Camera")}</div>
        <div class="room-preview">${escapeHtml(previewText)}</div>
      </div>
      <div class="room-meta">
        <span class="room-time">${time}</span>
        ${room.unreadCount > 0 ? `<span class="room-unread-badge">${room.unreadCount}</span>` : ""}
      </div>
    `;
    roomList.appendChild(li);
  }
}

roomList.addEventListener("click", (e) => {
  const li = e.target.closest(".room-row");
  if (!li) return;
  const room = rooms.get(li.dataset.storageKey);
  if (!room) return;
  if (room.needsLogin) {
    startReloginFlow(room);
  } else {
    openRoom(room.storageKey);
  }
});

addRoomBtn.addEventListener("click", () => startAddRoomFlow({ isFirstRoom: false }));

roomBackBtn.addEventListener("click", closeRoomToList);

authBackBtn.addEventListener("click", () => {
  const room = pendingStorageKey ? rooms.get(pendingStorageKey) : null;
  if (room && !room.userId) {
    rooms.delete(pendingStorageKey);
    try {
      localStorage.removeItem(pendingStorageKey);
    } catch {}
  }
  pendingClient = null;
  pendingStorageKey = null;
  showScreen("rooms");
});

loginBtn.addEventListener("click", async () => {
  if (!pendingClient) return;
  setMessage(authMessage, "");
  showLoading(true);
  const { error } = await pendingClient.auth.signInWithPassword({ email: emailInput.value, password: passwordInput.value });
  showLoading(false);
  if (error) setMessage(authMessage, error.message, "error");
});

signupBtn.addEventListener("click", async () => {
  if (!pendingClient) return;
  setMessage(authMessage, "");
  showLoading(true);
  const { data, error } = await pendingClient.auth.signUp({ email: emailInput.value, password: passwordInput.value });
  showLoading(false);
  if (error) {
    setMessage(authMessage, error.message, "error");
    return;
  }
  if (!data.session) {
    const room = rooms.get(pendingStorageKey);
    if (room) {
      room.pendingConfirmation = true;
      room.label = emailInput.value;
      upsertRegistryEntry({ storageKey: room.storageKey, userId: null, label: room.label, pendingConfirmation: true });
    }
    try {
      localStorage.setItem(PENDING_ROOM_KEY, pendingStorageKey);
    } catch {}
    setMessage(authMessage, "Registrazione avvenuta. Controlla la tua email per confermare l'account.", "success");
  }
});

logoutBtn.addEventListener("click", async () => {
  const room = activeRoomKey ? rooms.get(activeRoomKey) : null;
  if (!room) return;
  if (!confirm(`Rimuovere "${room.label || "questa camera"}" da questo dispositivo?`)) return;
  showLoading(true);
  await removeRoom(room.storageKey);
  showLoading(false);
});

photoInput.addEventListener("change", () => {
  const file = photoInput.files[0];
  if (!file) return;
  if (!file.type.startsWith("image/")) {
    setMessage(chatMessage, "Puoi allegare solo immagini.", "error");
    photoInput.value = "";
    return;
  }
  setMessage(chatMessage, "");
  selectedPhotoFile = file;
  if (previewObjectUrl) URL.revokeObjectURL(previewObjectUrl);
  previewObjectUrl = URL.createObjectURL(file);
  photoPreviewImg.src = previewObjectUrl;
  photoPreview.classList.remove("hidden");
});

photoPreviewRemoveBtn.addEventListener("click", () => {
  clearPhotoSelection();
});

chatForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const room = activeRoomKey ? rooms.get(activeRoomKey) : null;
  if (!room) return;
  const text = messageInput.value.trim();
  if (!text && !selectedPhotoFile) return;
  setMessage(chatMessage, "");
  showLoading(true);
  try {
    let imagePath = null;
    if (selectedPhotoFile) {
      const compressed = await compressImage(selectedPhotoFile);
      imagePath = `${room.userId}/${crypto.randomUUID()}.jpg`;
      const { error: uploadError } = await room.client.storage
        .from(PHOTO_BUCKET)
        .upload(imagePath, compressed, { contentType: "image/jpeg" });
      if (uploadError) throw uploadError;
    }
    const { error } = await room.client.from("messages").insert({ content: text || null, image_path: imagePath, device_name: getDeviceName() });
    if (error) throw error;
    messageInput.value = "";
    clearPhotoSelection();
  } catch (err) {
    setMessage(chatMessage, "Errore nell'invio del messaggio.", "error");
  } finally {
    showLoading(false);
  }
});

messageList.addEventListener("click", async (e) => {
  if (!e.target.matches(".msg-delete-btn")) return;
  const room = activeRoomKey ? rooms.get(activeRoomKey) : null;
  if (!room) return;
  const id = e.target.dataset.id;
  const li = messageList.querySelector(`li[data-id="${id}"]`);
  const imagePath = li?.dataset.imagePath || "";
  showLoading(true);
  const { error } = await room.client.from("messages").delete().eq("id", id);
  showLoading(false);
  if (error) {
    setMessage(chatMessage, "Errore nell'eliminazione del messaggio.", "error");
    return;
  }
  if (imagePath) {
    room.client.storage.from(PHOTO_BUCKET).remove([imagePath]).catch(() => {});
  }
  removeMessageFromList(id);
});

function updateToggleButtons() {
  const notifOn = areNotificationsEnabled();
  notificationsToggleBtn.textContent = notifOn ? "🔔" : "🔕";
  notificationsToggleBtn.classList.toggle("off", !notifOn);
  notificationsToggleBtn.title = notifOn
    ? "Notifiche attive (tocca per disattivare)"
    : "Notifiche disattivate (tocca per attivare)";

  const translateOn = isAutoTranslateEnabled();
  translationToggleBtn.textContent = "🌐";
  translationToggleBtn.classList.toggle("off", !translateOn);
  translationToggleBtn.title = translateOn
    ? "Traduzione automatica attiva (tocca per disattivare)"
    : "Traduzione automatica disattivata (tocca per attivare)";
}

notificationsToggleBtn.addEventListener("click", () => {
  const enabling = !areNotificationsEnabled();
  setBoolPref("notificationsEnabled", enabling);
  updateToggleButtons();
  if (enabling) {
    rooms.forEach((room) => {
      if (room.userId) setupPushSubscriptionForRoom(room);
    });
  } else {
    Promise.all([...rooms.values()].map(disablePushSubscriptionForRoom)).then(unsubscribeSharedPushEndpoint);
  }
});

translationToggleBtn.addEventListener("click", () => {
  setBoolPref("autoTranslateEnabled", !isAutoTranslateEnabled());
  updateToggleButtons();
});

updateToggleButtons();

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.addEventListener("message", (event) => {
    if (event.data?.type === "OPEN_ROOM" && event.data.roomId) openRoomByUserId(event.data.roomId);
  });
}

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState !== "visible") return;
  const room = activeRoomKey ? rooms.get(activeRoomKey) : null;
  notifyServiceWorkerActiveRoom(room ? room.userId : null);
  resyncAllRooms();
});

window.addEventListener("online", resyncAllRooms);

// Ri-sottoscrive il canale realtime di ogni camera avviata (che recupera
// anche i messaggi persi, vedi subscribeRealtimeForRoom/catchUpMessages).
// Richiamata quando si torna sulla tab/app o quando torna la rete: sono i
// due momenti in cui una connessione WebSocket morta in silenzio va
// rimpiazzata, senza dover ricaricare tutta la pagina.
function resyncAllRooms() {
  for (const room of rooms.values()) {
    if (room.userId && room.chatStarted) subscribeRealtimeForRoom(room);
  }
}

async function boot() {
  await consumePendingEmailConfirmation();
  migrateLegacySessionIfNeeded();
  const registry = loadRoomRegistry();
  if (registry.length === 0) {
    startAddRoomFlow({ isFirstRoom: true });
    return;
  }
  showScreen("rooms");
  await Promise.all(registry.filter((entry) => !rooms.has(entry.storageKey)).map(initRoomFromRegistryEntry));
  renderRoomList();
  maybeOpenRoomFromUrl();
}

boot();
