import { beforeAll, describe, expect, it } from "vitest";
import type { Database } from "@/lib/db";
import type { Ctx } from "@/lib/services/context";
import { createQuote, getDraft, saveDraft } from "@/lib/services/quotes";
import { quoteWinOdds } from "@/lib/services/win-odds";
import { amountBands, MIN_HISTORY, winOdds, type DecidedQuote } from "@/lib/win-odds";
import { completeProfile, freshDb, line, makeCustomer, signUp } from "./helpers";

const q = (won: boolean, o: Partial<DecidedQuote> = {}): DecidedQuote => ({
  totalCents: 100_000,
  customerType: "particulier",
  returning: false,
  hasOptions: false,
  hasPhotos: false,
  won,
  ...o,
});

describe("chance de signature : calcul", () => {
  it("attend un historique suffisant", () => {
    expect(
      winOdds(
        q(false),
        Array.from({ length: MIN_HISTORY - 1 }, () => q(true)),
      ),
    ).toBeNull();
  });

  it("découpe les montants en tiers", () => {
    expect(amountBands([1, 2, 3, 4, 5, 6])).toEqual([3, 5]);
  });

  it("monte avec les options quand elles réussissent et conseille d'en ajouter", () => {
    const history = [
      ...Array.from({ length: 6 }, () => q(true, { hasOptions: true })),
      ...Array.from({ length: 1 }, () => q(false, { hasOptions: true })),
      ...Array.from({ length: 2 }, () => q(true)),
      ...Array.from({ length: 6 }, () => q(false)),
    ];
    const without = winOdds(q(false), history)!;
    const withOpt = winOdds(q(false, { hasOptions: true }), history)!;
    expect(withOpt.probability).toBeGreaterThan(without.probability + 0.15);
    expect(without.factors.find((f) => f.feature === "options")!.tip).toMatch(/options/);
    expect(withOpt.factors.find((f) => f.feature === "options")!.tip).toBeNull();
    expect(without.probability).toBeGreaterThanOrEqual(0.05);
    expect(withOpt.probability).toBeLessThanOrEqual(0.95);
  });
});

describe("chance de signature : service", () => {
  let db: Database;
  let ctx: Ctx;

  beforeAll(async () => {
    db = await freshDb();
    ctx = await signUp(db, "chance@exemple.fr");
    await completeProfile(ctx);
  });

  async function quote(price: number, optional = false) {
    const id = await createQuote(ctx, { customerId: await makeCustomer(ctx) });
    const d = await getDraft(ctx, id);
    await saveDraft(
      ctx,
      id,
      { ...d, title: "Travaux", sections: [{ ...d.sections[0], lines: [line({ unitPriceCents: price }), line({ unitPriceCents: 5000, optional })] }] },
      d.draftRevision,
    );
    return id;
  }

  it("estime un brouillon à partir des devis décidés", async () => {
    const draft = await quote(100_000);
    expect((await quoteWinOdds(ctx, draft)).odds).toBeNull();
    for (let i = 0; i < 10; i++) {
      const id = await quote(80_000 + i * 1000, i < 5);
      await db.query("UPDATE quotes SET status=$2 WHERE id=$1", [id, i < 4 ? "accepted" : "refused"]);
    }
    const r = await quoteWinOdds(ctx, draft);
    expect(r.decided).toBe(10);
    expect(r.odds!.history).toBe(10);
    expect(r.odds!.factors.find((f) => f.feature === "options")!.tip).not.toBeNull();
  });
});
