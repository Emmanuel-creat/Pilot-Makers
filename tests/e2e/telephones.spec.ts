import { expect, test, type Page } from "@playwright/test";

/**
 * Téléphones les plus répandus en France : tailles d'écran, densité, tactile, en portrait et en paysage.
 * Le moteur reste Chromium ; on reproduit l'écran, le tactile et l'agent utilisateur de chaque modèle.
 * La liste est tenue à jour dans docs/TELEPHONES.md.
 */
const IOS = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
const android = (model: string) =>
  `Mozilla/5.0 (Linux; Android 14; ${model}) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36`;

const PHONES = [
  { name: "iPhone SE", width: 375, height: 667, scale: 2, ua: IOS },
  { name: "iPhone 15", width: 393, height: 852, scale: 3, ua: IOS },
  { name: "iPhone 15 Pro Max", width: 430, height: 932, scale: 3, ua: IOS },
  { name: "Samsung Galaxy A55", width: 384, height: 854, scale: 2.8125, ua: android("SM-A556B") },
  { name: "Samsung Galaxy S24", width: 360, height: 780, scale: 3, ua: android("SM-S921B") },
  { name: "Xiaomi Redmi Note 13", width: 393, height: 873, scale: 2.75, ua: android("23129RAA4G") },
  { name: "Google Pixel 8", width: 412, height: 915, scale: 2.625, ua: android("Pixel 8") },
] as const;

async function login(page: Page) {
  await page.goto("/connexion");
  await page.locator("#email").fill("demo@pilot-makers.fr");
  await page.locator("#password").fill("Demo2026Pilot");
  await page.locator("form button[type=submit]").click();
  await page.waitForURL(/\/app(\/|$)/);
}

async function check(page: Page, label: string) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow, `${label} déborde de ${overflow} px`).toBeLessThanOrEqual(1);
  // Cibles tactiles d'au moins 24 px (WCAG 2.2, critère 2.5.8) pour les boutons visibles hors texte courant.
  const small = await page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>("button, [role=button], input[type=checkbox], input[type=radio], select")]
      .filter((el) => {
        const r = el.getBoundingClientRect();
        if (!(r.width > 0 && r.height > 0) || getComputedStyle(el).visibility === "hidden") return false;
        // Une case à cocher se touche aussi par son libellé : la cible est la plus grande des deux.
        const boxes = [r, ...[...((el as HTMLInputElement).labels ?? [])].map((l) => l.getBoundingClientRect())];
        return !boxes.some((b) => b.width >= 24 && b.height >= 24);
      })
      .map((el) => el.getAttribute("aria-label") || el.textContent?.trim() || el.tagName)
      .slice(0, 5),
  );
  expect(small, `${label} : cibles tactiles trop petites`).toEqual([]);
}

for (const phone of PHONES) {
  test.describe(phone.name, () => {
    test.use({
      viewport: { width: phone.width, height: phone.height },
      deviceScaleFactor: phone.scale,
      isMobile: true,
      hasTouch: true,
      userAgent: phone.ua,
    });

    test(`${phone.name} : écrans principaux en portrait`, async ({ page }) => {
      await login(page);
      for (const path of ["/app", "/app/devis", "/app/devis/nouveau", "/app/clients", "/app/chantiers", "/app/pointage", "/app/ma-journee", "/app/plus"]) {
        await page.goto(path);
        await check(page, `${phone.name} ${path}`);
      }
      await page.goto("/app/devis");
      await page.goto((await page.locator("a:visible", { hasText: "D-2026-0001" }).first().getAttribute("href"))!);
      await check(page, `${phone.name} fiche devis`);
    });

    test(`${phone.name} : paysage`, async ({ page }) => {
      await page.setViewportSize({ width: phone.height, height: phone.width });
      await login(page);
      for (const path of ["/app", "/app/devis/nouveau", "/app/planning"]) {
        await page.goto(path);
        await check(page, `${phone.name} paysage ${path}`);
      }
    });
  });
}
