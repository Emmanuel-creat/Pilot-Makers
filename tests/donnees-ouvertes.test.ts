import { beforeAll, describe, expect, it } from "vitest";
import type { Database } from "@/lib/db";
import { DATASETS, paymentDelayDataset, priceDataset, toCsv } from "@/lib/open-data";
import { openPaymentDelays, openPrices } from "@/lib/services/open-data";
import { freshDb, signUp } from "./helpers";

describe("jeux de données agrégés", () => {
  it("prix : quartiles par région et France, rien sous le seuil", () => {
    const rows = [
      ...Array.from({ length: 4 }, (_, i) => ({ orgId: `l${i}`, postalCode: "69003", name: "Pose de carrelage", unit: "m²", price: 40 + i * 10 })),
      ...Array.from({ length: 2 }, (_, i) => ({ orgId: `p${i}`, postalCode: "75011", name: "pose  de carrelage", unit: "m²", price: 100 })),
    ];
    const d = priceDataset(rows, 4);
    expect(d.map((x) => [x.region, x.companies])).toEqual([
      ["France", 6],
      ["Auvergne-Rhône-Alpes", 4],
    ]);
    expect(d[1]).toMatchObject({ q1: 47.5, median: 55, q3: 62.5 });
    expect(priceDataset(rows)).toEqual([]);
  });

  it("une entreprise compte une fois, même avec plusieurs articles", () => {
    const rows = [
      { orgId: "a", postalCode: "69003", name: "Peinture", unit: "m²", price: 10 },
      { orgId: "a", postalCode: "69003", name: "Peinture", unit: "m²", price: 30 },
      { orgId: "b", postalCode: "69003", name: "Peinture", unit: "m²", price: 25 },
    ];
    expect(priceDataset(rows, 2)[0]).toMatchObject({ companies: 2, median: 22.5 });
  });

  it("délais : médiane des médianes et part en retard, par mois", () => {
    const rows = [
      { orgId: "a", month: "2026-08", days: 10, late: false },
      { orgId: "a", month: "2026-08", days: 50, late: true },
      { orgId: "b", month: "2026-08", days: 20, late: false },
      { orgId: "c", month: "2026-08", days: 40, late: true },
      { orgId: "a", month: "2026-09", days: 5, late: false },
    ];
    expect(paymentDelayDataset(rows, 3)).toEqual([{ month: "2026-08", companies: 3, medianDays: 30, lateShare: 50 }]);
  });

  it("CSV à la française", () => {
    expect(toCsv([{ nom: "Pose; dépose", prix: 12.5 }])).toBe('nom;prix\n"Pose; dépose";12,5\n');
    expect(toCsv([])).toBe("");
    expect(DATASETS.every((d) => d.json.startsWith("/api/public/"))).toBe(true);
  });
});

describe("contributeurs", () => {
  let db: Database;

  beforeAll(async () => {
    db = await freshDb();
  });

  it("seules les entreprises volontaires sont lues", async () => {
    const a = await signUp(db, "od-a@exemple.fr");
    await db.query(
      "INSERT INTO catalog_items (org_id, reference, name, unit, unit_price4, source, category) VALUES ($1,'LIB-1','Pose de carrelage','m²',450000,'library','main_oeuvre')",
      [a.orgId],
    );
    expect(await openPrices(db)).toEqual([]);
    expect(await openPaymentDelays(db)).toEqual([]);
  });
});
