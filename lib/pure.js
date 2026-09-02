// Funzioni pure/isolabili estratte da app.js per essere testabili senza
// mockare DOM applicativo, Supabase o service worker. Caricato come script
// classico (non modulo) prima di app.js: le funzioni restano disponibili
// come globali esattamente come prima dell'estrazione.
const ROOM_REGISTRY_KEY = "chatFamiglia.rooms";

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
}

function roomInitial(label) {
  return (label || "?").trim().charAt(0).toUpperCase() || "?";
}

function formatPreviewText(message) {
  if (!message) return "Nessun messaggio";
  if (message.content) return message.content;
  if (message.image_path) return "📷 Foto";
  return "";
}

function loadRoomRegistry() {
  try {
    return JSON.parse(localStorage.getItem(ROOM_REGISTRY_KEY)) || [];
  } catch {
    return [];
  }
}

function saveRoomRegistry(entries) {
  try {
    localStorage.setItem(ROOM_REGISTRY_KEY, JSON.stringify(entries));
  } catch {}
}

function upsertRegistryEntry(entry) {
  const list = loadRoomRegistry().filter((e) => e.storageKey !== entry.storageKey);
  list.push(entry);
  saveRoomRegistry(list);
}

function removeRegistryEntry(storageKey) {
  saveRoomRegistry(loadRoomRegistry().filter((e) => e.storageKey !== storageKey));
}

function findLegacyStorageKey() {
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && /^sb-.*-auth-token$/.test(key) && !key.startsWith("sb-room-")) return key;
  }
  return null;
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    ROOM_REGISTRY_KEY,
    escapeHtml,
    urlBase64ToUint8Array,
    roomInitial,
    formatPreviewText,
    loadRoomRegistry,
    saveRoomRegistry,
    upsertRegistryEntry,
    removeRegistryEntry,
    findLegacyStorageKey,
  };
}
