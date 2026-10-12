import { beforeAll, describe, expect, it } from "vitest";
import type { Database } from "@/lib/db";
import type { Ctx } from "@/lib/services/context";
import { createFinalInvoice, getInvoice } from "@/lib/services/invoices";
import {
  createAmendment,
  createQuote,
  getDraft,
  getVersion,
  issueQuote,
  listAmendments,
  recordResponseManually,
  saveDraft,
} from "@/lib/services/quotes";
import { renderQuotePdf } from "@/lib/pdf/quote-pdf";
import { completeProfile, freshDb, line, makeCustomer, signUp } from "./helpers";

let db: Database;
let ctx: Ctx;

async function fill(id: string, extra: Record<string, unknown> = {}) {
  const d = await getDraft(ctx, id);
  await saveDraft(
    ctx,
    id,
    {
      ...d,
      site: d.site.line1 ? d.site : { line1: "4 place Bellecour", line2: "", postalCode: "69002", city: "Lyon" },
      paymentTerms: d.paymentTerms || "Solde à réception de facture.",
      sections: [{ ...d.sections[0], lines: [line()] }],
      ...extra,
    },
    d.draftRevision,
  );
}

beforeAll(async () => {
  db = await freshDb();
  ctx = await signUp(db, "avenants@exemple.fr");
  await completeProfile(ctx);
});

describe("avenants au devis accepté", () => {
  it("refuse un avenant sur un devis non accepté", async () => {
    const id = await createQuote(ctx, { customerId: await makeCustomer(ctx) });
    await expect(createAmendment(ctx, id)).rejects.toMatchObject({ status: 409 });
  });

  it("crée des avenants numérotés qui reprennent le chantier et se facturent à part", async () => {
    const parent = await createQuote(ctx, { customerId: await makeCustomer(ctx) });
    await fill(parent, { title: "Salle de bain", paymentTerms: "Paiement à 15 jours." });
    await issueQuote(ctx, parent);
    await recordResponseManually(ctx, parent, { decision: "accept", version: 1, proof: "Bon pour accord signé" });
    const parentNumber = (await getDraft(ctx, parent)).number;

    const a1 = await createAmendment(ctx, parent);
    const d1 = await getDraft(ctx, a1);
    expect(d1.title).toBe("Avenant n° 1 : Salle de bain");
    expect(d1.site.line1).toBe("4 place Bellecour");
    expect(d1.paymentTerms).toBe("Paiement à 15 jours.");
    expect(d1.amendment).toMatchObject({ parentId: parent, index: 1, parentNumber });
    expect(d1.sections[0].lines).toEqual([]);

    await fill(a1);
    await issueQuote(ctx, a1);
    const v = await getVersion(db, ctx.orgId, a1, 1);
    expect(v.snapshot.quote.amendment).toMatchObject({ index: 1, parentNumber });
    expect(v.snapshot.mentions[0]).toContain(`Avenant n° 1 au devis n° ${parentNumber}`);
    expect((await renderQuotePdf(v.snapshot)).length).toBeGreaterThan(1000);

    // Un avenant demandé depuis un avenant se rattache au devis initial.
    await recordResponseManually(ctx, a1, { decision: "accept", version: 1, proof: "Accord écrit" });
    const a2 = await createAmendment(ctx, a1);
    expect((await getDraft(ctx, a2)).amendment).toMatchObject({ parentId: parent, index: 2 });
    const list = await listAmendments(ctx, parent);
    expect(list.map((a) => a.index)).toEqual([1, 2]);
    expect(list[0].status).toBe("accepted");

    const inv = await getInvoice(ctx, (await createFinalInvoice(ctx, a1)).id);
    expect(inv.total_ttc_cents).toBe(v.snapshot.calc.totalTtcCents);
    expect(inv.snapshot.mentions[0]).toContain(`avenant n° 1 au devis n° ${parentNumber}`);
  });

  it("ne change pas les devis ordinaires", async () => {
    const id = await createQuote(ctx, { customerId: await makeCustomer(ctx) });
    await fill(id, { title: "Peinture" });
    expect((await getDraft(ctx, id)).amendment).toBeUndefined();
    await issueQuote(ctx, id);
    const v = await getVersion(db, ctx.orgId, id, 1);
    expect("amendment" in v.snapshot.quote).toBe(false);
  });
});
