import { test, expect } from "@playwright/test";
import { E2E_TEST_EMAIL, E2E_TEST_PASSWORD, seedDeviceName } from "./helpers.mjs";

test("credenziali sbagliate mostrano un errore e non entrano in chat", async ({ page }) => {
  await seedDeviceName(page);
  await page.goto("/");
  await page.locator("#email").fill(E2E_TEST_EMAIL);
  await page.locator("#password").fill("password-sicuramente-sbagliata");
  await page.locator("#login-btn").click();

  await expect(page.locator("#auth-message")).not.toBeEmpty();
  await expect(page.locator("#room-list-section")).toBeHidden();
  await expect(page.locator("#app-section")).toBeHidden();
});

test("credenziali corrette portano alla lista camere con l'account di test", async ({ page }) => {
  await seedDeviceName(page);
  await page.goto("/");
  await page.locator("#email").fill(E2E_TEST_EMAIL);
  await page.locator("#password").fill(E2E_TEST_PASSWORD);
  await page.locator("#login-btn").click();

  const roomRow = page.locator("#room-list .room-row").first();
  await expect(roomRow).toBeVisible();
  await expect(roomRow).toContainText(E2E_TEST_EMAIL.split("@")[0], { ignoreCase: true });
});
