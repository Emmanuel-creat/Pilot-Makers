import { beforeAll, describe, expect, it } from "vitest";
import type { Database } from "@/lib/db";
import type { Ctx } from "@/lib/services/context";
import { getOrganization, savePricing } from "@/lib/services/organization";
import { laborPatch, rateForPrice, readPricing, travelCostCents, travelLine } from "@/lib/services/pricing";
import { completeProfile, freshDb, signUp } from "./helpers";

let db: Database;
let ctx: Ctx;

beforeAll(async () => {
  db = await freshDb();
  ctx = await signUp(db, "tarifs@exemple.fr");
  await completeProfile(ctx);
});

describe("taux horaires et frais de déplacement", () => {
  it("calcule le déplacement au-delà du rayon gratuit, aller-retour", () => {
    const t = { perKmCents: 60, fixedCents: 3500, freeKm: 30 };
    expect(travelCostCents(t, 10)).toBe(3500);
    expect(travelCostCents(t, 45)).toBe(3500 + 15 * 2 * 60);
    expect(travelCostCents({ ...t, freeKm: 0 }, 12.5)).toBe(3500 + 1500);
    expect(travelLine(t, 45, 3)).toMatchObject({ nature: "deplacement", quantity: "3", unitPrice: "53,00", label: "Frais de déplacement" });
  });

  it("remplit une ligne de main-d'oeuvre depuis une qualification", () => {
    const rates = [
      { label: "Apprenti", priceCents: 3200, costCents: 1800 },
      { label: "Ouvrier", priceCents: 4550, costCents: 0 },
    ];
    expect(laborPatch(rates[0])).toEqual({ unit: "h", unitPrice: "32,00", unitCost: "18,00" });
    expect(laborPatch(rates[1]).unitCost).toBe("");
    expect(rateForPrice(rates, "45,5")).toBe(1);
    expect(rateForPrice(rates, "")).toBe(-1);
    expect(rateForPrice(rates, "abc")).toBe(-1);
  });

  it("enregistre les tarifs de l'entreprise et refuse les saisies invalides", async () => {
    const saved = await savePricing(ctx, {
      rates: [
        { label: "Apprenti", price: "32", cost: "18,5" },
        { label: "Chef d'équipe", price: "55,00 €", cost: "" },
        { label: "", price: "", cost: "" },
      ],
      perKm: "0,60",
      fixed: "35",
      freeKm: "20",
    });
    expect(saved.laborRates).toEqual([
      { label: "Apprenti", priceCents: 3200, costCents: 1850 },
      { label: "Chef d'équipe", priceCents: 5500, costCents: 0 },
    ]);
    expect(readPricing((await getOrganization(ctx)).pricing)).toEqual(saved);
    const base = { perKm: "", fixed: "", freeKm: "" };
    await expect(savePricing(ctx, { ...base, rates: [{ label: "Ouvrier", price: "", cost: "" }] })).rejects.toMatchObject({ status: 400 });
    await expect(savePricing(ctx, { ...base, rates: [{ label: "", price: "40", cost: "" }] })).rejects.toMatchObject({ status: 400 });
    await expect(savePricing(ctx, { ...base, rates: [], perKm: "-1" })).rejects.toMatchObject({ status: 400 });
    await expect(savePricing(ctx, { ...base, rates: [], freeKm: "1,5" })).rejects.toMatchObject({ status: 400 });
  });

  it("ignore des tarifs enregistrés invalides", () => {
    expect(readPricing({ laborRates: [{ label: "  " }, { label: "X", priceCents: -5 }], travel: { perKmCents: "a" } })).toEqual({
      laborRates: [{ label: "X", priceCents: 0, costCents: 0 }],
      travel: { perKmCents: 0, fixedCents: 0, freeKm: 0 },
    });
    expect(readPricing(null).laborRates).toEqual([]);
  });
});
