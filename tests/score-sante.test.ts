import { describe, expect, it } from "vitest";
import { grade, healthScore, type HealthFigures } from "@/lib/health-score";
import { createHealthShare, listHealthShares, myHealthScore, revokeHealthShare, sharedHealthScore } from "@/lib/services/health-score";
import { completeProfile, freshDb, signUp } from "./helpers";

const healthy: HealthFigures = {
  revenueCents: 24_000_000,
  previousRevenueCents: 21_000_000,
  costsCents: 10_000_000,
  paymentDays: 14,
  outstandingCents: 3_000_000,
  overdueCents: 0,
  topCustomerShare: 0.1,
  backlogCents: 8_000_000,
  acceptance: 0.55,
};

describe("score de santé", () => {
  it("note une entreprise saine A et une fragile E, avec des conseils", () => {
    const a = healthScore(healthy);
    expect(a.score).toBe(100);
    expect(a.grade).toBe("A");
    expect(a.indicators.every((i) => i.advice === null)).toBe(true);
    const e = healthScore({
      ...healthy,
      previousRevenueCents: 40_000_000,
      costsCents: 20_000_000,
      paymentDays: 75,
      overdueCents: 2_000_000,
      topCustomerShare: 0.6,
      backlogCents: 0,
      acceptance: 0.1,
    });
    expect(e.grade).toBe("E");
    expect(e.indicators.filter((i) => i.advice).length).toBe(7);
  });
  it("reste prudent sans historique", () => {
    const r = healthScore({
      revenueCents: 0,
      previousRevenueCents: 0,
      costsCents: 0,
      paymentDays: null,
      outstandingCents: 0,
      overdueCents: 0,
      topCustomerShare: null,
      backlogCents: 0,
      acceptance: null,
    });
    expect(r.indicators.find((i) => i.key === "croissance")?.value).toBe("pas d'année précédente");
    expect(grade(r.score)).toBe(r.grade);
    expect([grade(80), grade(65), grade(50), grade(35), grade(10)]).toEqual(["A", "B", "C", "D", "E"]);
  });
});

describe("partage du score", () => {
  it("crée un lien en lecture, compte les consultations et le révoque", async () => {
    const db = await freshDb();
    const ctx = await signUp(db, "score@exemple.fr");
    await completeProfile(ctx);
    const mine = await myHealthScore(ctx);
    expect(mine.indicators).toHaveLength(7);
    await expect(createHealthShare(ctx, { days: "200" })).rejects.toMatchObject({ status: 400 });
    const { id, token } = await createHealthShare(ctx, { label: "Banque Populaire", days: "30" });
    const seen = await sharedHealthScore(db, token);
    expect(seen?.score).toBe(mine.score);
    expect(seen?.org?.name).toBeTruthy();
    expect((await listHealthShares(ctx))[0]).toMatchObject({ label: "Banque Populaire", views: 1, active: true });
    expect(await sharedHealthScore(db, token, new Date(Date.now() + 31 * 86_400_000))).toBeNull();
    await revokeHealthShare(ctx, id);
    expect(await sharedHealthScore(db, token)).toBeNull();
    expect(await sharedHealthScore(db, "inconnu")).toBeNull();
  });
});
