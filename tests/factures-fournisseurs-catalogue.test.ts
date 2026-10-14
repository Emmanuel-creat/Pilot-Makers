import { PDFDocument } from "pdf-lib";
import { beforeAll, describe, expect, it } from "vitest";
import type { Database } from "@/lib/db";
import { invoiceLinesTable, parseCiiLines, parseUblLines, readPurchaseInvoiceLines, unitPrice4 } from "@/lib/invoice-reader";
import { createItem, getItem } from "@/lib/services/catalog";
import type { Ctx } from "@/lib/services/context";
import { importSupplierInvoice, listCostAlerts } from "@/lib/services/supplier-prices";
import { completeProfile, freshDb, signUp } from "./helpers";

const CII =
  `<?xml version="1.0" encoding="UTF-8"?><rsm:CrossIndustryInvoice xmlns:rsm="r" xmlns:ram="a" xmlns:udt="u">` +
  `<rsm:ExchangedDocument><ram:ID>FA-2026-881</ram:ID><ram:IssueDateTime><udt:DateTimeString format="102">20261012</udt:DateTimeString></ram:IssueDateTime></rsm:ExchangedDocument>` +
  `<rsm:SupplyChainTradeTransaction>` +
  `<ram:IncludedSupplyChainTradeLineItem><ram:SpecifiedTradeProduct><ram:GlobalID schemeID="0160">3 760000 000012</ram:GlobalID><ram:SellerAssignedID>CK-2040</ram:SellerAssignedID><ram:Name>Colle C2 25 kg</ram:Name></ram:SpecifiedTradeProduct>` +
  `<ram:SpecifiedLineTradeAgreement><ram:GrossPriceProductTradePrice><ram:ChargeAmount>32.00</ram:ChargeAmount></ram:GrossPriceProductTradePrice><ram:NetPriceProductTradePrice><ram:ChargeAmount>26.40</ram:ChargeAmount></ram:NetPriceProductTradePrice></ram:SpecifiedLineTradeAgreement>` +
  `<ram:SpecifiedLineTradeDelivery><ram:BilledQuantity unitCode="XBG">10</ram:BilledQuantity></ram:SpecifiedLineTradeDelivery></ram:IncludedSupplyChainTradeLineItem>` +
  `<ram:IncludedSupplyChainTradeLineItem><ram:SpecifiedTradeProduct><ram:SellerAssignedID>VIS-100</ram:SellerAssignedID><ram:Name>Vis inox (boîte de 100)</ram:Name></ram:SpecifiedTradeProduct>` +
  `<ram:SpecifiedLineTradeAgreement><ram:NetPriceProductTradePrice><ram:ChargeAmount>12.50</ram:ChargeAmount><ram:BasisQuantity unitCode="C62">100</ram:BasisQuantity></ram:NetPriceProductTradePrice></ram:SpecifiedLineTradeAgreement>` +
  `<ram:SpecifiedLineTradeDelivery><ram:BilledQuantity unitCode="C62">200</ram:BilledQuantity></ram:SpecifiedLineTradeDelivery></ram:IncludedSupplyChainTradeLineItem>` +
  `<ram:IncludedSupplyChainTradeLineItem><ram:SpecifiedTradeProduct><ram:Name>Frais de livraison</ram:Name></ram:SpecifiedTradeProduct>` +
  `<ram:SpecifiedLineTradeAgreement><ram:NetPriceProductTradePrice><ram:ChargeAmount>45</ram:ChargeAmount></ram:NetPriceProductTradePrice></ram:SpecifiedLineTradeAgreement>` +
  `<ram:SpecifiedLineTradeDelivery><ram:BilledQuantity unitCode="C62">1</ram:BilledQuantity></ram:SpecifiedLineTradeDelivery></ram:IncludedSupplyChainTradeLineItem>` +
  `<ram:ApplicableHeaderTradeAgreement><ram:SellerTradeParty><ram:Name>Négoce Rhône</ram:Name></ram:SellerTradeParty></ram:ApplicableHeaderTradeAgreement>` +
  `<ram:ApplicableHeaderTradeSettlement><ram:InvoiceCurrencyCode>EUR</ram:InvoiceCurrencyCode><ram:SpecifiedTradeSettlementHeaderMonetarySummation><ram:TaxBasisTotalAmount>334.00</ram:TaxBasisTotalAmount><ram:GrandTotalAmount>400.80</ram:GrandTotalAmount></ram:SpecifiedTradeSettlementHeaderMonetarySummation></ram:ApplicableHeaderTradeSettlement>` +
  `</rsm:SupplyChainTradeTransaction></rsm:CrossIndustryInvoice>`;

const UBL =
  `<?xml version="1.0"?><Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2" xmlns:cac="c" xmlns:cbc="b"><cbc:ID>UBL-77</cbc:ID><cbc:IssueDate>2026-10-05</cbc:IssueDate>` +
  `<cac:AccountingSupplierParty><cac:Party><cac:PartyLegalEntity><cbc:RegistrationName>Bois &amp; Matériaux</cbc:RegistrationName></cac:PartyLegalEntity></cac:Party></cac:AccountingSupplierParty>` +
  `<cac:LegalMonetaryTotal><cbc:TaxExclusiveAmount currencyID="EUR">100.00</cbc:TaxExclusiveAmount><cbc:TaxInclusiveAmount currencyID="EUR">120.00</cbc:TaxInclusiveAmount></cac:LegalMonetaryTotal>` +
  `<cac:InvoiceLine><cbc:ID>1</cbc:ID><cbc:InvoicedQuantity unitCode="MTK">12.5</cbc:InvoicedQuantity><cbc:LineExtensionAmount currencyID="EUR">100.00</cbc:LineExtensionAmount>` +
  `<cac:Item><cbc:Name>Parquet chêne</cbc:Name><cac:SellersItemIdentification><cbc:ID>PQ-CH14</cbc:ID></cac:SellersItemIdentification><cac:StandardItemIdentification><cbc:ID schemeID="0160">3760000000099</cbc:ID></cac:StandardItemIdentification></cac:Item>` +
  `<cac:Price><cbc:PriceAmount currencyID="EUR">8.00</cbc:PriceAmount></cac:Price></cac:InvoiceLine></Invoice>`;

describe("lignes des factures électroniques", () => {
  it("lit les lignes CII avec prix net, unité traduite et prix par lot ramené à l'unité", () => {
    const lines = parseCiiLines(CII);
    expect(lines).toHaveLength(3);
    expect(lines[0]).toEqual({ reference: "CK-2040", ean: "3760000000012", label: "Colle C2 25 kg", unit: "sac", quantity: "10", netPrice4: 264000 });
    expect(lines[1]).toMatchObject({ reference: "VIS-100", unit: "u", netPrice4: 1250 }); // 12,50 € les 100 : 0,125 € la vis
    expect(lines[2]).toMatchObject({ reference: "", ean: "", label: "Frais de livraison" });
  });

  it("lit les lignes UBL", () => {
    expect(parseUblLines(UBL)).toEqual([
      { reference: "PQ-CH14", ean: "3760000000099", label: "Parquet chêne", unit: "m²", quantity: "12.5", netPrice4: 80000 },
    ]);
  });

  it("prix unitaire : base absente, illisible ou nulle", () => {
    expect(unitPrice4("10", "")).toBe(100000);
    expect(unitPrice4("10", "4")).toBe(25000);
    expect(unitPrice4("", "")).toBeNull();
    expect(unitPrice4("abc", "")).toBeNull();
    expect(unitPrice4("-3", "")).toBeNull();
    expect(unitPrice4("10", "0")).toBeNull();
  });

  it("table au format du fichier de prix, sans les lignes sans référence", () => {
    const t = invoiceLinesTable(parseCiiLines(CII));
    expect(t[0]).toEqual(["Référence fournisseur", "EAN", "Désignation", "Unité", "Prix net"]);
    expect(t).toHaveLength(3);
    expect(t[1][4]).toBe("26,4000");
  });

  it("lit un PDF Factur-X et un XML, refuse le reste", async () => {
    const pdf = await PDFDocument.create();
    pdf.addPage();
    await pdf.attach(new TextEncoder().encode(CII), "factur-x.xml", { mimeType: "text/xml" });
    const fromPdf = await readPurchaseInvoiceLines(await pdf.save());
    expect(fromPdf?.invoice.number).toBe("FA-2026-881");
    expect(fromPdf?.lines).toHaveLength(3);
    expect((await readPurchaseInvoiceLines(new TextEncoder().encode(UBL)))?.invoice.supplier).toBe("Bois & Matériaux");
    expect(await readPurchaseInvoiceLines(new TextEncoder().encode("Référence;Prix\nA;1"))).toBeNull();
  });
});

describe("mise à jour du catalogue depuis une facture", () => {
  let db: Database;
  let ctx: Ctx;
  let colle: string;
  let vis: string;
  beforeAll(async () => {
    db = await freshDb();
    ctx = await signUp(db, "facture-catalogue@exemple.fr");
    await completeProfile(ctx);
    const base = { category: "materiau", vat_percent: "20", supplier: "Négoce Rhône" };
    colle = await createItem(ctx, { ...base, name: "Colle C2", unit: "u", unit_cost: "22", unit_price: "30", supplier_ref: "CK-2040" });
    vis = await createItem(ctx, { ...base, name: "Vis inox", unit: "u", unit_cost: "0,1", unit_price: "0,5", supplier_ref: "VIS-100" });
  });

  it("aperçu sans rien modifier, fournisseur repris de la facture", async () => {
    const r = await importSupplierInvoice(ctx, { minMarginPercent: "20" }, new TextEncoder().encode(CII), false);
    expect(r.applied).toBe(false);
    expect(r.supplier).toBe("Négoce Rhône");
    expect(r.invoice).toEqual({ number: "FA-2026-881", supplier: "Négoce Rhône", issueDate: "2026-10-12", lines: 3 });
    expect(r.changes.map((c) => [c.supplierRef, c.newCost4])).toEqual(
      expect.arrayContaining([
        ["CK-2040", 264000],
        ["VIS-100", 1250],
      ]),
    );
    expect(Number((await getItem(ctx, colle)).unit_cost4)).toBe(220000);
  });

  it("application : prix d'achat mis à jour et alerte de marge", async () => {
    const r = await importSupplierInvoice(ctx, { supplier: "Négoce Rhône", minMarginPercent: "20" }, new TextEncoder().encode(CII), true);
    expect(r.applied).toBe(true);
    expect(Number((await getItem(ctx, colle)).unit_cost4)).toBe(264000);
    expect(Number((await getItem(ctx, vis)).unit_cost4)).toBe(1250);
    // Colle : 26,40 € pour 30 € de vente, marge 12 % sous le seuil de 20 %.
    expect((await listCostAlerts(ctx)).some((a) => a.item_id === colle)).toBe(true);
  });

  it("refuse un fichier sans facture électronique ou sans aucune référence", async () => {
    await expect(importSupplierInvoice(ctx, {}, new TextEncoder().encode("bonjour"), false)).rejects.toThrow(/Facture illisible/);
    const noRef = CII.replace(/<ram:SellerAssignedID>[^<]*<\/ram:SellerAssignedID>/g, "").replace(/<ram:GlobalID[^>]*>[^<]*<\/ram:GlobalID>/g, "");
    await expect(importSupplierInvoice(ctx, {}, new TextEncoder().encode(noRef), false)).rejects.toThrow(/référence/);
  });
});
