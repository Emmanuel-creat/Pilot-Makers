import { beforeAll, describe, expect, it } from "vitest";
import { chequeAge, chequeDeadline, depositSlip, formatIban } from "@/lib/cheque-deposit";
import type { Database } from "@/lib/db";
import { cancelDeposit, createDeposit, getDeposit, listDeposits, pendingCheques } from "@/lib/services/cheque-deposits";
import type { Ctx } from "@/lib/services/context";
import { createFinalInvoice, recordPayment } from "@/lib/services/invoices";
import { createQuote, getDraft, issueQuote, parisDate, recordResponseManually, saveDraft } from "@/lib/services/quotes";
import { completeProfile, freshDb, line, makeCustomer, signUp } from "./helpers";

describe("règles de remise", () => {
  it("calcule la date limite, l'alerte et le bordereau", () => {
    expect(chequeDeadline("2026-03-10")).toBe("2027-03-18");
    expect(chequeDeadline("2024-02-29")).toBe("2025-03-09");
    expect(chequeAge("2026-10-12", "2026-10-15")).toEqual({ days: 3, level: "ok" });
    expect(chequeAge("2026-10-01", "2026-10-15").level).toBe("a_remettre");
    expect(chequeAge("2025-10-01", "2026-10-15").level).toBe("urgent");
    const slip = depositSlip([
      { id: "1", amountCents: 1000, receivedOn: "2026-10-01", reference: "", drawer: "Bernard", invoiceNumber: "F1" },
      { id: "2", amountCents: 5000, receivedOn: "2026-10-01", reference: "", drawer: "Albert", invoiceNumber: "F2" },
    ]);
    expect(slip.lines.map((l) => l.drawer)).toEqual(["Albert", "Bernard"]);
    expect(slip).toMatchObject({ totalCents: 6000, count: 2 });
    expect(formatIban("fr7630006000011234567890189")).toBe("FR76 3000 6000 0112 3456 7890 189");
  });
});

describe("bordereaux de remise", () => {
  let db: Database;
  let ctx: Ctx;
  let invoiceId: string;

  beforeAll(async () => {
    db = await freshDb();
    ctx = await signUp(db, "cheques@remise.fr");
    await completeProfile(ctx);
    const id = await createQuote(ctx, { customerId: await makeCustomer(ctx) });
    const d = await getDraft(ctx, id);
    await saveDraft(
      ctx,
      id,
      { ...d, title: "Cuisine", site: { line1: "1 rue A", line2: "", postalCode: "69001", city: "Lyon" }, sections: [{ ...d.sections[0], lines: [line()] }] },
      d.draftRevision,
    );
    await issueQuote(ctx, id);
    await recordResponseManually(ctx, id, { decision: "accept", version: 1, proof: "Bon pour accord signé" });
    invoiceId = (await createFinalInvoice(ctx, id)).id;
    const today = parisDate(new Date());
    await recordPayment(ctx, invoiceId, { amount: "200", paidOn: today, method: "cheque", reference: "Chèque 1234567" });
    await recordPayment(ctx, invoiceId, { amount: "150", paidOn: today, method: "cheque", reference: "Chèque 7654321" });
    await recordPayment(ctx, invoiceId, { amount: "50", paidOn: today, method: "virement", reference: "" });
  });

  it("liste les seuls chèques à remettre", async () => {
    const p = await pendingCheques(ctx);
    expect(p.map((c) => c.amountCents)).toEqual([20000, 15000]);
    expect(p[0]).toMatchObject({ drawer: "Claire Dubois", reference: "Chèque 1234567" });
    const worker = { ...ctx, role: "member", jobFunction: "ouvrier" } as Ctx;
    await expect(pendingCheques(worker)).rejects.toMatchObject({ status: 403 });
  });

  it("établit un bordereau numéroté et refuse de remettre deux fois un chèque", async () => {
    await expect(createDeposit(ctx, [])).rejects.toThrow(/Cochez/);
    const [a, b] = await pendingCheques(ctx);
    const id = await createDeposit(ctx, [a.id]);
    await expect(createDeposit(ctx, [a.id, b.id])).rejects.toThrow(/déjà été remis/);
    const id2 = await createDeposit(ctx, [b.id]);
    expect((await pendingCheques(ctx)).length).toBe(0);
    const slip = await getDeposit(ctx, id);
    expect(slip).toMatchObject({ number: 1, count: 1, totalCents: 20000, company: "Carrelage Martin" });
    expect((await listDeposits(ctx)).map((d) => d.number)).toEqual([2, 1]);
    await cancelDeposit(ctx, id2);
    expect((await pendingCheques(ctx)).map((c) => c.amountCents)).toEqual([15000]);
    const again = await createDeposit(ctx, [b.id]);
    expect((await getDeposit(ctx, again))?.number).toBe(3);
    expect(await getDeposit(ctx, "00000000-0000-4000-8000-000000000000")).toBeNull();
  });
});
