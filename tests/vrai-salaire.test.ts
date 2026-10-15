import { describe, expect, it } from "vitest";
import { ownerPay, readNumber, WORK_WEEKS } from "@/lib/owner-pay";
import { ownerPayFacts } from "@/lib/services/owner-pay";
import type { Ctx } from "@/lib/services/context";
import { freshDb, signUp } from "./helpers";

const base = { revenueCents: 120_000_00, costsCents: 40_000_00, otherCostsCents: 0, hoursPerWeek: 50, targetMonthlyCents: 3_000_00 };

describe("vrai salaire du dirigeant", () => {
  it("calcule le revenu net et l'heure réelle au régime réel", () => {
    const p = ownerPay({ ...base, regime: "reel", ratePercent: 45 });
    expect(p.surplusCents).toBe(80_000_00);
    expect(p.netYearCents).toBe(Math.round(80_000_00 / 1.45));
    expect(p.contributionsCents + p.netYearCents).toBe(80_000_00);
    expect(p.hoursYear).toBe(50 * WORK_WEEKS);
    expect(p.netHourCents).toBe(Math.round(p.netYearCents / (50 * WORK_WEEKS)));
    expect(p.neededSurplusCents).toBe(36_000_00 * 1.45);
    expect(p.priceIncreasePercent).toBe(0);
    expect(p.split).toEqual({ costs: 33, contributions: 21, net: 46 });
  });

  it("chiffre la hausse de prix nécessaire quand l'objectif n'est pas atteint", () => {
    const p = ownerPay({ ...base, regime: "reel", ratePercent: 45, targetMonthlyCents: 6_000_00 });
    // 72 000 × 1,45 = 104 400 d'excédent nécessaire, il en manque 24 400 sur 120 000 de chiffre d'affaires.
    expect(p.priceIncreasePercent).toBe(20.3);
  });

  it("calcule les cotisations sur le chiffre d'affaires en micro-entreprise", () => {
    const p = ownerPay({ ...base, revenueCents: 60_000_00, costsCents: 10_000_00, regime: "micro", ratePercent: 20, targetMonthlyCents: 3_500_00 });
    expect(p.contributionsCents).toBe(12_000_00);
    expect(p.netYearCents).toBe(38_000_00);
    // Objectif 42 000 : chiffre d'affaires nécessaire (42 000 + 10 000) / 0,8 = 65 000, soit 5 000 de plus.
    expect(p.priceIncreasePercent).toBe(8.3);
  });

  it("gère une année à perte et l'absence de chiffre d'affaires", () => {
    const loss = ownerPay({ ...base, regime: "reel", ratePercent: 45, costsCents: 130_000_00 });
    expect(loss.netYearCents).toBe(-10_000_00);
    expect(loss.contributionsCents).toBe(0);
    const none = ownerPay({ ...base, revenueCents: 0, costsCents: 0, regime: "reel", ratePercent: 45 });
    expect(none.priceIncreasePercent).toBeNull();
    expect(none.split).toBeNull();
    expect(readNumber("2 500 €", 0)).toBe(2500);
    expect(readNumber("45,5", 0)).toBe(45.5);
    expect(readNumber("abc", 7)).toBe(7);
    expect(readNumber("120", 0, 0, 100)).toBe(100);
  });

  it("rassemble les chiffres des douze derniers mois, réservés à la facturation", async () => {
    const db = await freshDb();
    const ctx = await signUp(db, "salaire@vrai.fr");
    const f = await ownerPayFacts(ctx, new Date("2026-10-15T10:00:00Z"));
    expect(f).toMatchObject({ from: "2025-10-16", to: "2026-10-15", revenueCents: 0, costsCents: 0, trackedHoursPerWeek: null });
    await expect(ownerPayFacts({ ...ctx, role: "member", jobFunction: "ouvrier" } as Ctx)).rejects.toMatchObject({ status: 403 });
  });
});
