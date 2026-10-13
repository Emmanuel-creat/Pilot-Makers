import { beforeAll, describe, expect, it } from "vitest";
import type { Database } from "@/lib/db";
import type { Ctx } from "@/lib/services/context";
import { invoiceData } from "@/lib/services/einvoice";
import { createFinalInvoice, createProgressInvoice, getInvoice } from "@/lib/services/invoices";
import { createQuote, getDraft, getVersion, issueQuote, recordResponseManually, saveDraft } from "@/lib/services/quotes";
import { normalizeRevision, revisionAmount, revisionCoefficient, saveIndexValue } from "@/lib/services/revision";
import { completeProfile, freshDb, line, makeCustomer, signUp } from "./helpers";

let db: Database;
let ctx: Ctx;

const clause = { index: "BT01", baseMonth: "2026-03", fixedPercent: "15" };

async function acceptedQuote(extra: Record<string, unknown> = {}) {
  const id = await createQuote(ctx, { customerId: await makeCustomer(ctx) });
  const d = await getDraft(ctx, id);
  await saveDraft(
    ctx,
    id,
    {
      ...d,
      title: "Extension de maison",
      site: { line1: "4 place Bellecour", line2: "", postalCode: "69002", city: "Lyon" },
      priceRevision: clause,
      sections: [
        {
          id: d.sections[0].id,
          title: "",
          description: "",
          lines: [
            line({ quantity: "100", unitPrice: "100" }),
            line({ label: "Fourniture", nature: "materiau", quantity: "10", unitPrice: "50", vatPercent: "20" }),
          ],
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
  ctx = await signUp(db, "revision@exemple.fr");
  await completeProfile(ctx);
  await saveIndexValue(ctx, { code: "BT01", month: "2026-03", value: "130,0" });
  await saveIndexValue(ctx, { code: "bt01", month: "2026-09", value: "133,9" });
  await saveIndexValue(ctx, { code: "BT01", month: "2026-10", value: "128,7" });
});

describe("révision de prix sur index BT", () => {
  it("formule, arrondis et contrôles", () => {
    // 0,15 + 0,85 x 133,9 / 130 = 1,0255
    expect(revisionCoefficient("15", 13000, 13390)).toBe(10255);
    expect(revisionCoefficient("0", 13000, 13000)).toBe(10000);
    expect(revisionAmount(100000, 10255)).toBe(2550);
    expect(revisionAmount(100000, 9915)).toBe(-850);
    expect(revisionAmount(0, 10255)).toBe(0);
    expect(normalizeRevision({ index: "bt01", baseMonth: "2026-03", fixedPercent: "" })).toEqual(clause);
    expect(normalizeRevision(null)).toBeNull();
    expect(() => normalizeRevision({ index: "XX9", baseMonth: "2026-03", fixedPercent: "15" })).toThrow();
    expect(() => normalizeRevision({ index: "BT01", baseMonth: "2026-13", fixedPercent: "15" })).toThrow();
    expect(() => normalizeRevision({ index: "BT01", baseMonth: "2026-03", fixedPercent: "120" })).toThrow();
  });

  it("le devis imprime la clause, la facture de solde ajoute la révision par taux de TVA", async () => {
    const id = await acceptedQuote();
    const quote = (await getVersion(db, ctx.orgId, id, 1)).snapshot;
    expect(quote.quote.priceRevision).toEqual(clause);
    expect(quote.mentions.some((m) => m.includes("Prix révisables selon l'index BT01") && m.includes("03/2026"))).toBe(true);
    await expect(createFinalInvoice(ctx, id, { revisionMonth: "2026-08" })).rejects.toMatchObject({ status: 400 });
    await expect(createFinalInvoice(ctx, id, { revisionMonth: "2026-01" })).rejects.toMatchObject({ status: 400 });
    const inv = await getInvoice(ctx, (await createFinalInvoice(ctx, id, { revisionMonth: "2026-09" })).id);
    const s = inv.snapshot;
    expect(s.invoice.revision).toMatchObject({ index: "BT01", month: "2026-09", baseCenti: 13000, currentCenti: 13390, coefficient: 10255 });
    const rev = s.sections.find((sec) => sec.title === "Révision de prix")!;
    expect(rev.lines).toHaveLength(2);
    expect(rev.lines[0].label).toContain("coefficient 1,0255");
    // 10 000 € à 10 % et 500 € à 20 % : révision 255 € et 12,75 €
    expect(s.calc.totalHtCents).toBe(quote.calc.totalHtCents + 25500 + 1275);
    expect(invoiceData(s).consistent).toBe(true);
  });

  it("révision à la baisse, remise globale et facture sans révision", async () => {
    const id = await acceptedQuote({ globalDiscount: "10" });
    const quote = (await getVersion(db, ctx.orgId, id, 1)).snapshot;
    const inv = await getInvoice(ctx, (await createFinalInvoice(ctx, id, { revisionMonth: "2026-10" })).id);
    const k = inv.snapshot.invoice.revision!.coefficient;
    expect(k).toBeLessThan(10000);
    const expected = Math.round((quote.calc.totalHtCents * k) / 10000);
    expect(Math.abs(inv.snapshot.calc.totalHtCents - expected)).toBeLessThanOrEqual(2);
    expect(invoiceData(inv.snapshot).consistent).toBe(true);

    const plain = await acceptedQuote();
    const p = await getInvoice(ctx, (await createFinalInvoice(ctx, plain)).id);
    expect(p.snapshot.invoice.revision).toBeUndefined();
    expect(p.snapshot.calc.totalHtCents).toBe((await getVersion(db, ctx.orgId, plain, 1)).snapshot.calc.totalHtCents);
  });

  it("situations : chaque tranche est révisée avec l'index de son mois", async () => {
    const id = await acceptedQuote();
    const s1 = await getInvoice(ctx, (await createProgressInvoice(ctx, id, { percent: "50", revisionMonth: "2026-09" })).id);
    expect(s1.snapshot.invoice.revision?.coefficient).toBe(10255);
    const fin = await getInvoice(ctx, (await createFinalInvoice(ctx, id, { revisionMonth: "2026-03" })).id);
    // Index inchangé au mois de référence : coefficient 1, aucune ligne de révision
    expect(fin.snapshot.invoice.revision?.coefficient).toBe(10000);
    expect(fin.snapshot.sections.some((sec) => sec.title === "Révision de prix")).toBe(false);
  });
});
