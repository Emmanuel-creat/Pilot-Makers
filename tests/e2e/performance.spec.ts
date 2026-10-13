import { expect, test, type Page } from "@playwright/test";
import budget from "../../perf-budget.json";

/**
 * Budget de performance : poids des scripts et temps d'affichage des pages les plus utilisées.
 * Mesuré sur le serveur de production construit, en local : un dépassement signale une régression
 * (bibliothèque lourde ajoutée, requête lente), pas le temps réel vu par un artisan sur le réseau mobile.
 */

async function measure(page: Page, path: string) {
  await page.goto(path, { waitUntil: "load" });
  return page.evaluate(() => {
    const nav = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming;
    const scripts = (performance.getEntriesByType("resource") as PerformanceResourceTiming[]).filter((r) => r.initiatorType === "script" || r.name.endsWith(".js"));
    return {
      scriptKb: Math.round(scripts.reduce((s, r) => s + (r.encodedBodySize || r.transferSize || 0), 0) / 1024),
      serverMs: Math.round(nav.responseStart - nav.requestStart),
      loadMs: Math.round(nav.loadEventEnd - nav.startTime),
    };
  });
}

test("les pages principales respectent le budget de poids et de temps", async ({ page }) => {
  await page.goto("/connexion");
  await page.locator("#email").fill("demo@pilot-makers.fr");
  await page.locator("#password").fill("Demo2026Pilot");
  await page.locator("form button[type=submit]").click();
  await page.waitForURL(/\/app(\/|$)/);
  const report: Record<string, unknown> = {};
  for (const [path, b] of Object.entries(budget.pages)) {
    // Première visite pour chauffer le serveur, puis la mesure.
    await measure(page, path);
    const m = await measure(page, path);
    report[path] = m;
    expect.soft(m.scriptKb, `${path} : poids des scripts (Ko)`).toBeLessThanOrEqual(b.scriptKb);
    expect.soft(m.loadMs, `${path} : affichage complet (ms)`).toBeLessThanOrEqual(budget.loadMs);
  }
  console.log(JSON.stringify(report));
});
