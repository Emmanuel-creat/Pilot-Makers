/**
 * Factures électroniques structurées (norme européenne EN 16931) :
 * - CII (Cross Industry Invoice), la syntaxe de Factur-X ;
 * - UBL 2.1.
 * Le XML est produit depuis la photographie figée de la facture : il dit
 * exactement ce que dit le PDF. Les montants sont en euros, avec deux décimales.
 */

import { AFRelationship, PDFDocument, PDFName, PDFString } from "pdf-lib";
import type { CalcLineResult } from "@/lib/calc/engine";
import { badRequest } from "@/lib/http";
import type { Ctx } from "./context";
import { requireFeature } from "./features";
import { getInvoice, getInvoicePdf, type InvoiceSnapshot } from "./invoices";

const esc = (s: string) =>
  s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    // Caractères de contrôle interdits en XML 1.0
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "");

const amount = (cents: number) => (cents / 100).toFixed(2);
const decimal = (v: number, scale: number) => {
  const s = (v / 10 ** scale).toFixed(scale);
  return s.includes(".") ? s.replace(/0+$/, "").replace(/\.$/, "") : s;
};
const ymd = (iso: string) => iso.slice(0, 10).replaceAll("-", "");

/** Codes d'unité de la recommandation 20 de la CEE-ONU. */
const UNIT_CODES: Record<string, string> = {
  u: "C62",
  h: "HUR",
  j: "DAY",
  "m²": "MTK",
  m2: "MTK",
  "m³": "MTQ",
  m3: "MTQ",
  ml: "MTR",
  m: "MTR",
  kg: "KGM",
  t: "TNE",
  l: "LTR",
  forfait: "LS",
  lot: "LS",
  ens: "C62",
  sac: "C62",
};
export const unitCode = (unit: string) => UNIT_CODES[unit.trim().toLowerCase()] ?? "C62";

export type VatCategory = "S" | "E" | "AE" | "Z";

interface VatContext {
  franchise: boolean;
  reverseCharge: boolean;
}

/** Catégorie de TVA EN 16931 d'un taux, selon le régime de la facture. */
export function vatCategory(vatBp: number, c: VatContext): VatCategory {
  if (c.franchise) return "E";
  if (c.reverseCharge) return "AE";
  return vatBp === 0 ? "Z" : "S";
}

const EXEMPTION: Partial<Record<VatCategory, { reason: string; code: string }>> = {
  E: { reason: "TVA non applicable, article 293 B du Code général des impôts", code: "VATEX-FR-FRANCHISE" },
  AE: { reason: "Autoliquidation, article 283-2 nonies du Code général des impôts", code: "VATEX-EU-AE" },
};

/** Document type : facture 380, avoir 381, facture d'acompte 386. */
export function documentType(kind: string) {
  return kind === "credit_note" ? "381" : kind === "deposit" ? "386" : "380";
}

interface EnLine {
  id: number;
  name: string;
  description: string;
  quantity: string;
  unit: string;
  priceUnit: string;
  grossCents: number;
  discountCents: number;
  netCents: number;
  vatBp: number;
}

/** Données communes aux deux syntaxes, contrôlées : la somme des lignes et des remises retombe sur les totaux. */
export function invoiceData(s: InvoiceSnapshot) {
  const calcLines = new Map<string, CalcLineResult>(s.calc.sections.flatMap((sec) => sec.lines.map((l) => [l.id, l])));
  const lines: EnLine[] = [];
  for (const sec of s.sections) {
    for (const l of sec.lines) {
      const c = calcLines.get(l.id);
      if (!c || l.kind !== "item" || c.optional) continue;
      lines.push({
        id: lines.length + 1,
        name: l.label,
        description: l.description,
        quantity: decimal(c.quantityMilli, 3),
        unit: unitCode(l.unit),
        priceUnit: decimal(c.unitPrice4, 4),
        grossCents: c.grossCents,
        discountCents: c.discountCents,
        netCents: c.netCents,
        vatBp: c.vatBp,
      });
    }
  }
  const ctx: VatContext = { franchise: s.org.vat_regime === "franchise", reverseCharge: s.quote.reverseCharge === true };
  const lineTotal = lines.reduce((t, l) => t + l.netCents, 0);
  // Remise globale ventilée par taux : écart entre les lignes d'un taux et la base taxable de ce taux.
  const groups = s.calc.vatGroups.map((g) => {
    const linesAtRate = lines.filter((l) => l.vatBp === g.vatBp).reduce((t, l) => t + l.netCents, 0);
    return { ...g, category: vatCategory(g.vatBp, ctx), allowanceCents: linesAtRate - g.baseCents };
  });
  const allowanceTotal = groups.reduce((t, g) => t + g.allowanceCents, 0);
  const prepaid = s.invoice.deductions.reduce((t, d) => t + d.ttcCents, 0);
  const notes = [...s.mentions];
  if (s.invoice.retention?.cents) notes.push(`Retenue de garantie de ${amount(s.invoice.retention.cents)} EUR déduite du montant à payer.`);
  return {
    lines,
    groups,
    ctx,
    lineTotal,
    allowanceTotal,
    taxBasis: s.calc.totalHtCents,
    taxTotal: s.calc.totalVatCents,
    grandTotal: s.calc.totalTtcCents,
    prepaid,
    due: s.calc.totalTtcCents - prepaid,
    notes,
    consistent: lineTotal - allowanceTotal === s.calc.totalHtCents && groups.reduce((t, g) => t + g.baseCents, 0) === s.calc.totalHtCents,
  };
}

const siren = (v: string) => v.replace(/\D/g, "").slice(0, 9);

/* ------------------------------------------------------------------ */
/* CII (Factur-X, profil EN 16931)                                     */
/* ------------------------------------------------------------------ */

export function buildCii(s: InvoiceSnapshot): string {
  const d = invoiceData(s);
  const o = s.org;
  const c = s.customer;
  const party = (p: { name: string; siren: string; vat: string; line1: string; line2: string; postal: string; city: string; email?: string }) =>
    [
      `<ram:Name>${esc(p.name)}</ram:Name>`,
      siren(p.siren) ? `<ram:SpecifiedLegalOrganization><ram:ID schemeID="0002">${siren(p.siren)}</ram:ID></ram:SpecifiedLegalOrganization>` : "",
      `<ram:PostalTradeAddress><ram:PostcodeCode>${esc(p.postal)}</ram:PostcodeCode><ram:LineOne>${esc(p.line1)}</ram:LineOne>${
        p.line2 ? `<ram:LineTwo>${esc(p.line2)}</ram:LineTwo>` : ""
      }<ram:CityName>${esc(p.city)}</ram:CityName><ram:CountryID>FR</ram:CountryID></ram:PostalTradeAddress>`,
      p.email ? `<ram:URIUniversalCommunication><ram:URIID schemeID="EM">${esc(p.email)}</ram:URIID></ram:URIUniversalCommunication>` : "",
      p.vat ? `<ram:SpecifiedTaxRegistration><ram:ID schemeID="VA">${esc(p.vat)}</ram:ID></ram:SpecifiedTaxRegistration>` : "",
    ].join("");
  const tax = (bp: number, cat: VatCategory) =>
    `<ram:TypeCode>VAT</ram:TypeCode><ram:CategoryCode>${cat}</ram:CategoryCode><ram:RateApplicablePercent>${decimal(bp, 2)}</ram:RateApplicablePercent>`;
  const lines = d.lines
    .map((l) => {
      const cat = vatCategory(l.vatBp, d.ctx);
      return (
        `<ram:IncludedSupplyChainTradeLineItem>` +
        `<ram:AssociatedDocumentLineDocument><ram:LineID>${l.id}</ram:LineID></ram:AssociatedDocumentLineDocument>` +
        `<ram:SpecifiedTradeProduct><ram:Name>${esc(l.name)}</ram:Name>${l.description ? `<ram:Description>${esc(l.description)}</ram:Description>` : ""}</ram:SpecifiedTradeProduct>` +
        `<ram:SpecifiedLineTradeAgreement><ram:NetPriceProductTradePrice><ram:ChargeAmount>${l.priceUnit}</ram:ChargeAmount></ram:NetPriceProductTradePrice></ram:SpecifiedLineTradeAgreement>` +
        `<ram:SpecifiedLineTradeDelivery><ram:BilledQuantity unitCode="${l.unit}">${l.quantity}</ram:BilledQuantity></ram:SpecifiedLineTradeDelivery>` +
        `<ram:SpecifiedLineTradeSettlement><ram:ApplicableTradeTax>${tax(l.vatBp, cat)}</ram:ApplicableTradeTax>` +
        (l.discountCents
          ? `<ram:SpecifiedTradeAllowanceCharge><ram:ChargeIndicator><udt:Indicator>false</udt:Indicator></ram:ChargeIndicator><ram:ActualAmount>${amount(l.discountCents)}</ram:ActualAmount><ram:Reason>Remise</ram:Reason></ram:SpecifiedTradeAllowanceCharge>`
          : "") +
        `<ram:SpecifiedTradeSettlementLineMonetarySummation><ram:LineTotalAmount>${amount(l.netCents)}</ram:LineTotalAmount></ram:SpecifiedTradeSettlementLineMonetarySummation>` +
        `</ram:SpecifiedLineTradeSettlement></ram:IncludedSupplyChainTradeLineItem>`
      );
    })
    .join("");
  const taxes = d.groups
    .map((g) => {
      const ex = EXEMPTION[g.category];
      return (
        `<ram:ApplicableTradeTax><ram:CalculatedAmount>${amount(g.vatCents)}</ram:CalculatedAmount><ram:TypeCode>VAT</ram:TypeCode>` +
        (ex ? `<ram:ExemptionReason>${esc(ex.reason)}</ram:ExemptionReason>` : "") +
        `<ram:BasisAmount>${amount(g.baseCents)}</ram:BasisAmount><ram:CategoryCode>${g.category}</ram:CategoryCode>` +
        (ex ? `<ram:ExemptionReasonCode>${ex.code}</ram:ExemptionReasonCode>` : "") +
        `<ram:RateApplicablePercent>${decimal(g.vatBp, 2)}</ram:RateApplicablePercent></ram:ApplicableTradeTax>`
      );
    })
    .join("");
  const allowances = d.groups
    .filter((g) => g.allowanceCents)
    .map(
      (g) =>
        `<ram:SpecifiedTradeAllowanceCharge><ram:ChargeIndicator><udt:Indicator>false</udt:Indicator></ram:ChargeIndicator><ram:ActualAmount>${amount(
          g.allowanceCents,
        )}</ram:ActualAmount><ram:Reason>Remise globale</ram:Reason><ram:CategoryTradeTax>${tax(g.vatBp, g.category)}</ram:CategoryTradeTax></ram:SpecifiedTradeAllowanceCharge>`,
    )
    .join("");
  const iban = s.invoice.bank.iban.replace(/\s/g, "");
  return (
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<rsm:CrossIndustryInvoice xmlns:rsm="urn:un:unece:uncefact:data:standard:CrossIndustryInvoice:100" xmlns:ram="urn:un:unece:uncefact:data:standard:ReusableAggregateBusinessInformationEntity:100" xmlns:udt="urn:un:unece:uncefact:data:standard:UnqualifiedDataType:100" xmlns:qdt="urn:un:unece:uncefact:data:standard:QualifiedDataType:100">` +
    `<rsm:ExchangedDocumentContext><ram:GuidelineSpecifiedDocumentContextParameter><ram:ID>urn:cen.eu:en16931:2017</ram:ID></ram:GuidelineSpecifiedDocumentContextParameter></rsm:ExchangedDocumentContext>` +
    `<rsm:ExchangedDocument><ram:ID>${esc(s.invoice.number)}</ram:ID><ram:TypeCode>${documentType(s.invoice.kind)}</ram:TypeCode>` +
    `<ram:IssueDateTime><udt:DateTimeString format="102">${ymd(s.invoice.issueDate)}</udt:DateTimeString></ram:IssueDateTime>` +
    d.notes.map((n) => `<ram:IncludedNote><ram:Content>${esc(n)}</ram:Content></ram:IncludedNote>`).join("") +
    `</rsm:ExchangedDocument>` +
    `<rsm:SupplyChainTradeTransaction>${lines}` +
    `<ram:ApplicableHeaderTradeAgreement>` +
    `<ram:SellerTradeParty>${party({ name: o.legal_name || o.trade_name, siren: o.siren, vat: o.vat_number, line1: o.address_line1, line2: o.address_line2, postal: o.postal_code, city: o.city, email: o.email })}</ram:SellerTradeParty>` +
    `<ram:BuyerTradeParty>${party({ name: c.name, siren: c.siren, vat: c.vat_number, line1: c.billing_line1, line2: c.billing_line2, postal: c.billing_postal_code, city: c.billing_city, email: c.email })}</ram:BuyerTradeParty>` +
    (s.invoice.quoteNumber
      ? `<ram:ContractReferencedDocument><ram:IssuerAssignedID>${esc(s.invoice.quoteNumber)}</ram:IssuerAssignedID></ram:ContractReferencedDocument>`
      : "") +
    `</ram:ApplicableHeaderTradeAgreement>` +
    `<ram:ApplicableHeaderTradeDelivery><ram:ShipToTradeParty><ram:PostalTradeAddress><ram:PostcodeCode>${esc(s.quote.site.postalCode)}</ram:PostcodeCode><ram:LineOne>${esc(
      s.quote.site.line1,
    )}</ram:LineOne><ram:CityName>${esc(s.quote.site.city)}</ram:CityName><ram:CountryID>FR</ram:CountryID></ram:PostalTradeAddress></ram:ShipToTradeParty></ram:ApplicableHeaderTradeDelivery>` +
    `<ram:ApplicableHeaderTradeSettlement><ram:InvoiceCurrencyCode>EUR</ram:InvoiceCurrencyCode>` +
    (iban
      ? `<ram:SpecifiedTradeSettlementPaymentMeans><ram:TypeCode>58</ram:TypeCode><ram:PayeePartyCreditorFinancialAccount><ram:IBANID>${esc(iban)}</ram:IBANID></ram:PayeePartyCreditorFinancialAccount></ram:SpecifiedTradeSettlementPaymentMeans>`
      : "") +
    taxes +
    allowances +
    (s.invoice.creditedNumber
      ? `<ram:InvoiceReferencedDocument><ram:IssuerAssignedID>${esc(s.invoice.creditedNumber)}</ram:IssuerAssignedID></ram:InvoiceReferencedDocument>`
      : "") +
    (s.invoice.kind !== "credit_note"
      ? `<ram:SpecifiedTradePaymentTerms>${s.invoice.paymentTerms ? `<ram:Description>${esc(s.invoice.paymentTerms)}</ram:Description>` : ""}<ram:DueDateDateTime><udt:DateTimeString format="102">${ymd(
          s.invoice.dueDate,
        )}</udt:DateTimeString></ram:DueDateDateTime></ram:SpecifiedTradePaymentTerms>`
      : "") +
    `<ram:SpecifiedTradeSettlementHeaderMonetarySummation>` +
    `<ram:LineTotalAmount>${amount(d.lineTotal)}</ram:LineTotalAmount>` +
    (d.allowanceTotal ? `<ram:AllowanceTotalAmount>${amount(d.allowanceTotal)}</ram:AllowanceTotalAmount>` : "") +
    `<ram:TaxBasisTotalAmount>${amount(d.taxBasis)}</ram:TaxBasisTotalAmount>` +
    `<ram:TaxTotalAmount currencyID="EUR">${amount(d.taxTotal)}</ram:TaxTotalAmount>` +
    `<ram:GrandTotalAmount>${amount(d.grandTotal)}</ram:GrandTotalAmount>` +
    (d.prepaid ? `<ram:TotalPrepaidAmount>${amount(d.prepaid)}</ram:TotalPrepaidAmount>` : "") +
    `<ram:DuePayableAmount>${amount(d.due)}</ram:DuePayableAmount>` +
    `</ram:SpecifiedTradeSettlementHeaderMonetarySummation></ram:ApplicableHeaderTradeSettlement>` +
    `</rsm:SupplyChainTradeTransaction></rsm:CrossIndustryInvoice>\n`
  );
}

/* ------------------------------------------------------------------ */
/* UBL 2.1                                                              */
/* ------------------------------------------------------------------ */

export function buildUbl(s: InvoiceSnapshot): string {
  const d = invoiceData(s);
  const credit = s.invoice.kind === "credit_note";
  const root = credit ? "CreditNote" : "Invoice";
  const o = s.org;
  const c = s.customer;
  const cur = (cents: number) => `currencyID="EUR">${amount(cents)}`;
  const party = (p: { name: string; siren: string; vat: string; line1: string; line2: string; postal: string; city: string; email?: string }) =>
    `<cac:Party>` +
    (p.email ? `<cbc:EndpointID schemeID="EM">${esc(p.email)}</cbc:EndpointID>` : "") +
    `<cac:PostalAddress><cbc:StreetName>${esc(p.line1)}</cbc:StreetName>${p.line2 ? `<cbc:AdditionalStreetName>${esc(p.line2)}</cbc:AdditionalStreetName>` : ""}<cbc:CityName>${esc(
      p.city,
    )}</cbc:CityName><cbc:PostalZone>${esc(p.postal)}</cbc:PostalZone><cac:Country><cbc:IdentificationCode>FR</cbc:IdentificationCode></cac:Country></cac:PostalAddress>` +
    (p.vat
      ? `<cac:PartyTaxScheme><cbc:CompanyID>${esc(p.vat)}</cbc:CompanyID><cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:PartyTaxScheme>`
      : "") +
    `<cac:PartyLegalEntity><cbc:RegistrationName>${esc(p.name)}</cbc:RegistrationName>${siren(p.siren) ? `<cbc:CompanyID schemeID="0002">${siren(p.siren)}</cbc:CompanyID>` : ""}</cac:PartyLegalEntity>` +
    `</cac:Party>`;
  const category = (bp: number, cat: VatCategory, tag = "ClassifiedTaxCategory") => {
    const ex = EXEMPTION[cat];
    return (
      `<cac:${tag}><cbc:ID>${cat}</cbc:ID><cbc:Percent>${decimal(bp, 2)}</cbc:Percent>` +
      (ex && tag === "TaxCategory"
        ? `<cbc:TaxExemptionReasonCode>${ex.code}</cbc:TaxExemptionReasonCode><cbc:TaxExemptionReason>${esc(ex.reason)}</cbc:TaxExemptionReason>`
        : "") +
      `<cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:${tag}>`
    );
  };
  const iban = s.invoice.bank.iban.replace(/\s/g, "");
  const lineTag = credit ? "CreditNoteLine" : "InvoiceLine";
  const qtyTag = credit ? "CreditedQuantity" : "InvoicedQuantity";
  return (
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<${root} xmlns="urn:oasis:names:specification:ubl:schema:xsd:${root}-2" xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2" xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">` +
    `<cbc:CustomizationID>urn:cen.eu:en16931:2017</cbc:CustomizationID>` +
    `<cbc:ID>${esc(s.invoice.number)}</cbc:ID><cbc:IssueDate>${s.invoice.issueDate}</cbc:IssueDate>` +
    (!credit ? `<cbc:DueDate>${s.invoice.dueDate}</cbc:DueDate>` : "") +
    `<cbc:${root}TypeCode>${documentType(s.invoice.kind)}</cbc:${root}TypeCode>` +
    d.notes.map((n) => `<cbc:Note>${esc(n)}</cbc:Note>`).join("") +
    `<cbc:DocumentCurrencyCode>EUR</cbc:DocumentCurrencyCode>` +
    (s.invoice.creditedNumber
      ? `<cac:BillingReference><cac:InvoiceDocumentReference><cbc:ID>${esc(s.invoice.creditedNumber)}</cbc:ID></cac:InvoiceDocumentReference></cac:BillingReference>`
      : "") +
    (s.invoice.quoteNumber ? `<cac:ContractDocumentReference><cbc:ID>${esc(s.invoice.quoteNumber)}</cbc:ID></cac:ContractDocumentReference>` : "") +
    `<cac:AccountingSupplierParty>${party({ name: o.legal_name || o.trade_name, siren: o.siren, vat: o.vat_number, line1: o.address_line1, line2: o.address_line2, postal: o.postal_code, city: o.city, email: o.email })}</cac:AccountingSupplierParty>` +
    `<cac:AccountingCustomerParty>${party({ name: c.name, siren: c.siren, vat: c.vat_number, line1: c.billing_line1, line2: c.billing_line2, postal: c.billing_postal_code, city: c.billing_city, email: c.email })}</cac:AccountingCustomerParty>` +
    `<cac:Delivery><cac:DeliveryLocation><cac:Address><cbc:StreetName>${esc(s.quote.site.line1)}</cbc:StreetName><cbc:CityName>${esc(s.quote.site.city)}</cbc:CityName><cbc:PostalZone>${esc(
      s.quote.site.postalCode,
    )}</cbc:PostalZone><cac:Country><cbc:IdentificationCode>FR</cbc:IdentificationCode></cac:Country></cac:Address></cac:DeliveryLocation></cac:Delivery>` +
    (iban && !credit
      ? `<cac:PaymentMeans><cbc:PaymentMeansCode>58</cbc:PaymentMeansCode><cac:PayeeFinancialAccount><cbc:ID>${esc(iban)}</cbc:ID></cac:PayeeFinancialAccount></cac:PaymentMeans>`
      : "") +
    (s.invoice.paymentTerms && !credit ? `<cac:PaymentTerms><cbc:Note>${esc(s.invoice.paymentTerms)}</cbc:Note></cac:PaymentTerms>` : "") +
    d.groups
      .filter((g) => g.allowanceCents)
      .map(
        (g) =>
          `<cac:AllowanceCharge><cbc:ChargeIndicator>false</cbc:ChargeIndicator><cbc:AllowanceChargeReason>Remise globale</cbc:AllowanceChargeReason><cbc:Amount ${cur(g.allowanceCents)}</cbc:Amount>${category(
            g.vatBp,
            g.category,
            "TaxCategory",
          ).replace(/<cbc:TaxExemption[^]*?<cac:TaxScheme>/, "<cac:TaxScheme>")}</cac:AllowanceCharge>`,
      )
      .join("") +
    `<cac:TaxTotal><cbc:TaxAmount ${cur(d.taxTotal)}</cbc:TaxAmount>` +
    d.groups
      .map(
        (g) =>
          `<cac:TaxSubtotal><cbc:TaxableAmount ${cur(g.baseCents)}</cbc:TaxableAmount><cbc:TaxAmount ${cur(g.vatCents)}</cbc:TaxAmount>${category(g.vatBp, g.category, "TaxCategory")}</cac:TaxSubtotal>`,
      )
      .join("") +
    `</cac:TaxTotal>` +
    `<cac:LegalMonetaryTotal><cbc:LineExtensionAmount ${cur(d.lineTotal)}</cbc:LineExtensionAmount><cbc:TaxExclusiveAmount ${cur(d.taxBasis)}</cbc:TaxExclusiveAmount>` +
    `<cbc:TaxInclusiveAmount ${cur(d.grandTotal)}</cbc:TaxInclusiveAmount>` +
    (d.allowanceTotal ? `<cbc:AllowanceTotalAmount ${cur(d.allowanceTotal)}</cbc:AllowanceTotalAmount>` : "") +
    (d.prepaid ? `<cbc:PrepaidAmount ${cur(d.prepaid)}</cbc:PrepaidAmount>` : "") +
    `<cbc:PayableAmount ${cur(d.due)}</cbc:PayableAmount></cac:LegalMonetaryTotal>` +
    d.lines
      .map(
        (l) =>
          `<cac:${lineTag}><cbc:ID>${l.id}</cbc:ID><cbc:${qtyTag} unitCode="${l.unit}">${l.quantity}</cbc:${qtyTag}><cbc:LineExtensionAmount ${cur(l.netCents)}</cbc:LineExtensionAmount>` +
          (l.discountCents
            ? `<cac:AllowanceCharge><cbc:ChargeIndicator>false</cbc:ChargeIndicator><cbc:AllowanceChargeReason>Remise</cbc:AllowanceChargeReason><cbc:Amount ${cur(l.discountCents)}</cbc:Amount></cac:AllowanceCharge>`
            : "") +
          `<cac:Item>${l.description ? `<cbc:Description>${esc(l.description)}</cbc:Description>` : ""}<cbc:Name>${esc(l.name)}</cbc:Name>${category(l.vatBp, vatCategory(l.vatBp, d.ctx))}</cac:Item>` +
          `<cac:Price><cbc:PriceAmount currencyID="EUR">${l.priceUnit}</cbc:PriceAmount></cac:Price></cac:${lineTag}>`,
      )
      .join("") +
    `</${root}>\n`
  );
}

/* ------------------------------------------------------------------ */
/* PDF avec XML joint (Factur-X)                                       */
/* ------------------------------------------------------------------ */

/**
 * Copie du PDF de la facture avec le XML CII joint sous le nom factur-x.xml et
 * les métadonnées Factur-X. Le PDF archivé n'est pas modifié.
 */
export async function facturXPdf(pdf: Uint8Array, s: InvoiceSnapshot): Promise<Uint8Array> {
  const doc = await PDFDocument.load(pdf, { updateMetadata: false });
  const xml = new TextEncoder().encode(buildCii(s));
  const when = new Date(s.issuedAt);
  await doc.attach(xml, "factur-x.xml", {
    mimeType: "text/xml",
    description: "Factur-X",
    creationDate: when,
    modificationDate: when,
    afRelationship: AFRelationship.Data,
  });
  const title = `${s.invoice.kind === "credit_note" ? "Avoir" : "Facture"} ${s.invoice.number}`;
  doc.setTitle(title);
  doc.setProducer("Pilot-Makers");
  doc.setCreationDate(when);
  doc.setModificationDate(when);
  const xmp =
    `<?xpacket begin="﻿" id="W5M0MpCehiHzreSzNTczkc9d"?>` +
    `<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">` +
    `<rdf:Description rdf:about="" xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title><rdf:Alt><rdf:li xml:lang="x-default">${esc(title)}</rdf:li></rdf:Alt></dc:title></rdf:Description>` +
    `<rdf:Description rdf:about="" xmlns:fx="urn:factur-x:pdfa:CrossIndustryDocument:invoice:1p0#"><fx:DocumentType>INVOICE</fx:DocumentType><fx:DocumentFileName>factur-x.xml</fx:DocumentFileName><fx:Version>1.0</fx:Version><fx:ConformanceLevel>EN 16931</fx:ConformanceLevel></rdf:Description>` +
    `</rdf:RDF></x:xmpmeta><?xpacket end="w"?>`;
  const stream = doc.context.stream(xmp, { Type: "Metadata", Subtype: "XML" });
  doc.catalog.set(PDFName.of("Metadata"), doc.context.register(stream));
  doc.catalog.set(PDFName.of("Lang"), PDFString.of("fr-FR"));
  return doc.save({ useObjectStreams: false });
}

export const EINVOICE_FORMATS = ["facturx", "cii", "ubl"] as const;
export type EinvoiceFormat = (typeof EINVOICE_FORMATS)[number];

/** Fichier structuré d'une facture émise : PDF Factur-X, XML CII ou XML UBL. */
export async function einvoiceFile(ctx: Ctx, id: string, format: string) {
  if (!(EINVOICE_FORMATS as readonly string[]).includes(format)) throw badRequest("Format inconnu");
  await requireFeature(ctx, "factures_structurees");
  const inv = await getInvoice(ctx, id);
  const s = inv.snapshot;
  if (!invoiceData(s).consistent) throw badRequest("Les totaux de cette facture ne se retrouvent pas ligne à ligne : export structuré impossible");
  const base = inv.number.replace(/[^\w.-]+/g, "_");
  if (format === "facturx") {
    const r = await getInvoicePdf(ctx, id);
    return { filename: `${base}-facturx.pdf`, contentType: "application/pdf", body: await facturXPdf(r.pdf, s) };
  }
  const xml = format === "cii" ? buildCii(s) : buildUbl(s);
  return { filename: `${base}-${format}.xml`, contentType: "application/xml; charset=utf-8", body: new TextEncoder().encode(xml) };
}
