import { beforeAll, describe, expect, it } from "vitest";
import type { Database } from "@/lib/db";
import { cumulativeBudget, gap, monthlyBudget, projection } from "@/lib/budget";
import { budgetActuals, getBudget, saveBudget } from "@/lib/services/budget";
import type { Ctx } from "@/lib/services/context";
import { createFinalInvoice, recordPayment } from "@/lib/services/invoices";
import { createQuote, getDraft, issueQuote, parisDate, recordResponseManually, saveDraft } from "@/lib/services/quotes";
import { completeProfile, freshDb, line, makeCustomer, signUp } from "./helpers";

let db: Database;
let ctx: Ctx;

beforeAll(async () => {
  db = await freshDb();
  ctx = await signUp(db, "budget@exemple.fr");
  await completeProfile(ctx);
});

describe("budget : calculs", () => {
  it("douzièmes, cumul, écart et projection", () => {
    expect(monthlyBudget(100001, 1)).toBe(8333);
    expect(monthlyBudget(100001, 12)).toBe(100001 - 8333 * 11);
    expect(cumulativeBudget(100001, 12)).toBe(100001);
    expect(cumulativeBudget(120000, 3)).toBe(30000);
    expect(cumulativeBudget(120000, 0)).toBe(0);
    expect(gap("facture", 110, 100)).toBe("favorable");
    expect(gap("facture", 80, 100)).toBe("defavorable");
    expect(gap("achats", 110, 100)).toBe("defavorable");
    expect(gap("frais", 80, 100)).toBe("favorable");
    expect(gap("achats", 103, 100)).toBe("neutre");
    expect(gap("achats", 50, 0)).toBe("neutre");
    expect(projection(30000, 3)).toBe(120000);
    expect(projection(30000, 0)).toBe(0);
  });
});

describe("budget : saisie et réalisé", () => {
  it("enregistre le budget et reprend factures et paiements de l'année", async () => {
    expect(await getBudget(ctx, 2026)).toEqual({});
    await saveBudget(ctx, 2026, { facture: "180 000", encaisse: "", achats: "60000,50", frais: "" });
    expect(await getBudget(ctx, 2026)).toEqual({ facture: 18000000, achats: 6000050 });
    await saveBudget(ctx, 2026, { facture: "150000" });
    expect(await getBudget(ctx, 2026)).toEqual({ facture: 15000000 });
    await expect(saveBudget(ctx, 2026, { facture: "beaucoup" })).rejects.toMatchObject({ status: 400 });
    await expect(saveBudget(ctx, 1999, { facture: "1" })).rejects.toMatchObject({ status: 400 });
    const worker = { ...ctx, role: "member", jobFunction: "ouvrier" } as Ctx;
    await expect(getBudget(worker, 2026)).rejects.toMatchObject({ status: 403 });

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
    const inv = await createFinalInvoice(ctx, id);
    const today = parisDate(new Date());
    await recordPayment(ctx, inv.id, { amount: "200", paidOn: today, method: "virement", reference: "" });
    const year = Number(today.slice(0, 4));
    const month = Number(today.slice(5, 7));
    const a = await budgetActuals(ctx, year);
    expect(a.facture[month - 1]).toBe(90000);
    expect(a.encaisse[month - 1]).toBe(20000);
    expect(a.achats.every((v) => v === 0)).toBe(true);
    expect((await budgetActuals(ctx, year - 1)).encaisse.every((v) => v === 0)).toBe(true);
  });
});
