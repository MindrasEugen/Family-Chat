import { expect } from "@playwright/test";
import { E2E_TEST_EMAIL, E2E_TEST_PASSWORD } from "./test-account.local.mjs";

export { E2E_TEST_EMAIL, E2E_TEST_PASSWORD };

// Salta il modal "come si chiama questo dispositivo?" e disattiva traduzione
// automatica/notifiche push: nessuna delle due e' rilevante per i flussi
// testati qui, e la traduzione in particolare renderebbe non deterministico
// (e userebbe inutilmente la quota Mistral) il testo dei messaggi inviati.
export async function seedDeviceName(page, name = "E2E Playwright") {
  await page.addInitScript((deviceName) => {
    try {
      localStorage.setItem("deviceName", deviceName);
      localStorage.setItem("autoTranslateEnabled", "false");
      localStorage.setItem("notificationsEnabled", "false");
    } catch {}
  }, name);
}

// Login completo: apre l'app, fa login con l'account di test dedicato ed
// entra nella (unica) camera associata. Presuppone che l'account non abbia
// altre camere registrate su questo "device" (localStorage pulito, come e'
// di default in un nuovo browser context di Playwright).
export async function loginAndOpenRoom(page) {
  await seedDeviceName(page);
  await page.goto("/");
  await page.locator("#email").fill(E2E_TEST_EMAIL);
  await page.locator("#password").fill(E2E_TEST_PASSWORD);
  await page.locator("#login-btn").click();

  const roomRow = page.locator("#room-list .room-row").first();
  await expect(roomRow).toBeVisible();
  await expect(roomRow).not.toHaveClass(/needs-login/);
  await roomRow.click();
  await expect(page.locator("#app-section")).toBeVisible();
}

// Invia un messaggio di testo nella camera aperta e attende che compaia in
// lista. Ritorna il locator della bolla, cosi' il test puo' pulirla a fine
// corsa con il pulsante di eliminazione gia' previsto dall'app.
export async function sendMessage(page, text) {
  await page.locator("#message-input").fill(text);
  await page.locator("#chat-form .send-btn").click();
  // Il messaggio non viene renderizzato dalla insert stessa ma dall'evento
  // realtime che torna al client (vedi app.js: onRoomMessageInsert), quindi
  // serve un timeout piu' largo di quello di default per la sottoscrizione
  // websocket a stabilizzarsi/propagare.
  const bubble = page.locator(".chat-bubble", { hasText: text }).last();
  await expect(bubble).toBeVisible({ timeout: 15000 });
  return bubble;
}

export async function deleteMessage(bubble) {
  await bubble.locator(".msg-delete-btn").click();
  await expect(bubble).toHaveCount(0);
}
