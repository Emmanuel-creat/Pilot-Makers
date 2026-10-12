import { beforeAll, describe, expect, it } from "vitest";
import type { Database } from "@/lib/db";
import type { Ctx } from "@/lib/services/context";
import {
  createCreditNote,
  createDepositInvoice,
  createFinalInvoice,
  createProgressInvoice,
  getInvoice,
  invoicedProgress,
} from "@/lib/services/invoices";
import { createQuote, getDraft, getVersion, issueQuote, recordResponseManually, saveDraft } from "@/lib/services/quotes";
import { completeProfile, freshDb, line, makeCustomer, signUp } from "./helpers";

let db: Database;
let ctx: Ctx;

const pro = { type: "entreprise", company_name: "Bâti Général SAS", siren: "732829320", vat_number: "FR44732829320" };

async function acceptedQuote(extra: Record<string, unknown> = {}, customer: Record<string, unknown> = {}) {
  const id = await createQuote(ctx, { customerId: await makeCustomer(ctx, customer) });
  const d = await getDraft(ctx, id);
  await saveDraft(
    ctx,
    id,
    {
      ...d,
      title: "Rénovation complète",
      site: { line1: "4 place Bellecour", line2: "", postalCode: "69002", city: "Lyon" },
      paymentTerms: "Paiement à chaque situation sous 30 jours.",
      sections: [
        {
          id: d.sections[0].id,
          title: "",
          description: "",
          lines: [line(), line({ label: "Fourniture de faïence", nature: "materiau", quantity: "3", unitPrice: "33,33", vatPercent: "20" })],
        },
      ],
      ...extra,
    },
    d.draftRevision,
  );
  await issueQuote(ctx, id);
  await recordResponseManually(ctx, id, { decision: "accept", version: 1, proof: "Bon pour accord signé" });
  return id;
}

beforeAll(async () => {
  db = await freshDb();
  ctx = await signUp(db, "situations@exemple.fr");
  await completeProfile(ctx);
});

describe("factures de situation", () => {
  it("facture l'avancement cumulé puis le solde, au centime près du devis", async () => {
    const id = await acceptedQuote();
    const quoteTtc = (await getVersion(db, ctx.orgId, id, 1)).snapshot.calc.totalTtcCents;
    const s1 = await getInvoice(ctx, (await createProgressInvoice(ctx, id, { percent: "40" })).id);
    expect(s1.kind).toBe("progress");
    expect(s1.snapshot.invoice.progress).toEqual({ index: 1, previousBp: 0, cumulativeBp: 4000 });
    expect(s1.snapshot.mentions.join(" ")).toContain("Situation n° 1");
    const s2 = await getInvoice(ctx, (await createProgressInvoice(ctx, id, { percent: "70" })).id);
    expect(s2.snapshot.invoice.progress).toEqual({ index: 2, previousBp: 4000, cumulativeBp: 7000 });
    expect(await invoicedProgress(ctx, id)).toEqual({ count: 2, cumulativeBp: 7000 });

    // Un avancement qui ne progresse pas, ou à 100 %, est refusé : le solde passe par la facture finale.
    await expect(createProgressInvoice(ctx, id, { percent: "60" })).rejects.toMatchObject({ status: 400 });
    await expect(createProgressInvoice(ctx, id, { percent: "100" })).rejects.toMatchObject({ status: 400 });
    // Situations et acomptes ne se mélangent pas.
    await expect(createDepositInvoice(ctx, id, { percent: "30" })).rejects.toMatchObject({ status: 409 });

    const fin = await getInvoice(ctx, (await createFinalInvoice(ctx, id)).id);
    expect(s1.total_ttc_cents + s2.total_ttc_cents + fin.total_ttc_cents).toBe(quoteTtc);
    expect(s1.total_ht_cents + s2.total_ht_cents + fin.total_ht_cents).toBe((await getVersion(db, ctx.orgId, id, 1)).snapshot.calc.totalHtCents);
  });

  it("refuse une situation quand un acompte est déjà facturé", async () => {
    const id = await acceptedQuote();
    await createDepositInvoice(ctx, id, { percent: "30" });
    await expect(createProgressInvoice(ctx, id, { percent: "50" })).rejects.toMatchObject({ status: 409 });
  });

  it("applique la retenue de garantie à chaque situation et annule une situation par avoir", async () => {
    const id = await acceptedQuote({ reverseCharge: true, retentionPercent: "5" }, pro);
    const s1 = await getInvoice(ctx, (await createProgressInvoice(ctx, id, { percent: "50" })).id);
    const ret = s1.snapshot.invoice.retention;
    expect(ret?.bp).toBe(500);
    expect(s1.amount_due_cents).toBe(s1.total_ttc_cents - (ret?.cents ?? 0));
    const av = await createCreditNote(ctx, s1.id, { mode: "full", reason: "Avancement surestimé" });
    expect((await getInvoice(ctx, av.id)).amount_due_cents).toBe(s1.amount_due_cents);
    // La situation annulée ne compte plus dans l'avancement.
    expect(await invoicedProgress(ctx, id)).toEqual({ count: 0, cumulativeBp: 0 });
    const again = await getInvoice(ctx, (await createProgressInvoice(ctx, id, { percent: "30" })).id);
    expect(again.snapshot.invoice.progress).toEqual({ index: 1, previousBp: 0, cumulativeBp: 3000 });
  });
});
