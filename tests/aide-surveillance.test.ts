import { existsSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { getDb } from "@/lib/db";
import { HELP_ARTICLES, HELP_CATEGORIES, helpArticle, searchHelp } from "@/lib/help";
import { reportError, resetAlertsForTests, scrub, sendAlert, shouldAlert } from "@/lib/monitoring";

describe("centre d'aide", () => {
  it("a des guides uniques, rangés dans des rubriques connues, avec des liens vers des pages qui existent", () => {
    const slugs = HELP_ARTICLES.map((a) => a.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    expect(HELP_ARTICLES.length).toBeGreaterThanOrEqual(15);
    for (const a of HELP_ARTICLES) {
      expect(HELP_CATEGORIES[a.category], a.slug).toBeDefined();
      expect(a.steps.length, a.slug).toBeGreaterThan(0);
      if (a.link) expect(existsSync(`src/app${a.link.href}/page.tsx`), a.link.href).toBe(true);
    }
    for (const code of Object.keys(HELP_CATEGORIES))
      expect(
        HELP_ARTICLES.some((a) => a.category === code),
        code,
      ).toBe(true);
  });

  it("trouve un guide sans tenir compte des accents ni de l'ordre des mots", () => {
    expect(searchHelp("retractation delai").map((a) => a.slug)).toContain("droit-de-retractation");
    expect(searchHelp("ACOMPTE solde").map((a) => a.slug)).toContain("factures-acompte-et-solde");
    expect(searchHelp("mot introuvable xyz")).toHaveLength(0);
    expect(searchHelp("")).toHaveLength(HELP_ARTICLES.length);
    expect(helpArticle("tva-reduite")?.title).toMatch(/TVA/);
    expect(searchHelp("raccourcis clavier").map((a) => a.slug)).toContain("raccourcis-clavier");
  });
});

describe("surveillance", () => {
  afterEach(() => {
    delete process.env.ALERT_WEBHOOK_URL;
    resetAlertsForTests();
  });

  it("masque les données personnelles dans les alertes", () => {
    expect(scrub("échec pour claire@exemple.fr, SIRET 73282932000074")).toBe("échec pour [e-mail], SIRET [nombre]");
  });

  it("regroupe les alertes : une par type d'erreur toutes les dix minutes", () => {
    const t = 1_000_000;
    expect(shouldAlert("a", t)).toBe(true);
    expect(shouldAlert("a", t + 60_000)).toBe(false);
    expect(shouldAlert("b", t + 60_000)).toBe(true);
    expect(shouldAlert("a", t + 11 * 60_000)).toBe(true);
  });

  it("n'envoie rien sans adresse de canal, et envoie un message lisible sinon", async () => {
    const fetcher = vi.fn(async () => new Response("ok"));
    expect(await sendAlert("test", fetcher as never)).toBe(false);
    expect(fetcher).not.toHaveBeenCalled();
    process.env.ALERT_WEBHOOK_URL = "https://alertes.exemple.fr/hook";
    expect(await sendAlert("test", fetcher as never)).toBe(true);
    const [url, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://alertes.exemple.fr/hook");
    expect(JSON.parse(String(init.body))).toEqual({ text: "test", content: "test" });
  });

  it("journalise l'erreur en base et ne prévient qu'une fois", async () => {
    process.env.ALERT_WEBHOOK_URL = "https://alertes.exemple.fr/hook";
    const fetcher = vi.fn(async () => new Response("ok"));
    await reportError(new TypeError("x is undefined pour paul@exemple.fr"), { path: "/app/devis", method: "GET" }, fetcher as never);
    await reportError(new TypeError("x is undefined"), { path: "/app/devis", method: "GET" }, fetcher as never);
    expect(fetcher).toHaveBeenCalledTimes(1);
    const body = JSON.parse(String((fetcher.mock.calls[0] as unknown as [string, RequestInit])[1].body));
    expect(body.text).toContain("TypeError sur GET /app/devis");
    expect(body.text).not.toContain("paul@exemple.fr");
    const db = await getDb();
    const rows = await db.query<{ n: unknown }>("SELECT count(*) AS n FROM error_events WHERE kind='server.unhandled'");
    expect(Number(rows[0].n)).toBe(2);
  });
});
