// Client Supabase: progetto dedicato "todo-list-app" (Supabase, eu-central-1).
// URL e anon key presi da Project Settings -> API su supabase.com.
const SUPABASE_URL = "https://qamvkevkddfwyxhbftoy.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFhbXZrZXZrZGRmd3l4aGJmdG95Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODgxOTQxMTQsImV4cCI6MjEwMzc3MDExNH0.CAJ3dYCJ84XHYKNPC5-KMAuK4nlS2vIPsQmGVOt0RvU";

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const PHOTO_BUCKET = "chat-photos";
const SIGNED_URL_TTL_SECONDS = 60 * 60 * 24 * 7;
const RETENTION_DAYS = 30;
const TRANSLATE_FUNCTION = "translate-message";

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  });
}

// Riferimenti agli elementi del DOM
const authSection = document.getElementById("auth-section");
const appSection = document.getElementById("app-section");
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

let realtimeChannel = null;
let loadingCount = 0;
let currentUserId = null;
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

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
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

// Nome del dispositivo: salvato solo in locale (localStorage), non è
// legato all'account condiviso. Serve solo a mostrare "chi" ha scritto
// un messaggio, dato che tutti i dispositivi usano lo stesso login.
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

// Cache locale (per dispositivo): evita di ritradurre lo stesso messaggio
// ad ogni apertura dell'app, risparmiando chiamate e costo verso Mistral.
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

async function translateText(messageId, text) {
  const lang = getDeviceLang();
  const cached = getCachedTranslation(messageId, lang);
  if (cached) return cached;
  try {
    const { data, error } = await supabaseClient.functions.invoke(TRANSLATE_FUNCTION, {
      body: { text, targetLang: lang },
    });
    if (error || !data?.translatedText) return null;
    setCachedTranslation(messageId, lang, data.translatedText);
    return data.translatedText;
  } catch {
    return null;
  }
}

async function renderMessage(message) {
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
    const { data, error } = await supabaseClient.storage
      .from(PHOTO_BUCKET)
      .createSignedUrl(message.image_path, SIGNED_URL_TTL_SECONDS);
    if (!error && data?.signedUrl) {
      const img = li.querySelector(".bubble-image");
      if (img) img.src = data.signedUrl;
      scrollToBottom();
    }
  }

  if (message.content && isAutoTranslateEnabled()) {
    const translated = await translateText(message.id, message.content);
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

async function loadMessages() {
  showLoading(true);
  messageList.innerHTML = "";
  const { data, error } = await supabaseClient
    .from("messages")
    .select("*")
    .order("created_at", { ascending: true });
  showLoading(false);
  if (error) {
    setMessage(chatMessage, "Errore nel caricamento dei messaggi.", "error");
    updateEmptyState();
    return;
  }
  data.forEach(renderMessage);
  updateEmptyState();
}

// Elimina i messaggi (e le foto collegate) più vecchi di RETENTION_DAYS.
// Girando lato client con la sessione autenticata dell'utente, sfrutta le
// stesse policy RLS già in vigore: nessun ruolo privilegiato o servizio
// esterno necessario. Le eliminazioni si propagano agli altri dispositivi
// tramite il canale realtime già sottoscritto.
async function cleanupOldMessages() {
  const cutoffIso = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const { data: oldMessages, error: selectError } = await supabaseClient
    .from("messages")
    .select("id, image_path")
    .lt("created_at", cutoffIso);
  if (selectError || !oldMessages || oldMessages.length === 0) return;

  const imagePaths = oldMessages.filter((m) => m.image_path).map((m) => m.image_path);
  if (imagePaths.length > 0) {
    supabaseClient.storage.from(PHOTO_BUCKET).remove(imagePaths).catch(() => {});
  }
  await supabaseClient.from("messages").delete().lt("created_at", cutoffIso);
}

function subscribeRealtime(userId) {
  if (realtimeChannel) {
    supabaseClient.removeChannel(realtimeChannel);
  }
  realtimeChannel = supabaseClient
    .channel(`messages-changes-${userId}`)
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages", filter: `user_id=eq.${userId}` }, (payload) => {
      renderMessage(payload.new);
      if (areNotificationsEnabled() && "vibrate" in navigator) navigator.vibrate(200);
    })
    .on("postgres_changes", { event: "DELETE", schema: "public", table: "messages", filter: `user_id=eq.${userId}` }, (payload) => removeMessageFromList(payload.old.id))
    .subscribe();
}

function unsubscribeRealtime() {
  if (realtimeChannel) {
    supabaseClient.removeChannel(realtimeChannel);
    realtimeChannel = null;
  }
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

function showApp(user) {
  currentUserId = user.id;
  authSection.classList.add("hidden");
  appSection.classList.remove("hidden");
  setMessage(authMessage, "");
  emailInput.value = "";
  passwordInput.value = "";
  if (getDeviceName()) {
    startChat(user);
  } else {
    showDeviceNamePrompt(() => startChat(user));
  }
}

function startChat(user) {
  loadMessages();
  subscribeRealtime(user.id);
  cleanupOldMessages();
}

function showAuth() {
  currentUserId = null;
  appSection.classList.add("hidden");
  authSection.classList.remove("hidden");
  deviceNameOverlay.classList.add("hidden");
  messageList.innerHTML = "";
  clearPhotoSelection();
  unsubscribeRealtime();
}

loginBtn.addEventListener("click", async () => {
  setMessage(authMessage, "");
  showLoading(true);
  const { error } = await supabaseClient.auth.signInWithPassword({ email: emailInput.value, password: passwordInput.value });
  showLoading(false);
  if (error) setMessage(authMessage, error.message, "error");
});

signupBtn.addEventListener("click", async () => {
  setMessage(authMessage, "");
  showLoading(true);
  const { error } = await supabaseClient.auth.signUp({ email: emailInput.value, password: passwordInput.value });
  showLoading(false);
  if (error) { setMessage(authMessage, error.message, "error"); } else { setMessage(authMessage, "Registrazione avvenuta. Controlla la tua email per confermare l'account.", "success"); }
});

logoutBtn.addEventListener("click", async () => {
  showLoading(true);
  await supabaseClient.auth.signOut();
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
  const text = messageInput.value.trim();
  if (!text && !selectedPhotoFile) return;
  setMessage(chatMessage, "");
  showLoading(true);
  try {
    let imagePath = null;
    if (selectedPhotoFile) {
      const compressed = await compressImage(selectedPhotoFile);
      imagePath = `${currentUserId}/${crypto.randomUUID()}.jpg`;
      const { error: uploadError } = await supabaseClient.storage
        .from(PHOTO_BUCKET)
        .upload(imagePath, compressed, { contentType: "image/jpeg" });
      if (uploadError) throw uploadError;
    }
    const { error } = await supabaseClient.from("messages").insert({ content: text || null, image_path: imagePath, device_name: getDeviceName() });
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
  const id = e.target.dataset.id;
  const li = messageList.querySelector(`li[data-id="${id}"]`);
  const imagePath = li?.dataset.imagePath || "";
  showLoading(true);
  const { error } = await supabaseClient.from("messages").delete().eq("id", id);
  showLoading(false);
  if (error) { setMessage(chatMessage, "Errore nell'eliminazione del messaggio.", "error"); return; }
  if (imagePath) {
    supabaseClient.storage.from(PHOTO_BUCKET).remove([imagePath]).catch(() => {});
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
  setBoolPref("notificationsEnabled", !areNotificationsEnabled());
  updateToggleButtons();
});

translationToggleBtn.addEventListener("click", () => {
  setBoolPref("autoTranslateEnabled", !isAutoTranslateEnabled());
  updateToggleButtons();
});

updateToggleButtons();

supabaseClient.auth.onAuthStateChange((_event, session) => {
  if (session?.user) { showApp(session.user); } else { showAuth(); }
});

supabaseClient.auth.getSession().then(({ data: { session } }) => {
  if (session?.user) { showApp(session.user); } else { showAuth(); }
});
