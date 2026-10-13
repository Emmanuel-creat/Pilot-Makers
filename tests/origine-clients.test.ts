import { beforeAll, describe, expect, it } from "vitest";
import type { Database } from "@/lib/db";
import type { Ctx } from "@/lib/services/context";
import { highlights, metrics, totals } from "@/lib/acquisition";
import { acquisition, getAcquisitionCosts, saveAcquisitionCosts } from "@/lib/services/acquisition";
import { createFinalInvoice } from "@/lib/services/invoices";
import { createLead, updateLead } from "@/lib/services/leads";
import { createQuote, getDraft, issueQuote, parisDate, recordResponseManually, saveDraft } from "@/lib/services/quotes";
import { completeProfile, freshDb, line, makeCustomer, signUp } from "./helpers";

let db: Database;
let ctx: Ctx;
const year = Number(parisDate(new Date()).slice(0, 4));

async function invoicedQuote(customerId: string) {
  const id = await createQuote(ctx, { customerId });
  const d = await getDraft(ctx, id);
  await saveDraft(ctx, id, { ...d, title: "Salle de bains", sections: [{ ...d.sections[0], lines: [line()] }] }, d.draftRevision);
  await issueQuote(ctx, id);
  await recordResponseManually(ctx, id, { decision: "accept", version: 1, proof: "Bon pour accord signé" });
  await createFinalInvoice(ctx, id);
  return { quoteId: id };
}

beforeAll(async () => {
  db = await freshDb();
  ctx = await signUp(db, "origine@exemple.fr");
  await completeProfile(ctx);
});

describe("indicateurs par source", () => {
  it("calcule transformation, coût par client et rendement", () => {
    const m = metrics({ leads: 8, won: 2, revenueCents: 1200000, costCents: 40000 });
    expect(m.conversionBp).toBe(2500);
    expect(m.costPerLeadCents).toBe(5000);
    expect(m.costPerWonCents).toBe(20000);
    expect(m.returnPer100).toBe(3000);
    expect(metrics({ leads: 0, won: 0, revenueCents: 0, costCents: 0 })).toMatchObject({ conversionBp: null, costPerWonCents: null, returnPer100: null });
    expect(totals([m, metrics({ leads: 2, won: 1, revenueCents: 0, costCents: 10000 })])).toMatchObject({ leads: 10, won: 3, costCents: 50000 });
  });

  it("met en avant la source la plus rentable et le client gagné le plus cher", () => {
    const rows = [
      { source: "a", ...metrics({ leads: 10, won: 2, revenueCents: 500000, costCents: 100000 }) },
      { source: "b", ...metrics({ leads: 4, won: 2, revenueCents: 900000, costCents: 10000 }) },
      { source: "c", ...metrics({ leads: 3, won: 0, revenueCents: 0, costCents: 0 }) },
    ];
    expect(highlights(rows)).toEqual({ best: "b", costliest: "a" });
    expect(highlights(rows.slice(0, 1))).toEqual({ best: null, costliest: null });
  });
});

describe("origine des clients", () => {
  it("relie demandes, devis gagnés, chiffre d'affaires et dépenses", async () => {
    const reco = await createLead(ctx, { name: "Claire Dubois", phone: "0601020304", source: "recommandation", description: "Salle de bains" });
    const lost = await createLead(ctx, { name: "Marc Petit", phone: "0601020305", source: "plateforme", description: "Cuisine" });
    await createLead(ctx, { name: "Léa Roux", phone: "0601020306", source: "plateforme", description: "Peinture" });
    await updateLead(ctx, lost, { status: "perdue" });
    const customerId = await makeCustomer(ctx);
    const { quoteId } = await invoicedQuote(customerId);
    await db.query("UPDATE leads SET customer_id=$2, quote_id=$3 WHERE id=$1", [reco, customerId, quoteId]);
    await invoicedQuote(await makeCustomer(ctx, { type: "entreprise", company_name: "Bâti Général SAS", siren: "732829320" }));

    await expect(saveAcquisitionCosts(ctx, year, { plateforme: "-3" })).rejects.toThrow();
    await saveAcquisitionCosts(ctx, year, { plateforme: "300", recommandation: "50" });
    expect(await getAcquisitionCosts(ctx, year)).toEqual({ plateforme: 30000, recommandation: 5000 });

    const rows = await acquisition(ctx, year);
    const r = rows.find((x) => x.source === "recommandation")!;
    expect(r).toMatchObject({ leads: 1, won: 1, conversionBp: 10000, costCents: 5000, costPerWonCents: 5000 });
    expect(r.revenueCents).toBeGreaterThan(0);
    const p = rows.find((x) => x.source === "plateforme")!;
    expect(p).toMatchObject({ leads: 2, won: 0, conversionBp: 0, revenueCents: 0, costPerLeadCents: 15000, costPerWonCents: null, returnPer100: 0 });
    const unknown = rows.find((x) => x.source === "inconnue")!;
    expect(unknown.label).toBe("Origine non renseignée");
    expect(unknown.revenueCents).toBeGreaterThan(0);

    await saveAcquisitionCosts(ctx, year, { recommandation: "80" });
    expect(await getAcquisitionCosts(ctx, year)).toEqual({ recommandation: 8000 });
    expect((await acquisition(ctx, year - 1)).every((x) => x.leads === 0)).toBe(true);
  });
});
