import { test, expect } from "@playwright/test";
import { loginAndOpenRoom, sendMessage, deleteMessage } from "./helpers.mjs";

test("un messaggio inviato appare in chat e puo' essere eliminato", async ({ page }) => {
  await loginAndOpenRoom(page);

  const text = `Messaggio E2E ${Date.now()}`;
  const bubble = await sendMessage(page, text);
  await expect(bubble.locator(".bubble-text")).toHaveText(text);
  await expect(page.locator("#message-input")).toHaveValue("");

  // Pulizia: non deve restare traffico di test nella camera reale.
  await deleteMessage(bubble);
});
