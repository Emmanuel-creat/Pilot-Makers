import { beforeAll, describe, expect, it } from "vitest";
import type { Database } from "@/lib/db";
import { estimateDuration, lineMinutes, recommendCrew, workingDays, type LaborLine } from "@/lib/duration-estimate";
import { createItem } from "@/lib/services/catalog";
import type { Ctx } from "@/lib/services/context";
import { estimateLinesDuration } from "@/lib/services/duration";
import { completeProfile, freshDb, line, signUp } from "./helpers";

const labor = (o: Partial<LaborLine> = {}): LaborLine => ({
  label: "Pose",
  quantityMilli: 20000,
  unit: "m²",
  minutesPerUnit: null,
  costCents: 0,
  hourlyCostCents: null,
  netCents: 0,
  hourlyPriceCents: null,
  ...o,
});

describe("temps d'une ligne", () => {
  it("prend le temps du catalogue, puis l'unité, le coût et enfin le prix", () => {
    expect(lineMinutes(labor({ minutesPerUnit: 45 }))).toEqual({ minutes: 900, method: "catalogue" });
    expect(lineMinutes(labor({ unit: "h", quantityMilli: 12500 }))).toEqual({ minutes: 750, method: "unite" });
    expect(lineMinutes(labor({ unit: "jours", quantityMilli: 2000 }))).toEqual({ minutes: 840, method: "unite" });
    expect(lineMinutes(labor({ costCents: 60000, hourlyCostCents: 3000 }))).toEqual({ minutes: 1200, method: "cout" });
    expect(lineMinutes(labor({ netCents: 90000, hourlyPriceCents: 4500 }))).toEqual({ minutes: 1200, method: "prix" });
    expect(lineMinutes(labor())).toEqual({ minutes: 0, method: "inconnue" });
  });

  it("compte les jours ouvrés et conseille l'équipe", () => {
    expect(workingDays(16 * 60, 1)).toBe(2.5);
    expect(workingDays(140 * 60, 2)).toBe(10);
    expect(recommendCrew(16 * 60, 5)).toBe(1);
    expect(recommendCrew(140 * 60, 5)).toBe(2);
    // Une entreprise de deux personnes ne se voit pas conseiller une équipe de trois.
    expect(recommendCrew(300 * 60, 2)).toBe(2);
    const e = estimateDuration([labor({ unit: "h", quantityMilli: 100000 }), labor({ label: "Finitions" })], 3);
    expect([e.hours, e.crew, e.days, e.text, e.unknown]).toEqual([100, 2, 7.5, "7,5 jours ouvrés, 2 personnes", ["Finitions"]]);
    expect(e.options).toEqual([
      { crew: 1, days: 14.5 },
      { crew: 2, days: 7.5 },
      { crew: 3, days: 5 },
    ]);
  });
});

describe("estimation depuis les lignes du devis", () => {
  let db: Database;
  let ctx: Ctx;

  beforeAll(async () => {
    db = await freshDb();
    ctx = await signUp(db, "duree@exemple.fr");
    await completeProfile(ctx);
  });

  it("utilise le temps unitaire des articles et ignore fournitures et options", async () => {
    const pose = await createItem(ctx, {
      name: "Pose de faïence",
      unit: "m²",
      unit_price: "45",
      duration_minutes: 30,
      category: "main_oeuvre",
      vat_percent: "10",
    });
    const r = await estimateLinesDuration(ctx, {
      lines: [
        line({ catalogItemId: pose, quantity: "24", unit: "m²" }),
        line({ label: "Préparation", quantity: "4", unit: "h" }),
        line({ label: "Colle", nature: "materiau", quantity: "8", unit: "sac" }),
        line({ label: "Option frise", quantity: "10", unit: "h", optional: true }),
      ],
    });
    expect([r.laborLines, r.minutes, r.crew, r.text]).toEqual([2, 960, 1, "2,5 jours ouvrés, 1 personne"]);
    expect(r.detail.map((l) => l.method)).toEqual(["catalogue", "unite"]);
    await expect(estimateLinesDuration(ctx, { lines: "rien" })).rejects.toMatchObject({ status: 400 });
  });
});
