import { beforeAll, describe, expect, it } from "vitest";
import type { Database } from "@/lib/db";
import type { Ctx } from "@/lib/services/context";
import { monthBounds, nextMonth, saveTreasury, splitPayment, treasuryForecast, vatReturn, vatReturnCsv } from "@/lib/services/finance";
import { createDepositInvoice, createFinalInvoice, recordPayment } from "@/lib/services/invoices";
import { createQuote, getDraft, issueQuote, recordResponseManually, saveDraft } from "@/lib/services/quotes";
import { completeProfile, freshDb, line, makeCustomer, signUp } from "./helpers";

let db: Database;
let ctx: Ctx;
const NOW = new Date("2026-10-20T10:00:00Z");

/** Devis accepté : 900 € HT à 10 % et 500 € HT à 20 %, soit 1 590 € TTC. */
async function acceptedQuote() {
  const id = await createQuote(ctx, { customerId: await makeCustomer(ctx) });
  const d = await getDraft(ctx, id);
  await saveDraft(
    ctx,
    id,
    {
      ...d,
      title: "Salle de bain",
      site: { line1: "4 place Bellecour", line2: "", postalCode: "69002", city: "Lyon" },
      paymentTerms: "Acompte de 30 % à la commande.",
      sections: [
        { ...d.sections[0], lines: [line(), line({ label: "Meuble vasque", quantity: "1", unit: "u", unitPrice: "500", vatPercent: "20" })] },
      ],
    },
    d.draftRevision,
  );
  await issueQuote(ctx, id);
  await recordResponseManually(ctx, id, { decision: "accept", version: 1, proof: "Devis signé" });
  return id;
}

beforeAll(async () => {
  db = await freshDb();
  ctx = await signUp(db, "tva@exemple.fr");
  await completeProfile(ctx);
});

describe("TVA et trésorerie", () => {
  it("ventile un règlement par taux au centime près", () => {
    const parts = splitPayment(159000, [
      { vatBp: 1000, baseCents: 90000, vatCents: 9000 },
      { vatBp: 2000, baseCents: 50000, vatCents: 10000 },
    ]);
    expect(parts).toEqual([
      { vatBp: 1000, baseCents: 90000, vatCents: 9000 },
      { vatBp: 2000, baseCents: 50000, vatCents: 10000 },
    ]);
    const half = splitPayment(33333, [
      { vatBp: 1000, baseCents: 90000, vatCents: 9000 },
      { vatBp: 2000, baseCents: 50000, vatCents: 10000 },
    ]);
    expect(half.reduce((s, p) => s + p.baseCents + p.vatCents, 0)).toBe(33333);
    expect(splitPayment(1000, [{ vatBp: 0, baseCents: 1000, vatCents: 0 }])).toEqual([{ vatBp: 0, baseCents: 1000, vatCents: 0 }]);
    expect(monthBounds("2028-02")).toEqual({ from: "2028-02-01", to: "2028-02-29" });
    expect(nextMonth("2026-12")).toBe("2027-01");
    expect(nextMonth("2026-01", -1)).toBe("2025-12");
  });

  it("prépare la TVA due sur les encaissements du mois, moins la TVA des frais", async () => {
    const quoteId = await acceptedQuote();
    const dep = await createDepositInvoice(ctx, quoteId, { percent: "30" });
    await recordPayment(ctx, dep.id, { amount: "477", paidOn: "2026-09-10", method: "virement" });
    const fin = await createFinalInvoice(ctx, quoteId);
    await recordPayment(ctx, fin.id, { amount: "500", paidOn: "2026-10-05", method: "cheque" });
    await db.query(
      `INSERT INTO expenses (org_id, user_id, expense_date, category, amount_ttc_cents, vat_cents, status)
       VALUES ($1,$2,'2026-10-03','carburant',6000,1000,'valide'), ($1,$2,'2026-10-04','repas',2000,180,'soumis')`,
      [ctx.orgId, ctx.userId],
    );

    const sept = await vatReturn(ctx, "2026-09-01", "2026-09-30");
    // Acompte de 477 € TTC : 270 € HT à 10 % et 150 € HT à 20 %.
    expect(sept.collected).toEqual([
      { vatBp: 2000, baseCents: 15000, vatCents: 3000 },
      { vatBp: 1000, baseCents: 27000, vatCents: 2700 },
    ]);
    expect(sept.netCents).toBe(5700);

    const oct = await vatReturn(ctx, "2026-10-01", "2026-10-31");
    expect(oct.receivedCents).toBe(50000);
    expect(oct.collected.reduce((s, g) => s + g.baseCents + g.vatCents, 0)).toBe(50000);
    expect(oct.deductibleCents).toBe(1000);
    expect(oct.expenses).toBe(1);
    expect(oct.netCents).toBe(oct.collectedCents - 1000);
    const csv = vatReturnCsv(oct);
    expect(csv).toContain("TVA déductible sur notes de frais;;;10,00");
    await expect(vatReturn(ctx, "2026-10-31", "2026-10-01")).rejects.toMatchObject({ status: 400 });
  });

  it("prévoit la trésorerie des 3 mois et signale le mois à découvert", async () => {
    await expect(saveTreasury(ctx, { balance: "abc", monthlyCharges: "" })).rejects.toMatchObject({ status: 400 });
    await saveTreasury(ctx, { balance: "1 000", monthlyCharges: "2 500" }, NOW);
    const f = await treasuryForecast(ctx, NOW);
    expect(f.settings).toEqual({ balanceCents: 100000, balanceDate: "2026-10-20", monthlyChargesCents: 250000 });
    expect(f.months.map((m) => m.month)).toEqual(["2026-10", "2026-11", "2026-12"]);
    // Reste du solde : 1 590 - 477 (acompte) - 500 réglés = 613 € attendus.
    const open = f.months.reduce((s, m) => s + m.invoicesCents, 0);
    expect(open).toBe(61300);
    // TVA de septembre payée en octobre.
    expect(f.months[0].vatCents).toBe(5700);
    expect(f.months[0].chargesCents).toBe(250000);
    expect(f.months[2].closingCents).toBe(100000 + f.months.reduce((s, m) => s + m.netCents, 0));
    expect(f.shortfall).toBe("2026-10");
    const member = { ...ctx, role: "member", jobFunction: "ouvrier" } as Ctx;
    await expect(treasuryForecast(member, NOW)).rejects.toMatchObject({ status: 403 });
  });
});
