import { PDFDict, PDFDocument, PDFName } from "pdf-lib";
import { beforeAll, describe, expect, it } from "vitest";
import type { Database } from "@/lib/db";
import type { Ctx } from "@/lib/services/context";
import { buildCii, buildUbl, documentType, einvoiceFile, invoiceData, unitCode, vatCategory } from "@/lib/services/einvoice";
import { createCreditNote, createDepositInvoice, createFinalInvoice, getInvoice } from "@/lib/services/invoices";
import { createQuote, getDraft, issueQuote, recordResponseManually, saveDraft } from "@/lib/services/quotes";
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
      title: "Salle de bains <étage> & combles",
      site: { line1: "4 place Bellecour", line2: "", postalCode: "69002", city: "Lyon" },
      globalDiscount: "3",
      sections: [
        {
          id: d.sections[0].id,
          title: "",
          description: "",
          lines: [
            line(),
            line({
              label: "Fourniture de faïence",
              nature: "materiau",
              quantity: "3,5",
              unit: "m²",
              unitPrice: "33,33",
              vatPercent: "10",
              discountPercent: "5",
            }),
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
  ctx = await signUp(db, "structurees@exemple.fr");
  await completeProfile(ctx);
});

describe("factures aux formats structurés", () => {
  it("codes de base", () => {
    expect(unitCode("m²")).toBe("MTK");
    expect(unitCode("h")).toBe("HUR");
    expect(unitCode("inconnu")).toBe("C62");
    expect(documentType("credit_note")).toBe("381");
    expect(documentType("deposit")).toBe("386");
    expect(documentType("final")).toBe("380");
    expect(vatCategory(2000, { franchise: true, reverseCharge: false })).toBe("E");
    expect(vatCategory(2000, { franchise: false, reverseCharge: true })).toBe("AE");
    expect(vatCategory(0, { franchise: false, reverseCharge: false })).toBe("Z");
    expect(vatCategory(1000, { franchise: false, reverseCharge: false })).toBe("S");
  });

  it("acompte puis solde : totaux cohérents, acompte déduit, XML échappé", async () => {
    const id = await acceptedQuote();
    const dep = await getInvoice(ctx, (await createDepositInvoice(ctx, id, { percent: "30" })).id);
    expect(buildCii(dep.snapshot)).toContain("<ram:TypeCode>386</ram:TypeCode>");
    const fin = await getInvoice(ctx, (await createFinalInvoice(ctx, id)).id);
    const data = invoiceData(fin.snapshot);
    expect(data.consistent).toBe(true);
    expect(data.allowanceTotal).toBeGreaterThan(0);
    expect(data.prepaid).toBe(dep.snapshot.calc.totalTtcCents);
    expect(data.due).toBe(fin.amount_due_cents);
    const cii = buildCii(fin.snapshot);
    expect(cii).toContain("urn:cen.eu:en16931:2017");
    expect(cii).toContain(`<ram:DuePayableAmount>${(fin.amount_due_cents / 100).toFixed(2)}</ram:DuePayableAmount>`);
    expect(cii).toContain('unitCode="MTK"');
    expect(cii).not.toMatch(/<étage>/);
    const ubl = buildUbl(fin.snapshot);
    expect(ubl).toContain("<cbc:InvoiceTypeCode>380</cbc:InvoiceTypeCode>");
    expect(ubl).toContain(`<cbc:PayableAmount currencyID="EUR">${(fin.amount_due_cents / 100).toFixed(2)}</cbc:PayableAmount>`);
  });

  it("avoir en UBL CreditNote et autoliquidation en catégorie AE", async () => {
    const id = await acceptedQuote({ reverseCharge: true, globalDiscount: "0" }, pro);
    const fin = await getInvoice(ctx, (await createFinalInvoice(ctx, id)).id);
    expect(buildCii(fin.snapshot)).toContain("<ram:CategoryCode>AE</ram:CategoryCode>");
    expect(buildCii(fin.snapshot)).toContain("VATEX-EU-AE");
    const cn = await getInvoice(ctx, (await createCreditNote(ctx, fin.id, { mode: "full", reason: "Erreur" })).id);
    const ubl = buildUbl(cn.snapshot);
    expect(ubl).toContain("<CreditNote");
    expect(ubl).toContain("<cbc:CreditNoteTypeCode>381</cbc:CreditNoteTypeCode>");
    expect(invoiceData(cn.snapshot).consistent).toBe(true);
  });

  it("PDF Factur-X : XML joint, PDF archivé inchangé, format inconnu refusé", async () => {
    const id = await acceptedQuote();
    const fin = await createFinalInvoice(ctx, id);
    const file = await einvoiceFile(ctx, fin.id, "facturx");
    expect(file.contentType).toBe("application/pdf");
    const doc = await PDFDocument.load(file.body);
    const names = doc.catalog.lookup(PDFName.of("Names"), PDFDict);
    const files = names.lookup(PDFName.of("EmbeddedFiles"), PDFDict).toString();
    const hex = [..."factur-x.xml"].map((c) => c.charCodeAt(0).toString(16).toUpperCase().padStart(4, "0")).join("");
    expect(files).toContain(hex);
    expect(doc.catalog.get(PDFName.of("AF"))).toBeTruthy();
    const archived = await db.query<{ n: number }>("SELECT octet_length(pdf) AS n FROM invoices WHERE id=$1", [fin.id]);
    expect(Number(archived[0].n)).toBeLessThan(file.body.length);
    const ubl = await einvoiceFile(ctx, fin.id, "ubl");
    expect(new TextDecoder().decode(ubl.body)).toContain("<Invoice");
    await expect(einvoiceFile(ctx, fin.id, "pdfa")).rejects.toMatchObject({ status: 400 });
  });
});
