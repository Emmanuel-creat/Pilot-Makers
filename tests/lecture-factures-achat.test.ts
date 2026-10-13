import { PDFDocument } from "pdf-lib";
import { beforeAll, describe, expect, it } from "vitest";
import type { Database } from "@/lib/db";
import {
  amountCents,
  embeddedInvoiceXml,
  isoDate,
  parseInvoiceXml,
  readPurchaseInvoice,
} from "@/lib/invoice-reader";
import type { Ctx } from "@/lib/services/context";
import { buildUbl, einvoiceFile, invoiceData } from "@/lib/services/einvoice";
import { createFinalInvoice, getInvoice } from "@/lib/services/invoices";
import {
  createQuote,
  getDraft,
  issueQuote,
  recordResponseManually,
  saveDraft,
} from "@/lib/services/quotes";
import {
  completeProfile,
  freshDb,
  line,
  makeCustomer,
  signUp,
} from "./helpers";

let db: Database;
let ctx: Ctx;

async function finalInvoice() {
  const id = await createQuote(ctx, { customerId: await makeCustomer(ctx) });
  const d = await getDraft(ctx, id);
  await saveDraft(
    ctx,
    id,
    {
      ...d,
      title: "Cuisine",
      sections: [
        {
          id: d.sections[0].id,
          title: "",
          description: "",
          lines: [
            line(),
            line({
              label: "Plan de travail",
              unitPrice: "412,50",
              vatPercent: "10",
            }),
          ],
        },
      ],
    },
    d.draftRevision,
  );
  await issueQuote(ctx, id);
  await recordResponseManually(ctx, id, {
    decision: "accept",
    version: 1,
    proof: "Bon pour accord",
  });
  return getInvoice(ctx, (await createFinalInvoice(ctx, id)).id);
}

beforeAll(async () => {
  db = await freshDb();
  ctx = await signUp(db, "lecture-achats@exemple.fr");
  await completeProfile(ctx);
});

describe("lecture des factures d'achat", () => {
  it("outils de base", () => {
    expect(amountCents("1 234,56")).toBe(123456);
    expect(amountCents("-12.5")).toBe(-1250);
    expect(amountCents("abc")).toBeNull();
    expect(isoDate("20261013")).toBe("2026-10-13");
    expect(isoDate("2026-10-13T00:00:00")).toBe("2026-10-13");
    expect(isoDate("13/10/2026")).toBe("");
  });

  it("PDF Factur-X : numéro, fournisseur, dates et montants retrouvés", async () => {
    const inv = await finalInvoice();
    const file = await einvoiceFile(ctx, inv.id, "facturx");
    const data = await readPurchaseInvoice(file.body);
    const d = invoiceData(inv.snapshot);
    expect(data).toMatchObject({
      format: "cii",
      number: inv.number,
      issueDate: inv.snapshot.invoice.issueDate,
      dueDate: inv.snapshot.invoice.dueDate,
      netCents: d.taxBasis,
      vatCents: d.taxTotal,
      totalCents: d.grandTotal,
      currency: "EUR",
    });
    expect(data?.supplier).toBeTruthy();
  });

  it("XML UBL et CII seuls, avec entités échappées", async () => {
    const inv = await finalInvoice();
    const ubl = await readPurchaseInvoice(
      new TextEncoder().encode("﻿" + buildUbl(inv.snapshot)),
    );
    expect(ubl).toMatchObject({
      format: "ubl",
      number: inv.number,
      totalCents: invoiceData(inv.snapshot).grandTotal,
      dueDate: inv.snapshot.invoice.dueDate,
    });
    const cii = parseInvoiceXml(
      `<?xml version="1.0"?><rsm:CrossIndustryInvoice xmlns:rsm="x"><rsm:ExchangedDocument><ram:ID>F-12</ram:ID><ram:IssueDateTime><udt:DateTimeString format="102">20261001</udt:DateTimeString></ram:IssueDateTime></rsm:ExchangedDocument>` +
        `<ram:SellerTradeParty><ram:Name>Négoce &amp; Fils</ram:Name></ram:SellerTradeParty><ram:ApplicableHeaderTradeSettlement><ram:SpecifiedTradeSettlementHeaderMonetarySummation><ram:GrandTotalAmount>120.00</ram:GrandTotalAmount></ram:SpecifiedTradeSettlementHeaderMonetarySummation></ram:ApplicableHeaderTradeSettlement></rsm:CrossIndustryInvoice>`,
    );
    expect(cii).toMatchObject({
      number: "F-12",
      supplier: "Négoce & Fils",
      issueDate: "2026-10-01",
      totalCents: 12000,
      netCents: null,
      dueDate: "",
    });
  });

  it("fichiers sans données structurées : rien n'est inventé", async () => {
    const plain = await PDFDocument.create();
    plain.addPage();
    const bytes = await plain.save();
    expect(await embeddedInvoiceXml(bytes)).toBeNull();
    expect(await readPurchaseInvoice(bytes)).toBeNull();
    expect(
      await readPurchaseInvoice(
        new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]),
      ),
    ).toBeNull();
    expect(
      await readPurchaseInvoice(
        new TextEncoder().encode("<html><body>Bonjour</body></html>"),
      ),
    ).toBeNull();
    expect(
      await readPurchaseInvoice(new TextEncoder().encode("%PDF-1.7 abîmé")),
    ).toBeNull();
    // Un fichier joint qui n'est pas un XML de facture n'est pas lu.
    const other = await PDFDocument.create();
    other.addPage();
    await other.attach(new TextEncoder().encode("bonjour"), "notes.txt", {
      mimeType: "text/plain",
    });
    expect(await embeddedInvoiceXml(await other.save())).toBeNull();
  });
});
