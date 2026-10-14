import { beforeAll, describe, expect, it } from "vitest";
import type { Database } from "@/lib/db";
import type { Ctx } from "@/lib/services/context";
import { createDepositInvoice, createFinalInvoice, recordPayment } from "@/lib/services/invoices";
import { createQuote, getDraft, issueQuote, parisDate, recordResponseManually, saveDraft } from "@/lib/services/quotes";
import { saveYearEnd, yearEndCsv, yearEndPack } from "@/lib/services/year-end";
import { completion, fiscalYear } from "@/lib/year-end";
import { completeProfile, freshDb, line, makeCustomer, signUp } from "./helpers";

describe("exercice", () => {
  it("calcule les bornes de l'exercice", () => {
    expect(fiscalYear(2026)).toEqual({ from: "2026-01-01", to: "2026-12-31" });
    expect(fiscalYear(2026, 6, 30)).toEqual({ from: "2025-07-01", to: "2026-06-30" });
    expect(fiscalYear(2024, 2, 31)).toEqual({ from: "2023-03-01", to: "2024-02-29" });
    expect(completion({ stock: true, inconnu: true })).toEqual({ done: 1, total: 10 });
  });
});

describe("dossier de clôture", () => {
  let db: Database;
  let ctx: Ctx;
  let quote: string;
  const year = Number(parisDate(new Date()).slice(0, 4));

  beforeAll(async () => {
    db = await freshDb();
    ctx = await signUp(db, "bilan@exemple.fr");
    await completeProfile(ctx);
    quote = await createQuote(ctx, { customerId: await makeCustomer(ctx) });
    const d = await getDraft(ctx, quote);
    await saveDraft(
      ctx,
      quote,
      { ...d, title: "Terrasse", site: { line1: "1 rue A", line2: "", postalCode: "69001", city: "Lyon" }, sections: [{ ...d.sections[0], lines: [line()] }] },
      d.draftRevision,
    );
    await issueQuote(ctx, quote);
    await recordResponseManually(ctx, quote, { decision: "accept", version: 1, proof: "Bon pour accord signé" });
  });

  it("arrête créances, acomptes et travaux restant à facturer", async () => {
    const dep = await createDepositInvoice(ctx, quote, { percent: "30" });
    await recordPayment(ctx, dep.id, { amount: "100", paidOn: parisDate(new Date()), method: "virement", reference: "" });
    let p = await yearEndPack(ctx, year);
    expect(p.receivables.map((r) => r.balanceCents)).toEqual([29700 - 10000]);
    expect(p.deposits).toEqual({ count: 1, cents: 29700 });
    expect(p.backlogCents).toBe(99000 - 29700);
    // L'exercice précédent ne voit rien de ce qui a été facturé cette année.
    expect((await yearEndPack(ctx, year - 1)).receivables).toEqual([]);

    await createFinalInvoice(ctx, quote);
    p = await yearEndPack(ctx, year);
    expect(p.deposits.count).toBe(0);
    expect(p.backlog).toEqual([]);
    expect(p.receivablesCents).toBe(99000 - 10000);

    await saveYearEnd(ctx, year, ["stock", "pirate"], { stock: " Inventaire du 31 fait ", pirate: "x" });
    p = await yearEndPack(ctx, year);
    expect(p.checks).toEqual({ stock: true });
    expect(p.notes).toEqual({ stock: "Inventaire du 31 fait" });
    const csv = await yearEndCsv(ctx, year);
    expect(csv).toMatch(/Inventaire du stock;[0-9,]*;fait;Inventaire du 31 fait/);
    expect(csv).toContain("Créance client");
    await expect(yearEndPack(ctx, 1999)).rejects.toMatchObject({ status: 400 });
    const worker = { ...ctx, role: "member", jobFunction: "ouvrier" } as Ctx;
    await expect(yearEndPack(worker, year)).rejects.toMatchObject({ status: 403 });
  });
});
