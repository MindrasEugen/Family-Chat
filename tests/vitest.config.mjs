import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Senza questo, Vitest raccoglie di default anche e2e/*.spec.mjs (Playwright),
    // che chiama la propria test() e fallisce ("did not expect test() to be
    // called here") — bug preesistente, non introdotto da questo file.
    include: ["lib/**/*.test.js"],
    environment: "jsdom",
    environmentOptions: {
      jsdom: {
        url: "http://localhost/",
      },
    },
  },
});
