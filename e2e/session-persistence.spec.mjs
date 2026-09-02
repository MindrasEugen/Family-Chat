import { test, expect } from "@playwright/test";
import { loginAndOpenRoom } from "./helpers.mjs";

// Copre il registro camere (lib/pure.js: load/save/upsertRegistryEntry) nel
// suo scenario reale: era la parte del multi-room support non ancora
// verificata su un vero reload di pagina (vedi PLAN.md).
test("dopo un reload la camera resta accessibile senza rifare login", async ({ page }) => {
  await loginAndOpenRoom(page);

  await page.reload();

  await expect(page.locator("#room-list-section")).toBeVisible();
  await expect(page.locator("#auth-section")).toBeHidden();

  const roomRow = page.locator("#room-list .room-row").first();
  await expect(roomRow).toBeVisible();
  await expect(roomRow).not.toHaveClass(/needs-login/);

  await roomRow.click();
  await expect(page.locator("#app-section")).toBeVisible();
});
