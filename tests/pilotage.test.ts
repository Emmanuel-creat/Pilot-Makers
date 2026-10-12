import { beforeAll, describe, expect, it } from "vitest";
import type { Database } from "@/lib/db";
import type { Ctx } from "@/lib/services/context";
import { getDashboard } from "@/lib/services/dashboard";
import { createDepositInvoice } from "@/lib/services/invoices";
import { createQuote, getDraft, getVersion, issueQuote, recordResponseManually, respondFromLink, saveDraft, sendQuote } from "@/lib/services/quotes";
import { completeProfile, freshDb, line, makeCustomer, meta, signUp } from "./helpers";

let db: Database;
let ctx: Ctx;

async function issued(lineExtra: Record<string, unknown> = {}) {
  const id = await createQuote(ctx, { customerId: await makeCustomer(ctx) });
  const d = await getDraft(ctx, id);
  await saveDraft(
    ctx,
    id,
    {
      ...d,
      title: "Salle de bain",
      site: { line1: "4 place Bellecour", line2: "", postalCode: "69002", city: "Lyon" },
      paymentTerms: "Solde à réception.",
      sections: [{ id: d.sections[0].id, title: "", description: "", lines: [line(lineExtra)] }],
    },
    d.draftRevision,
  );
  await issueQuote(ctx, id);
  return id;
}

beforeAll(async () => {
  db = await freshDb();
  ctx = await signUp(db, "pilotage@exemple.fr");
  await completeProfile(ctx);
});

describe("commentaires internes par ligne", () => {
  it("conserve le commentaire dans le brouillon mais jamais dans la version envoyée ni le PDF", async () => {
    const secret = "Fournisseur Durand, remise 12 pourcent negociee";
    const id = await issued({ internalNote: secret });
    const d = await getDraft(ctx, id);
    expect(d.sections[0].lines[0].internalNote).toBe(secret);
    const v = await getVersion(db, ctx.orgId, id, 1);
    expect(JSON.stringify(v.snapshot)).not.toContain("Durand");
    expect(Buffer.from(v.pdf).toString("latin1")).not.toContain("Durand");
  });
});

describe("raisons des refus et encaissements prévus", () => {
  it("enregistre la raison choisie par le client ou par l'artisan et la compte au tableau de bord", async () => {
    const a = await issued();
    const sent = await sendQuote(ctx, a, { to: "claire@exemple.fr", subject: "Devis", body: "{lien}" });
    const token = sent.link!.split("/d/")[1];
    await respondFromLink(db, token, { decision: "refuse", name: "Claire Dubois", reasonCode: "prix", reason: "Trop cher pour nous" }, meta);
    const b = await issued();
    await recordResponseManually(ctx, b, { decision: "refuse", version: 1, proof: "Appel du 12/10", reasonCode: "prix" });
    const c = await issued();
    await recordResponseManually(ctx, c, { decision: "refuse", version: 1, proof: "Courriel du 12/10" });
    await expect(
      recordResponseManually(ctx, await issued(), { decision: "refuse", version: 1, proof: "Appel", reasonCode: "inconnu" }),
    ).rejects.toMatchObject({
      status: 400,
    });

    const dash = await getDashboard(ctx);
    expect(dash.refusals[0]).toEqual({ code: "prix", label: "Prix trop élevé", count: 2 });
    expect(dash.refusals).toContainEqual({ code: "", label: "Raison non précisée", count: 1 });
    const mail = await db.query<{ body: string }>("SELECT body FROM emails WHERE quote_id=$1 AND kind='notification' AND subject LIKE '%refusé%'", [
      a,
    ]);
    expect(mail[0].body).toContain("Raison : Prix trop élevé");
  });

  it("prévoit les encaissements à partir des factures dues et des devis acceptés non facturés", async () => {
    const id = await issued();
    await recordResponseManually(ctx, id, { decision: "accept", version: 1, proof: "Devis signé" });
    let dash = await getDashboard(ctx);
    // Une ligne : 20 m² à 45 € HT, TVA 10 % : 990 € TTC.
    expect(dash.forecast.notInvoicedCents).toBe(99000);
    expect(dash.forecast.within30Cents).toBe(0);
    await createDepositInvoice(ctx, id, { percent: "30" });
    dash = await getDashboard(ctx);
    expect(dash.forecast.within30Cents).toBe(29700);
    expect(dash.forecast.notInvoicedCents).toBe(99000 - 29700);
  });
});
