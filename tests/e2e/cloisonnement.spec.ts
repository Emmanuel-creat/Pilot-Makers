import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { expect, test, type APIRequestContext, type Browser, type Page } from "@playwright/test";

/**
 * Cloisonnement des données entre entreprises, route par route : chaque route d'API qui prend l'identifiant
 * d'un devis, d'une facture, d'un chantier ou d'un client est appelée par une autre entreprise avec les
 * identifiants de l'entreprise de démonstration, pour chacune de ses méthodes. Aucune ne doit répondre
 * avec succès. La liste des routes est lue dans le code : une route ajoutée est vérifiée sans rien écrire.
 */

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
type Kind = "quote" | "invoice" | "job" | "customer" | "item" | "order";
/** Préfixe d'adresse de l'API vers la nature de l'identifiant attendu */
const PREFIXES: [string, Kind][] = [
  ["/api/quotes/[id]", "quote"],
  ["/api/v1/quotes/[id]", "quote"],
  ["/api/invoices/[id]", "invoice"],
  ["/api/v1/invoices/[id]", "invoice"],
  ["/api/jobs/[id]", "job"],
  ["/api/v1/jobs/[id]", "job"],
  ["/api/customers/[id]", "customer"],
  ["/api/v1/customers/[id]", "customer"],
  ["/api/catalog-items/[id]", "item"],
  ["/api/orders/[id]", "order"],
];
const PAGES: Record<Kind, string> = {
  quote: "/app/devis",
  invoice: "/app/factures",
  job: "/app/chantiers",
  customer: "/app/clients",
  item: "/app/catalogue",
  order: "/app/commandes",
};

function routes(dir = "src/app/api"): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) return routes(p);
    return f === "route.ts" ? [p] : [];
  });
}

async function loginAs(page: Page, email: string) {
  await page.goto("/connexion");
  await page.locator("#email").fill(email);
  await page.locator("#password").fill("Demo2026Pilot");
  await page.locator("form button[type=submit]").click();
  await page.waitForURL(/\/(app|admin)(\/|$)/);
}

async function firstId(page: Page, kind: Kind) {
  await page.goto(PAGES[kind]);
  const m = new RegExp(`${PAGES[kind]}/(${UUID})`).exec(await page.content());
  return m?.[1] ?? null;
}

async function call(req: APIRequestContext, method: string, url: string) {
  const opts = { failOnStatusCode: false, maxRedirects: 0, data: method === "GET" || method === "DELETE" ? undefined : {} };
  const r =
    method === "GET"
      ? await req.get(url, opts)
      : method === "POST"
        ? await req.post(url, opts)
        : method === "PUT"
          ? await req.put(url, opts)
          : method === "PATCH"
            ? await req.patch(url, opts)
            : await req.delete(url, opts);
  return r.status();
}

async function otherCompany(browser: Browser) {
  const ctx = await browser.newContext({ locale: "fr-FR" });
  const page = await ctx.newPage();
  // Le compte d'administration a sa propre entreprise, distincte de l'entreprise de démonstration.
  await loginAs(page, "admin@pilot-makers.fr");
  return { ctx, page };
}

test("cloisonnement : aucune route d'API ne sert les données d'une autre entreprise", async ({ page, browser }) => {
  test.setTimeout(180_000);
  await loginAs(page, "demo@pilot-makers.fr");
  const ids: Partial<Record<Kind, string>> = {};
  for (const k of Object.keys(PAGES) as Kind[]) {
    const id = await firstId(page, k);
    if (id) ids[k] = id;
  }
  expect(ids.quote, "un devis de démonstration").toBeTruthy();
  expect(ids.customer, "un client de démonstration").toBeTruthy();
  // L'identifiant est bien lisible par son entreprise : le refus ci-dessous vient du cloisonnement.
  expect(await call(page.request, "GET", `/api/quotes/${ids.quote}`)).toBe(200);

  const checked: string[] = [];
  const leaks: string[] = [];
  const { ctx, page: other } = await otherCompany(browser);
  for (const file of routes()) {
    const path =
      "/" +
      relative("src/app", file)
        .replace(/\\/g, "/")
        .replace(/\/route\.ts$/, "");
    const match = PREFIXES.find(([p]) => path === p || path.startsWith(`${p}/`));
    if (!match || path.split("[").length !== 2) continue;
    const id = ids[match[1]];
    if (!id) continue;
    const url = path.replace("[id]", id);
    const methods = [...readFileSync(file, "utf8").matchAll(/export (?:(?:async )?function|const) (GET|POST|PUT|PATCH|DELETE)\b/g)].map((m) => m[1]);
    for (const method of methods) {
      const status = await call(other.request, method, url);
      checked.push(`${method} ${path}`);
      if (status < 400 && status !== 307) leaks.push(`${method} ${url} : ${status}`);
    }
  }
  expect(checked.length, `routes vérifiées : ${checked.join(", ")}`).toBeGreaterThan(25);
  console.log(`Cloisonnement : ${checked.length} couples méthode et route vérifiés, identifiants ${Object.keys(ids).join(", ")}.`);
  expect(leaks, leaks.join("\n")).toEqual([]);

  // Les pages de l'application ne s'ouvrent pas davantage.
  for (const [k, id] of Object.entries(ids)) {
    const r = await other.request.get(`${PAGES[k as Kind]}/${id}`, { failOnStatusCode: false });
    expect(r.status(), `${PAGES[k as Kind]}/${id}`).toBe(404);
  }
  await ctx.close();
  // Rien n'a été modifié : l'entreprise de démonstration lit toujours son devis.
  expect(await call(page.request, "GET", `/api/quotes/${ids.quote}`)).toBe(200);
});
