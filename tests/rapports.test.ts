import { beforeAll, describe, expect, it } from "vitest";
import type { Database } from "@/lib/db";
import type { Ctx } from "@/lib/services/context";
import { createFinalInvoice, recordPayment } from "@/lib/services/invoices";
import { convertLeadToQuote, createLead } from "@/lib/services/leads";
import { createQuote, getDraft, issueQuote, parisDate, recordResponseManually, saveDraft, sendQuote } from "@/lib/services/quotes";
import { getReport, lastMonths, readGoals, reportCsv, saveGoals, tradeOf } from "@/lib/services/reports";
import { completeProfile, freshDb, line, makeCustomer, signUp } from "./helpers";

let db: Database;
let ctx: Ctx;

async function quote(title: string, quoteId?: string) {
  const id = quoteId ?? (await createQuote(ctx, { customerId: await makeCustomer(ctx, { email: "client@exemple.fr" }) }));
  const d = await getDraft(ctx, id);
  await saveDraft(
    ctx,
    id,
    {
      ...d,
      customerId: await makeCustomer(ctx, { email: "client@exemple.fr" }),
      title,
      site: { line1: "4 place Bellecour", line2: "", postalCode: "69002", city: "Lyon" },
      paymentTerms: "Solde à réception de facture.",
      sections: [{ id: d.sections[0].id, title: "", description: "", lines: [line()] }],
    },
    d.draftRevision,
  );
  await issueQuote(ctx, id);
  await sendQuote(ctx, id, { to: "client@exemple.fr", subject: "Devis", body: "Bonjour" });
  return id;
}

beforeAll(async () => {
  db = await freshDb();
  ctx = await signUp(db, "rapports@exemple.fr");
  await completeProfile(ctx);
});

describe("rapports commerciaux", () => {
  it("liste les mois et reconnaît le type de travaux", () => {
    expect(lastMonths("2026-02-15", 3)).toEqual(["2025-12", "2026-01", "2026-02"]);
    expect(tradeOf("Pose de carrelage au sol").label).toMatch(/Carrel/i);
    expect(tradeOf("Rangement du garage").key).toBe("autres");
    expect(readGoals({ monthlySignedHtCents: -1, monthlySent: 4 })).toEqual({ monthlySignedHtCents: 0, monthlySent: 4 });
  });

  it("compte signé, refusé, facturé, encaissé, délais et objectifs du mois", async () => {
    const lead = await createLead(ctx, { name: "Mme Durand", email: "durand@exemple.fr", description: "Carrelage salle de bain" });
    const fromLead = await convertLeadToQuote(ctx, lead);
    const a = await quote("Pose de carrelage salle de bain", fromLead);
    const b = await quote("Peinture du séjour");
    await quote("Carrelage de la cuisine");
    await recordResponseManually(ctx, a, { decision: "accept", version: 1, proof: "Bon pour accord" });
    await recordResponseManually(ctx, b, { decision: "refuse", version: 1, proof: "Refus par téléphone" });
    const inv = await createFinalInvoice(ctx, a);
    await recordPayment(ctx, inv.id, { amount: "500", paidOn: parisDate(new Date()), method: "virement", reference: "" });
    await saveGoals(ctx, { signed: "1 800", sent: "4" });

    const r = await getReport(ctx);
    const cur = r.months[r.months.length - 1];
    expect(r.months).toHaveLength(12);
    expect(cur).toMatchObject({
      sent: 3,
      signed: 1,
      refused: 1,
      signedHtCents: 90000,
      invoicedHtCents: 90000,
      collectedCents: 50000,
      signatureRate: 50,
    });
    expect(cur.averageBasketHtCents).toBe(90000);
    expect(r.pendingTtcCents).toBe(99000);
    expect(r.byTrade.find((x) => /carrel/i.test(x.label))).toMatchObject({ signed: 1, refused: 0, rate: 100 });
    expect(r.byAuthor).toHaveLength(1);
    expect(r.delays.samples).toEqual({ leadToQuote: 1, quoteToSignature: 1 });
    expect(r.delays.quoteToSignatureDays).toBeGreaterThanOrEqual(0);
    expect(r.goals).toEqual({ monthlySignedHtCents: 180000, monthlySent: 4 });
    expect(r.currentMonth).toMatchObject({ signedHtCents: 90000, sent: 3 });
    const csv = reportCsv(r).split("\r\n");
    expect(csv[0]).toContain("taux_signature_pct");
    expect(csv[12]).toContain("900,00");
  });
});
