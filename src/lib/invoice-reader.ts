/**
 * Lecture automatique des factures d'achat reçues au format électronique.
 *
 * Les fournisseurs passent progressivement à la facture électronique : un PDF Factur-X (ou ZUGFeRD)
 * contient le XML de la facture, un fichier XML seul peut être au format CII ou UBL. Les données
 * utiles (numéro, fournisseur, dates, montants HT, TVA et TTC) y sont lues sans risque d'erreur de
 * saisie. Une simple photo ou un PDF sans XML joint n'est pas lu : les montants restent à saisir.
 */

import {
  decodePDFRawStream,
  PDFArray,
  PDFDict,
  PDFDocument,
  PDFName,
  PDFRawStream,
  PDFStream,
} from "pdf-lib";

export interface PurchaseInvoiceData {
  format: "cii" | "ubl";
  number: string;
  supplier: string;
  supplierVat: string;
  /** AAAA-MM-JJ */
  issueDate: string;
  dueDate: string;
  netCents: number | null;
  vatCents: number | null;
  totalCents: number | null;
  currency: string;
}

const MAX_XML = 5_000_000;

const decodeEntities = (s: string) =>
  s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) =>
      String.fromCodePoint(parseInt(n, 16)),
    )
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&")
    .trim();

/** Contenu de la première balise de ce nom (préfixe d'espace de noms quelconque), dans le fragment donné. */
function tag(xml: string, name: string): string {
  const m = new RegExp(
    `<(?:[\\w.-]+:)?${name}(?:\\s[^>]*)?>([\\s\\S]*?)</(?:[\\w.-]+:)?${name}>`,
  ).exec(xml);
  return m ? m[1] : "";
}

const text = (xml: string, ...path: string[]) =>
  decodeEntities(
    path.reduce((frag, n) => tag(frag, n), xml).replace(/<[^>]+>/g, ""),
  );

/** Montant décimal (point ou virgule) en centimes ; null s'il est absent ou illisible. */
export function amountCents(s: string): number | null {
  const t = s.replace(/\s/g, "").replace(",", ".");
  if (!/^-?\d+(\.\d+)?$/.test(t)) return null;
  return Math.round(Number(t) * 100);
}

/** Date CII format 102 (AAAAMMJJ) ou date ISO, rendue en AAAA-MM-JJ. */
export function isoDate(s: string): string {
  const t = s.trim();
  let m = /^(\d{4})(\d{2})(\d{2})$/.exec(t);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = /^(\d{4})-(\d{2})-(\d{2})/.exec(t);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : "";
}

/** Facture au format CII (Factur-X, ZUGFeRD, XRechnung CII). */
export function parseCii(xml: string): PurchaseInvoiceData | null {
  if (!/CrossIndustryInvoice/.test(xml.slice(0, 2000))) return null;
  const doc = tag(xml, "ExchangedDocument");
  const seller = tag(xml, "SellerTradeParty");
  const settlement = tag(xml, "ApplicableHeaderTradeSettlement");
  const sums = tag(
    settlement,
    "SpecifiedTradeSettlementHeaderMonetarySummation",
  );
  return {
    format: "cii",
    number: text(doc, "ID"),
    supplier: text(seller, "Name"),
    supplierVat: text(tag(seller, "SpecifiedTaxRegistration"), "ID"),
    issueDate: isoDate(text(doc, "IssueDateTime", "DateTimeString")),
    dueDate: isoDate(
      text(
        settlement,
        "SpecifiedTradePaymentTerms",
        "DueDateDateTime",
        "DateTimeString",
      ),
    ),
    netCents: amountCents(text(sums, "TaxBasisTotalAmount")),
    vatCents: amountCents(text(sums, "TaxTotalAmount")),
    totalCents: amountCents(text(sums, "GrandTotalAmount")),
    currency: text(settlement, "InvoiceCurrencyCode") || "EUR",
  };
}

/** Facture ou avoir au format UBL 2.1 (Peppol BIS, XRechnung UBL). */
export function parseUbl(xml: string): PurchaseInvoiceData | null {
  const root = /<(?:[\w.-]+:)?(Invoice|CreditNote)[\s>]/.exec(
    xml.slice(0, 3000),
  );
  if (!root) return null;
  const supplier = tag(xml, "AccountingSupplierParty");
  const totals = tag(xml, "LegalMonetaryTotal");
  const name =
    text(supplier, "PartyLegalEntity", "RegistrationName") ||
    text(supplier, "PartyName", "Name");
  // Le premier cbc:ID du document est son numéro (il précède tous les blocs cac).
  const head = xml.slice(
    0,
    xml.search(
      /<(?:[\w.-]+:)?(AccountingSupplierParty|InvoicePeriod|OrderReference|BillingReference)[\s>]/,
    ) >>> 0,
  );
  const number = decodeEntities(
    /<cbc:ID(?:\s[^>]*)?>([^<]*)<\/cbc:ID>/.exec(head)?.[1] ?? text(xml, "ID"),
  );
  return {
    format: "ubl",
    number,
    supplier: name,
    supplierVat: text(tag(supplier, "PartyTaxScheme"), "CompanyID"),
    issueDate: isoDate(text(head, "IssueDate") || text(xml, "IssueDate")),
    dueDate: isoDate(
      text(xml, "DueDate") || text(tag(xml, "PaymentMeans"), "PaymentDueDate"),
    ),
    netCents: amountCents(text(totals, "TaxExclusiveAmount")),
    vatCents: amountCents(text(tag(xml, "TaxTotal"), "TaxAmount")),
    totalCents: amountCents(text(totals, "TaxInclusiveAmount")),
    currency: text(xml, "DocumentCurrencyCode") || "EUR",
  };
}

export function parseInvoiceXml(xml: string): PurchaseInvoiceData | null {
  const data = parseCii(xml) ?? parseUbl(xml);
  if (!data) return null;
  // Un XML sans aucun montant ni numéro n'est pas une facture exploitable.
  if (!data.number && data.totalCents === null) return null;
  return data;
}

const XML_NAMES = /^(factur-x|zugferd-invoice|xrechnung|order-x)\.xml$/i;

function streamBytes(s: PDFStream): Uint8Array {
  return s instanceof PDFRawStream
    ? decodePDFRawStream(s).decode()
    : s.getContents();
}

/** XML de facture joint à un PDF (Factur-X, ZUGFeRD), ou null. */
export async function embeddedInvoiceXml(
  pdf: Uint8Array,
): Promise<string | null> {
  let doc: PDFDocument;
  try {
    doc = await PDFDocument.load(pdf, {
      updateMetadata: false,
      ignoreEncryption: true,
      throwOnInvalidObject: false,
    });
  } catch {
    return null;
  }
  try {
    return findInvoiceXml(doc);
  } catch {
    // PDF abîmé (catalogue absent, objets illisibles) : pas de données structurées.
    return null;
  }
}

function findInvoiceXml(doc: PDFDocument): string | null {
  const specs: PDFDict[] = [];
  const names = doc.catalog.lookupMaybe(PDFName.of("Names"), PDFDict);
  const tree = names?.lookupMaybe(PDFName.of("EmbeddedFiles"), PDFDict);
  const walk = (node: PDFDict | undefined, depth: number) => {
    if (!node || depth > 8) return;
    const list = node.lookupMaybe(PDFName.of("Names"), PDFArray);
    if (list)
      for (let i = 1; i < list.size(); i += 2) {
        const spec = list.lookup(i);
        if (spec instanceof PDFDict) specs.push(spec);
      }
    const kids = node.lookupMaybe(PDFName.of("Kids"), PDFArray);
    if (kids)
      for (let i = 0; i < kids.size(); i++) {
        const kid = kids.lookup(i);
        if (kid instanceof PDFDict) walk(kid, depth + 1);
      }
  };
  walk(tree, 0);
  // Fichiers associés déclarés au niveau du document (PDF/A-3), au cas où l'arbre des noms manque.
  const af = doc.catalog.lookupMaybe(PDFName.of("AF"), PDFArray);
  if (af)
    for (let i = 0; i < af.size(); i++) {
      const spec = af.lookup(i);
      if (spec instanceof PDFDict && !specs.includes(spec)) specs.push(spec);
    }
  const fileName = (spec: PDFDict) => {
    const v = spec.lookup(PDFName.of("UF")) ?? spec.lookup(PDFName.of("F"));
    const raw =
      v && "decodeText" in v
        ? (v as { decodeText(): string }).decodeText()
        : "";
    return raw.trim();
  };
  specs.sort(
    (a, b) =>
      Number(XML_NAMES.test(fileName(b))) - Number(XML_NAMES.test(fileName(a))),
  );
  for (const spec of specs) {
    const ef = spec.lookupMaybe(PDFName.of("EF"), PDFDict);
    const stream = ef?.lookup(PDFName.of("UF")) ?? ef?.lookup(PDFName.of("F"));
    if (!(stream instanceof PDFStream)) continue;
    if (!XML_NAMES.test(fileName(spec)) && !/\.xml$/i.test(fileName(spec)))
      continue;
    try {
      const bytes = streamBytes(stream);
      if (bytes.length > MAX_XML) continue;
      return new TextDecoder().decode(bytes);
    } catch {
      // Flux illisible : fichier joint suivant.
    }
  }
  return null;
}

const isPdf = (b: Uint8Array) =>
  b.length > 4 &&
  b[0] === 0x25 &&
  b[1] === 0x50 &&
  b[2] === 0x44 &&
  b[3] === 0x46;

/** Lit une facture d'achat : PDF Factur-X ou XML CII ou UBL. Renvoie null si le fichier ne contient pas de données structurées. */
export async function readPurchaseInvoice(
  bytes: Uint8Array,
): Promise<PurchaseInvoiceData | null> {
  if (isPdf(bytes)) {
    const xml = await embeddedInvoiceXml(bytes);
    return xml ? parseInvoiceXml(xml) : null;
  }
  if (bytes.length > MAX_XML) return null;
  const head = new TextDecoder()
    .decode(bytes.subarray(0, 200))
    .replace(/^﻿/, "")
    .trimStart();
  if (!head.startsWith("<")) return null;
  return parseInvoiceXml(new TextDecoder().decode(bytes));
}
