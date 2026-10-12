import { defineConfig, devices } from "@playwright/test";

/**
 * Tests du parcours complet dans un vrai navigateur.
 * L'application est construite puis démarrée sur une base embarquée neuve,
 * remplie avec les données de démonstration (voir scripts/e2e-server.mjs).
 * En local, PW_CHROMIUM peut désigner un Chromium déjà installé.
 */
const port = Number(process.env.E2E_PORT ?? 3100);

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: `http://localhost:${port}`,
    locale: "fr-FR",
    timezoneId: "Europe/Paris",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], launchOptions: process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {} },
    },
  ],
  webServer: {
    command: `node scripts/e2e-server.mjs ${port}`,
    url: `http://localhost:${port}/connexion`,
    timeout: 300_000,
    reuseExistingServer: !process.env.CI,
  },
});
