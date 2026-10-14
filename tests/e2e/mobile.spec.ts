import { devices, expect, test, type Page } from "@playwright/test";

/** Petits téléphones : aucun écran ne doit déborder horizontalement, la navigation reste utilisable. */
test.use({ ...devices["Pixel 5"], viewport: { width: 360, height: 740 }, locale: "fr-FR", timezoneId: "Europe/Paris" });

async function noHorizontalScroll(page: Page, label: string) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow, `${label} déborde de ${overflow} px`).toBeLessThanOrEqual(1);
  // Un tableau plus large que l'écran doit pouvoir défiler, jamais être coupé.
  const clipped = await page.evaluate(
    () =>
      [...document.querySelectorAll("table")].filter((t) => {
        const box = t.parentElement!;
        return getComputedStyle(box).overflowX === "hidden" && t.scrollWidth > box.clientWidth + 1;
      }).length,
  );
  expect(clipped, `${label} : tableau coupé`).toBe(0);
}

test("pages publiques sur un petit écran", async ({ page }) => {
  for (const path of ["/", "/connexion", "/inscription", "/aide", "/mentions-legales"]) {
    await page.goto(path);
    await noHorizontalScroll(page, path);
  }
});

test("application sur un petit écran", async ({ page }) => {
  await page.goto("/connexion");
  await page.locator("#email").fill("demo@pilot-makers.fr");
  await page.locator("#password").fill("Demo2026Pilot");
  await page.locator("form button[type=submit]").click();
  await page.waitForURL(/\/app(\/|$)/);
  for (const path of [
    "/app",
    "/app/devis",
    "/app/clients",
    "/app/catalogue",
    "/app/factures",
    "/app/chantiers",
    "/app/planning",
    "/app/plus",
    "/app/entreprise",
    "/app/compte",
    "/app/devis/nouveau",
  ]) {
    await page.goto(path);
    await noHorizontalScroll(page, path);
  }
  await page.goto("/app/devis?q=D-2026-0001");
  // Sur téléphone, la liste montre le numéro et le client ; l'objet est masqué.
  await page.goto((await page.locator("a:visible", { hasText: "D-2026-0001" }).first().getAttribute("href"))!);
  await noHorizontalScroll(page, "fiche devis");
});
