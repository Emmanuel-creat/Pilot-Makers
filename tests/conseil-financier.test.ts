import { beforeAll, describe, expect, it } from "vitest";
import type { Database } from "@/lib/db";
import { adviseFinance, type FinanceInputs } from "@/lib/financial-advice";
import type { Ctx } from "@/lib/services/context";
import { saveTreasury } from "@/lib/services/finance";
import { financialAdvice, financeInputs } from "@/lib/services/financial-advice";
import { completeProfile, freshDb, signUp } from "./helpers";

const healthy: FinanceInputs = {
  revenueCents: 24000000,
  previousRevenueCents: 22000000,
  costsCents: 12000000,
  paymentDays: 20,
  outstandingCents: 1000000,
  overdueCents: 0,
  topCustomerShare: 0.12,
  backlogCents: 8000000,
  acceptance: 0.5,
  balanceCents: 4000000,
  monthlyChargesCents: 1000000,
  acceptedCount: 10,
  withDepositCount: 8,
  monthlyRevenueCents: Array(12).fill(2000000),
};

describe("recommandations financières", () => {
  it("ne recommande rien à une entreprise saine et liste ses points forts", () => {
    const a = adviseFinance(healthy);
    expect(a.recommendations).toEqual([]);
    expect(a.strengths).toEqual([
      "Vos clients paient vite : 20 jours en moyenne.",
      "Votre trésorerie couvre plus de trois mois de charges fixes.",
      "Votre marge sur achats et frais est solide : 50 %.",
      "Votre carnet couvre 4,0 mois d'activité.",
    ]);
  });

  it("chiffre le délai de paiement, les retards, l'acompte et la marge, urgences d'abord", () => {
    const a = adviseFinance({
      ...healthy,
      paymentDays: 60,
      overdueCents: 1500000,
      withDepositCount: 1,
      costsCents: 20000000,
      balanceCents: 500000,
      topCustomerShare: 0.6,
      backlogCents: 1000000,
      acceptance: 0.2,
      monthlyRevenueCents: [3000000, 3000000, 3000000, 3000000, 3000000, 500000, 3000000, 3000000, 3000000, 3000000, 3000000, 3000000],
    });
    const byKey = Object.fromEntries(a.recommendations.map((r) => [r.key, r]));
    // 240 000 € HT, soit 288 000 € TTC par an : 30 jours de moins libèrent 288 000 / 365 x 30
    expect(byKey.delai.impactCents).toBe(Math.round(((24000000 * 1.2) / 365) * 30));
    expect(byKey.retards.impactCents).toBe(1500000);
    expect(byKey.acomptes.impactCents).toBe(360000);
    expect(byKey.marge).toMatchObject({ priority: 1, impactCents: 1200000 });
    expect(byKey.reserve.finding).toContain("0,5 mois");
    expect(byKey.dependance.priority).toBe(1);
    expect(byKey.carnet.priority).toBe(1);
    expect(byKey.transformation.priority).toBe(3);
    expect(byKey.saison).toBeDefined();
    const priorities = a.recommendations.map((r) => r.priority);
    expect([...priorities].sort()).toEqual(priorities);
    expect(a.recommendations[0].key).toBe("delai");
    expect(a.strengths).toEqual([]);
  });

  it("ignore la réserve sans solde saisi et la transformation sans historique", () => {
    const a = adviseFinance({ ...healthy, balanceCents: null, acceptance: null, acceptedCount: 2, withDepositCount: 0 });
    expect(a.recommendations.map((r) => r.key)).toEqual([]);
  });
});

describe("conseil financier de l'entreprise", () => {
  let db: Database;
  let ctx: Ctx;
  beforeAll(async () => {
    db = await freshDb();
    ctx = await signUp(db, "conseil-fin@exemple.fr");
    await completeProfile(ctx);
  });

  it("lit la trésorerie saisie et douze mois de chiffre d'affaires", async () => {
    let i = await financeInputs(ctx);
    expect(i.balanceCents).toBeNull();
    expect(i.monthlyRevenueCents).toHaveLength(12);
    await saveTreasury(ctx, { balance: "3000", monthlyCharges: "4000" });
    i = await financeInputs(ctx);
    expect(i).toMatchObject({ balanceCents: 300000, monthlyChargesCents: 400000, acceptedCount: 0 });
    const a = await financialAdvice(ctx);
    expect(a.recommendations.find((r) => r.key === "reserve")).toMatchObject({ priority: 1 });
  });
});
