import { beforeAll, describe, expect, it } from "vitest";
import { computeQuote } from "@/lib/calc/engine";
import type { Database } from "@/lib/db";
import { one } from "@/lib/db";
import type { Ctx } from "@/lib/services/context";
import { createDepositInvoice, createFinalInvoice, getInvoice } from "@/lib/services/invoices";
import { publicOptionSource, snapshotOptions } from "@/lib/services/options";
import {
  acceptedCopy,
  createQuote,
  getDraft,
  getVersion,
  issueQuote,
  recordResponseManually,
  respondFromLink,
  saveDraft,
  sendQuote,
  verifySnapshot,
} from "@/lib/services/quotes";
import { completeProfile, freshDb, line, makeCustomer, meta, signUp } from "./helpers";

let db: Database;
let ctx: Ctx;

/** Base : 20 m² à 45 € HT (TVA 10 %), soit 990 € TTC. Option : meuble à 500 € HT (TVA 20 %), soit 600 € TTC. */
async function quoteWithOption() {
  const id = await createQuote(ctx, { customerId: await makeCustomer(ctx) });
  const d = await getDraft(ctx, id);
  const option = line({ label: "Meuble vasque", quantity: "1", unit: "u", unitPrice: "500", vatPercent: "20", optional: true });
  await saveDraft(
    ctx,
    id,
    {
      ...d,
      title: "Salle de bain",
      site: { line1: "4 place Bellecour", line2: "", postalCode: "69002", city: "Lyon" },
      paymentTerms: "Acompte de 30 %, solde à réception.",
      sections: [{ id: d.sections[0].id, title: "", description: "", lines: [line(), option] }],
    },
    d.draftRevision,
  );
  await issueQuote(ctx, id);
  return { id, optionId: option.id as string };
}

beforeAll(async () => {
  db = await freshDb();
  ctx = await signUp(db, "options@exemple.fr");
  await completeProfile(ctx);
});

describe("lignes en option", () => {
  it("chiffre l'option sans l'ajouter au total, à la TVA ni à la marge", () => {
    const c = computeQuote({
      sections: [
        {
          id: "s",
          lines: [
            { id: "a", kind: "item", label: "Base", quantity: "1", unitPrice: "100", vatPercent: "20", unitCost: "50" },
            { id: "b", kind: "item", label: "Option", quantity: "2", unitPrice: "30", vatPercent: "10", unitCost: "10", optional: true },
          ],
        },
      ],
    });
    expect(c.totalHtCents).toBe(10000);
    expect(c.totalTtcCents).toBe(12000);
    expect(c.vatGroups).toHaveLength(1);
    expect(c.margin.costCents).toBe(5000);
    expect(c.sections[0].lines[1]).toMatchObject({ netCents: 6000, optional: true });
    expect(c.options).toEqual({ count: 1, htCents: 6000, ttcCents: 6600 });
    // Sans option, le résultat garde exactement sa forme d'origine (versions déjà émises inchangées).
    const plain = computeQuote({
      sections: [{ id: "s", lines: [{ id: "a", kind: "item", label: "Base", quantity: "1", unitPrice: "100", vatPercent: "20" }] }],
    });
    expect("options" in plain).toBe(false);
  });

  it("laisse le client cocher l'option en ligne, puis facture exactement ce qu'il a accepté", async () => {
    const { id, optionId } = await quoteWithOption();
    const v = await getVersion(db, ctx.orgId, id, 1);
    expect(v.snapshot.calc.totalTtcCents).toBe(99000);
    expect(snapshotOptions(v.snapshot)).toEqual([{ id: optionId, label: "Meuble vasque", netCents: 50000, vatBp: 2000, ttcCents: 60000 }]);
    expect(verifySnapshot(v.snapshot).ok).toBe(true);
    // Les coûts internes ne sont jamais transmis au navigateur du client.
    expect(JSON.stringify(publicOptionSource(v.snapshot))).not.toMatch(/"unitCost":"[^"]/);

    const sent = await sendQuote(ctx, id, { to: "claire@exemple.fr", subject: "Devis", body: "{lien}" });
    const token = sent.link!.split("/d/")[1];
    await expect(
      respondFromLink(db, token, { decision: "accept", name: "Claire Dubois", consent: true, vatAttestation: true, options: ["inconnue"] }, meta),
    ).rejects.toMatchObject({ status: 400 });
    await respondFromLink(db, token, { decision: "accept", name: "Claire Dubois", consent: true, vatAttestation: true, options: [optionId] }, meta);
    const q = await one<{ total_ttc_cents: unknown; accepted_options: string[] }>(
      db,
      "SELECT total_ttc_cents, accepted_options FROM quotes WHERE id=$1",
      [id],
    );
    expect(Number(q!.total_ttc_cents)).toBe(159000);
    expect(q!.accepted_options).toEqual([optionId]);

    const dep = await getInvoice(ctx, (await createDepositInvoice(ctx, id, { percent: "30" })).id);
    expect(dep.total_ttc_cents).toBe(47700);
    const fin = await getInvoice(ctx, (await createFinalInvoice(ctx, id)).id);
    expect(fin.total_ttc_cents).toBe(159000);
    expect(fin.amount_due_cents).toBe(159000 - 47700);
    expect(fin.snapshot.sections[0].lines.some((l) => l.optional)).toBe(false);
    expect((await acceptedCopy(db, ctx.orgId, id)).pdf.length).toBeGreaterThan(1000);
  });

  it("retire de la facture une option que le client n'a pas retenue", async () => {
    const { id } = await quoteWithOption();
    await recordResponseManually(ctx, id, { decision: "accept", version: 1, proof: "Devis signé sans l'option" });
    const fin = await getInvoice(ctx, (await createFinalInvoice(ctx, id)).id);
    expect(fin.total_ttc_cents).toBe(99000);
    expect(fin.snapshot.sections[0].lines).toHaveLength(1);
  });
});
