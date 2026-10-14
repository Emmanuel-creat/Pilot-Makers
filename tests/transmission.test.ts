import { beforeAll, describe, expect, it } from "vitest";
import { intangibleAssets, REVENUE_SHARE, SURPLUS_MULTIPLE, valueBusiness, type TransferInputs } from "@/lib/business-transfer";
import { createItem } from "@/lib/services/catalog";
import type { Ctx } from "@/lib/services/context";
import { transferFile } from "@/lib/services/business-transfer";
import { completeProfile, freshDb, signUp } from "./helpers";

const BASE: TransferInputs = {
  years: [
    { year: 2023, revenueCents: 20_000_000, costsCents: 12_000_000 },
    { year: 2024, revenueCents: 21_000_000, costsCents: 12_500_000 },
    { year: 2025, revenueCents: 22_000_000, costsCents: 13_000_000 },
  ],
  customers: 120,
  repeatShare: 0.2,
  topCustomerShare: 0.1,
  backlogCents: 2_000_000,
  maintainedEquipments: 0,
  reviewAverage: null,
  reviewCount: 0,
  catalogItems: 80,
  teamMembers: 3,
  vehicles: 2,
};

describe("transmission : valorisation", () => {
  it("croise trois fois l'excédent moyen et 40 % du chiffre d'affaires moyen", () => {
    const v = valueBusiness(BASE);
    expect(v.averageRevenueCents).toBe(21_000_000);
    expect(v.averageSurplusCents).toBe(8_500_000);
    expect(v.byMultipleCents).toBe(8_500_000 * SURPLUS_MULTIPLE);
    expect(v.byRevenueCents).toBe(21_000_000 * REVENUE_SHARE);
    expect(v.growth).toBeCloseTo(0.1);
    expect(v.factors.map((f) => f.key)).toEqual(["croissance"]);
    expect(v.lowCents).toBe(Math.round(8_400_000 * 1.1));
    expect(v.highCents).toBe(Math.round(25_500_000 * 1.1));
    expect(v.midCents).toBe(Math.round((v.lowCents + v.highCents) / 2));
    expect(v.insufficient).toBe(false);
  });

  it("dépendance à un client et dirigeant seul font baisser la valeur ; fidélité, entretien, avis et carnet la font monter", () => {
    const down = valueBusiness({ ...BASE, topCustomerShare: 0.45, teamMembers: 1 });
    expect(down.factors.map((f) => f.key).sort()).toEqual(["croissance", "dependance", "dirigeant"]);
    expect(down.highCents).toBeLessThan(valueBusiness(BASE).highCents);
    const up = valueBusiness({ ...BASE, repeatShare: 0.4, maintainedEquipments: 30, reviewCount: 12, reviewAverage: 4.8, backlogCents: 6_000_000 });
    expect(up.factors.map((f) => f.key).sort()).toEqual(["carnet", "croissance", "entretien", "fidelite", "reputation"]);
    const falling = valueBusiness({ ...BASE, years: [BASE.years[0], BASE.years[1], { year: 2025, revenueCents: 17_000_000, costsCents: 11_000_000 }] });
    expect(falling.factors.map((f) => f.key)).toContain("baisse");
  });

  it("historique trop court : valeur signalée comme peu fiable, jamais négative", () => {
    const v = valueBusiness({ ...BASE, years: [{ year: 2025, revenueCents: 500_000, costsCents: 900_000 }] });
    expect(v.insufficient).toBe(true);
    expect(v.growth).toBeNull();
    expect(v.lowCents).toBe(0);
    expect(v.byMultipleCents).toBe(0);
  });

  it("décrit le patrimoine immatériel", () => {
    const a = intangibleAssets({ ...BASE, reviewCount: 3, reviewAverage: 4.67, maintainedEquipments: 1 });
    expect(a[0]).toMatch(/^120 clients facturés/);
    expect(a.some((x) => x.includes("note moyenne 4,7 sur 5"))).toBe(true);
    expect(a.some((x) => x.startsWith("1 équipement de clients suivi en"))).toBe(true);
    expect(intangibleAssets({ ...BASE, customers: 0, catalogItems: 0, backlogCents: 0, vehicles: 0 })).toEqual([]);
  });
});

describe("transmission : dossier de l'entreprise", () => {
  let ctx: Ctx;
  beforeAll(async () => {
    ctx = await signUp(await freshDb(), "transmission@exemple.fr");
    await completeProfile(ctx);
    await createItem(ctx, { name: "Pose de carrelage", category: "main_oeuvre", vat_percent: "10", unit: "m²", unit_price: "45" });
  });

  it("rassemble trois exercices civils et l'historique, même vide", async () => {
    const f = await transferFile(ctx, new Date("2026-10-14T10:00:00Z"));
    expect(f.inputs.years.map((y) => y.year)).toEqual([2023, 2024, 2025]);
    expect(f.inputs.catalogItems).toBe(1);
    expect(f.inputs.teamMembers).toBe(1);
    expect(f.valuation.insufficient).toBe(true);
    expect(f.assets).toEqual(["Un catalogue de 1 prix et ouvrages chiffrés, à jour des prix d'achat"]);
  });
});
