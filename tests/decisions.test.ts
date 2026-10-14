import { describe, expect, it } from "vitest";
import { marginRate, simulateHire, simulatePrice, simulateVehicle } from "@/lib/decisions";
import { decisionBaseline, parseRate } from "@/lib/services/decisions";
import { completeProfile, freshDb, signUp } from "./helpers";

const base = { revenueCents: 20_000_000, costsCents: 8_000_000, hourlyRateCents: 5_000 };

describe("simulateur de décisions", () => {
  it("chiffre une embauche", () => {
    expect(marginRate(base)).toBe(0.6);
    const r = simulateHire(base, { grossMonthlyCents: 200_000, employerFactor: 1.45, billableHours: 120, rampMonths: 2, materialRate: 0.1 });
    expect(r.yearlyCost).toBe(3_480_000);
    // 120 h x 11 mois x 50 € = 66 000 €.
    expect(r.revenue).toBe(6_600_000);
    expect(r.result).toBe(6_600_000 - 660_000 - 3_480_000);
    expect(r.breakEvenHoursPerMonth).toBe(65);
  });

  it("chiffre une hausse de prix et la perte de volume supportable", () => {
    const r = simulatePrice(base, { increasePct: 5, volumeLossPct: 0 });
    expect(r.delta).toBe(1_000_000);
    const lost = simulatePrice(base, { increasePct: 5, volumeLossPct: 10 });
    expect(lost.delta).toBeLessThan(0);
    expect(r.breakEvenLossPct).toBe(7.7);
    expect(simulatePrice(base, { increasePct: 5, volumeLossPct: 7.7 }).delta).toBeGreaterThan(-20_000);
  });

  it("chiffre l'achat d'un véhicule", () => {
    const r = simulateVehicle(base, { priceCents: 3_000_000, months: 48, rateBp: 500, runningMonthlyCents: 30_000, savedMonthlyCents: 0 });
    expect(r.monthlyPayment).toBe(69_088);
    expect(r.netMonthly).toBe(99_088);
    expect(r.revenueNeeded).toBe(Math.round((99_088 * 12) / 0.6));
    expect(r.hoursNeededPerMonth).toBe(20);
    expect(simulateVehicle(base, { priceCents: 0, months: 48, rateBp: 0, runningMonthlyCents: 0, savedMonthlyCents: 10_000 }).hoursNeededPerMonth).toBe(0);
  });
});

describe("chiffres de départ", () => {
  it("lit le taux horaire et les 12 derniers mois", async () => {
    expect(parseRate("45 €/h")).toBe(4500);
    expect(parseRate("52,50")).toBe(5250);
    expect(parseRate("")).toBe(0);
    const db = await freshDb();
    const ctx = await signUp(db, "simulateur@exemple.fr");
    await completeProfile(ctx);
    await db.query("UPDATE organizations SET hourly_rate='48 € HT' WHERE id=$1", [ctx.orgId]);
    const b = await decisionBaseline(ctx);
    expect(b).toMatchObject({ revenueCents: 0, hourlyRateCents: 4800, hasData: false });
  });
});
