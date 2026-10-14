import { beforeAll, describe, expect, it } from "vitest";
import { customerRisk, type RiskInput } from "@/lib/customer-risk";
import type { Database } from "@/lib/db";
import type { Ctx } from "@/lib/services/context";
import { riskForCustomer, riskForQuote } from "@/lib/services/customer-risk";
import { createQuote, getDraft, saveDraft } from "@/lib/services/quotes";
import { completeProfile, freshDb, line, makeCustomer, signUp } from "./helpers";

const base: RiskInput = {
  customerType: "particulier",
  hasSiren: false,
  paidInvoices: 0,
  averageDelay: 0,
  overdueCents: 0,
  oldestOverdueDays: 0,
  largestPaidCents: 0,
  quoteCents: 300_000,
};

describe("risque client : calcul", () => {
  it("note un nouveau client sur un petit chantier comme faible", () => {
    const r = customerRisk(base);
    expect(r).toMatchObject({ score: 10, level: "faible", depositPercent: 30 });
    expect(r.reasons).toEqual(["premier chantier avec ce client"]);
  });

  it("monte pour un premier gros chantier d'une entreprise sans SIREN", () => {
    const r = customerRisk({ ...base, customerType: "pro", quoteCents: 2_000_000 });
    expect(r).toMatchObject({ score: 35, level: "modere", depositPercent: 40 });
  });

  it("signale un impayé en cours et conseille de le régler avant de commencer", () => {
    const r = customerRisk({ ...base, paidInvoices: 2, averageDelay: 35, overdueCents: 120_000, oldestOverdueDays: 75, largestPaidCents: 200_000 });
    expect(r.level).toBe("eleve");
    expect(r.depositPercent).toBe(50);
    expect(r.guarantees[0]).toMatch(/factures en retard/);
  });

  it("récompense un bon payeur", () => {
    const r = customerRisk({ ...base, paidInvoices: 4, averageDelay: 2, largestPaidCents: 400_000 });
    expect(r.score).toBe(0);
    expect(r.reasons[0]).toBe("4 factures réglées à temps");
  });

  it("propose une garantie de paiement à une entreprise à risque", () => {
    const r = customerRisk({
      ...base,
      customerType: "pro",
      hasSiren: true,
      paidInvoices: 1,
      averageDelay: 40,
      overdueCents: 50_000,
      oldestOverdueDays: 20,
      largestPaidCents: 100_000,
      quoteCents: 2_000_000,
    });
    expect(r.level).toBe("eleve");
    expect(r.guarantees.some((g) => g.includes("1799-1"))).toBe(true);
  });
});

describe("risque client : service", () => {
  let db: Database;
  let ctx: Ctx;

  beforeAll(async () => {
    db = await freshDb();
    ctx = await signUp(db, "risque@exemple.fr");
    await completeProfile(ctx);
  });

  it("évalue le client d'un devis et compare l'acompte prévu", async () => {
    const customerId = await makeCustomer(ctx);
    const id = await createQuote(ctx, { customerId });
    const d = await getDraft(ctx, id);
    await saveDraft(
      ctx,
      id,
      { ...d, depositPercent: "20", sections: [{ ...d.sections[0], lines: [line({ unitPrice: "800", quantity: "20" })] }] },
      d.draftRevision,
    );
    const r = await riskForQuote(ctx, id);
    expect(r).toMatchObject({ level: "modere", depositPercent: 40, quoteDeposit: 20, depositTooLow: true });
    expect((await riskForCustomer(ctx, customerId))?.level).toBe("faible");
    expect(await riskForCustomer({ ...ctx, role: "member", jobFunction: "ouvrier" } as Ctx, customerId)).toBeNull();
  });
});
