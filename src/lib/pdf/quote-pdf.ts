/**
 * Génération du PDF d'un devis à partir de sa photographie figée.
 *
 * Le PDF ne lit que le snapshot : il ne peut donc pas diverger des données
 * enregistrées. Le coût interne et la marge n'y figurent jamais.
 */

import { PDFDocument, PDFFont, PDFImage, PDFPage, StandardFonts, degrees, rgb, type RGB } from "pdf-lib";
import { formatEuros, formatPercent, formatQuantity, formatUnitPrice } from "@/lib/calc/format";
import type { QuoteSnapshot } from "@/lib/services/quote-types";

const A4 = { w: 595.28, h: 841.89 };
const M = { left: 40, right: 40, top: 40, bottom: 56 };
const CONTENT_W = A4.w - M.left - M.right;

interface Fonts {
  regular: PDFFont;
  bold: PDFFont;
  italic: PDFFont;
}

function hexToRgb(hex: string): RGB {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex) ?? ["", "1f", "4e", "79"];
  return rgb(parseInt(m[1], 16) / 255, parseInt(m[2], 16) / 255, parseInt(m[3], 16) / 255);
}

const GREY = rgb(0.38, 0.4, 0.44);
const LIGHT = rgb(0.93, 0.94, 0.95);
const BLACK = rgb(0.1, 0.11, 0.13);

/** Remplace les caractères absents de l'encodage WinAnsi des polices standard. */
export function sanitize(text: string, font: PDFFont): string {
  const replaced = text
    .replace(/[\u2018\u2019\u02bc]/g, "'")
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/[\u2013\u2014\u2212]/g, "-")
    .replace(/\u2026/g, "...")
    .replace(/[\u00a0\u202f\u2009]/g, " ")
    .replace(/\t/g, "  ");
  let out = "";
  for (const ch of replaced) {
    try {
      font.encodeText(ch);
      out += ch;
    } catch {
      out += "?";
    }
  }
  return out;
}

export function wrapText(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const lines: string[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const paragraph = sanitize(raw, font);
    if (paragraph.trim() === "") {
      lines.push("");
      continue;
    }
    let current = "";
    for (const word of paragraph.split(/ +/)) {
      const candidate = current ? current + " " + word : word;
      if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
        current = candidate;
        continue;
      }
      if (current) lines.push(current);
      // Mot plus long que la largeur : découpe forcée.
      let w = word;
      while (font.widthOfTextAtSize(w, size) > maxWidth && w.length > 1) {
        let cut = w.length - 1;
        while (cut > 1 && font.widthOfTextAtSize(w.slice(0, cut), size) > maxWidth) cut--;
        lines.push(w.slice(0, cut));
        w = w.slice(cut);
      }
      current = w;
    }
    lines.push(current);
  }
  return lines;
}

class Writer {
  page!: PDFPage;
  y = 0;
  pages: PDFPage[] = [];
  constructor(
    public doc: PDFDocument,
    public f: Fonts,
    public onNewPage: (w: Writer) => void,
  ) {}
  newPage() {
    this.page = this.doc.addPage([A4.w, A4.h]);
    this.pages.push(this.page);
    this.y = A4.h - M.top;
    this.onNewPage(this);
  }
  ensure(height: number) {
    if (this.y - height < M.bottom) this.newPage();
  }
  text(t: string, x: number, y: number, size: number, font: PDFFont = this.f.regular, color: RGB = BLACK) {
    this.page.drawText(sanitize(t, font), { x, y, size, font, color });
  }
  textRight(t: string, xRight: number, y: number, size: number, font: PDFFont = this.f.regular, color: RGB = BLACK) {
    const s = sanitize(t, font);
    this.page.drawText(s, { x: xRight - font.widthOfTextAtSize(s, size), y, size, font, color });
  }
  paragraph(t: string, x: number, width: number, size: number, font: PDFFont = this.f.regular, color: RGB = BLACK, lead = 1.35) {
    for (const line of wrapText(t, font, size, width)) {
      this.ensure(size * lead);
      this.y -= size * lead;
      if (line) this.text(line, x, this.y, size, font, color);
    }
  }
}

async function embedImage(doc: PDFDocument, dataUrl: string | null): Promise<PDFImage | null> {
  if (!dataUrl) return null;
  const m = /^data:image\/(png|jpeg);base64,(.+)$/.exec(dataUrl);
  if (!m) return null;
  try {
    const bytes = Buffer.from(m[2], "base64");
    return m[1] === "png" ? await doc.embedPng(bytes) : await doc.embedJpg(bytes);
  } catch {
    return null;
  }
}

const fmtDate = (iso: string) => {
  const [y, mo, d] = iso.slice(0, 10).split("-");
  return `${d}/${mo}/${y}`;
};

export function legalFooter(s: QuoteSnapshot): string {
  const o = s.org;
  return [
    o.legal_name || o.trade_name,
    o.legal_form,
    o.share_capital ? `capital ${o.share_capital}` : "",
    o.siret ? `SIRET ${o.siret}` : o.siren ? `SIREN ${o.siren}` : "",
    o.rcs_rm,
    o.vat_number ? `TVA ${o.vat_number}` : "",
  ]
    .filter(Boolean)
    .join(" - ");
}

/** Montants affichés sur le PDF : servent aussi au contrôle de cohérence. */
export function pdfTotals(s: QuoteSnapshot) {
  const c = s.calc;
  return {
    totalHt: formatEuros(c.totalHtCents),
    totalVat: formatEuros(c.totalVatCents),
    totalTtc: formatEuros(c.totalTtcCents),
    vat: c.vatGroups.map((g) => ({ rate: formatPercent(g.vatBp), base: formatEuros(g.baseCents), amount: formatEuros(g.vatCents) })),
  };
}

export async function renderQuotePdf(s: QuoteSnapshot): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(`Devis ${s.number}`);
  doc.setAuthor(s.org.trade_name);
  doc.setSubject(`Devis ${s.number} version ${s.version}`);
  doc.setCreator("Pilot-Makers");
  doc.setProducer("Pilot-Makers");
  // Date fixe = date d'émission, pour que le même snapshot produise le même document.
  doc.setCreationDate(new Date(s.issuedAt));
  doc.setModificationDate(new Date(s.issuedAt));
  const f: Fonts = {
    regular: await doc.embedFont(StandardFonts.Helvetica),
    bold: await doc.embedFont(StandardFonts.HelveticaBold),
    italic: await doc.embedFont(StandardFonts.HelveticaOblique),
  };
  const accent = s.template === "sobre" ? BLACK : hexToRgb(s.accentColor);
  const logo = await embedImage(doc, s.org.logo_data);
  const signature = await embedImage(doc, s.org.signature_data);

  // Colonnes du tableau
  const cols = {
    label: M.left,
    qty: M.left + 268,
    unit: M.left + 312,
    pu: M.left + 392,
    disc: M.left + 428,
    vat: M.left + 462,
    total: A4.w - M.right,
  };

  const tableHeader = (w: Writer) => {
    const h = 18;
    w.ensure(h + 4);
    w.y -= h;
    if (s.template === "moderne") {
      w.page.drawRectangle({ x: M.left, y: w.y, width: CONTENT_W, height: h, color: accent });
    } else {
      w.page.drawRectangle({ x: M.left, y: w.y, width: CONTENT_W, height: h, color: LIGHT });
    }
    const c = s.template === "moderne" ? rgb(1, 1, 1) : BLACK;
    const ty = w.y + 6;
    w.text("Désignation", cols.label + 4, ty, 8, f.bold, c);
    w.textRight("Qté", cols.qty + 18, ty, 8, f.bold, c);
    w.text("Unité", cols.qty + 26, ty, 8, f.bold, c);
    w.textRight("PU HT", cols.pu, ty, 8, f.bold, c);
    w.textRight("Rem.", cols.disc, ty, 8, f.bold, c);
    w.textRight("TVA", cols.vat, ty, 8, f.bold, c);
    w.textRight("Total HT", cols.total - 4, ty, 8, f.bold, c);
    w.y -= 4;
  };

  let inTable = false;
  const w = new Writer(doc, f, (wr) => {
    if (wr.pages.length > 1) {
      wr.text(`Devis ${s.number} (suite)`, M.left, wr.y - 10, 9, f.bold, GREY);
      wr.y -= 22;
      if (inTable) tableHeader(wr);
    }
  });
  w.newPage();

  // En-tête
  if (s.template !== "sobre") {
    w.page.drawRectangle({ x: 0, y: A4.h - 8, width: A4.w, height: 8, color: accent });
  }
  let leftY = w.y;
  if (logo) {
    const scale = Math.min(140 / logo.width, 60 / logo.height, 1);
    const lw = logo.width * scale;
    const lh = logo.height * scale;
    w.page.drawImage(logo, { x: M.left, y: leftY - lh, width: lw, height: lh });
    leftY -= lh + 8;
  }
  const o = s.org;
  w.text(o.trade_name, M.left, leftY - 12, 13, f.bold, accent);
  leftY -= 16;
  const orgLines = [
    o.legal_name && o.legal_name !== o.trade_name ? o.legal_name : "",
    o.address_line1,
    o.address_line2,
    [o.postal_code, o.city].filter(Boolean).join(" "),
    o.phone ? `Tél. ${o.phone}` : "",
    o.email,
    o.website,
    o.siret ? `SIRET ${o.siret}` : o.siren ? `SIREN ${o.siren}` : "",
    o.vat_number ? `TVA intracommunautaire ${o.vat_number}` : "",
  ].filter(Boolean);
  for (const l of orgLines) {
    leftY -= 11;
    w.text(l, M.left, leftY, 8.5, f.regular, GREY);
  }

  // Bloc titre à droite
  let rightY = w.y;
  const rx = A4.w - M.right;
  w.textRight("DEVIS", rx, rightY - 20, 22, f.bold, accent);
  rightY -= 36;
  const meta = [
    `N° ${s.number}${s.version > 1 ? ` (version ${s.version})` : ""}`,
    `Date : ${fmtDate(s.issueDate)}`,
    `Valable jusqu'au : ${fmtDate(s.validUntil)}`,
    s.author ? `Établi par : ${s.author}` : "",
  ].filter(Boolean);
  for (const l of meta) {
    w.textRight(l, rx, rightY, 9, l.startsWith("N°") ? f.bold : f.regular);
    rightY -= 12;
  }

  // Client
  rightY -= 8;
  const boxX = M.left + CONTENT_W / 2 + 10;
  const boxW = CONTENT_W / 2 - 10;
  const cust = s.customer;
  const custLines = [
    cust.contact && cust.contact !== cust.name ? cust.contact : "",
    cust.billing_line1,
    cust.billing_line2,
    [cust.billing_postal_code, cust.billing_city].filter(Boolean).join(" "),
    cust.billing_country && cust.billing_country !== "France" ? cust.billing_country : "",
    cust.siren ? `SIREN ${cust.siren}` : "",
    cust.vat_number ? `TVA ${cust.vat_number}` : "",
  ].filter(Boolean);
  const boxH = 30 + custLines.length * 11;
  w.page.drawRectangle({ x: boxX, y: rightY - boxH, width: boxW, height: boxH, borderColor: LIGHT, borderWidth: 1 });
  w.text("CLIENT", boxX + 10, rightY - 13, 7.5, f.bold, GREY);
  w.text(cust.name, boxX + 10, rightY - 26, 10, f.bold);
  let cy = rightY - 26;
  for (const l of custLines) {
    cy -= 11;
    w.text(l, boxX + 10, cy, 8.5);
  }
  rightY -= boxH;

  w.y = Math.min(leftY, rightY) - 18;

  // Chantier et objet
  const site = s.quote.site;
  const siteText = [site.line1, site.line2, [site.postalCode, site.city].filter(Boolean).join(" ")].filter(Boolean).join(", ");
  w.ensure(40);
  w.text("Objet :", M.left, w.y - 10, 10, f.bold);
  w.text(s.quote.title, M.left + 42, w.y - 10, 10, f.bold, accent);
  w.y -= 14;
  w.text(`Lieu d'exécution : ${siteText}`, M.left, w.y - 10, 9, f.regular, GREY);
  w.y -= 14;
  const extra = [
    s.quote.estimatedStart ? `Démarrage estimé : ${s.quote.estimatedStart}` : "",
    s.quote.estimatedDuration ? `Durée estimée des travaux : ${s.quote.estimatedDuration}` : "",
  ].filter(Boolean);
  if (extra.length) {
    w.text(extra.join("   |   "), M.left, w.y - 10, 9, f.regular, GREY);
    w.y -= 14;
  }
  if (s.quote.description.trim()) {
    w.y -= 4;
    w.paragraph(s.quote.description, M.left, CONTENT_W, 9);
  }
  w.y -= 12;

  // Tableau
  inTable = true;
  tableHeader(w);
  const calcSections = new Map(s.calc.sections.map((cs) => [cs.id, cs]));
  const showSections = s.sections.length > 1 || (s.sections[0]?.title ?? "").trim() !== "";
  for (const section of s.sections) {
    const cs = calcSections.get(section.id);
    const lineResults = new Map((cs?.lines ?? []).map((l) => [l.id, l]));
    if (showSections) {
      w.ensure(40);
      w.y -= 16;
      w.text(section.title || "Section", cols.label + 4, w.y + 4, 9.5, f.bold, accent);
      if (section.description.trim()) {
        w.paragraph(section.description, cols.label + 4, CONTENT_W - 8, 8, f.italic, GREY);
      }
      w.y -= 2;
    }
    for (const line of section.lines) {
      const r = lineResults.get(line.id);
      const labelW = cols.qty - cols.label - 30;
      const labelLines = wrapText(line.label || "", f.bold, 8.5, labelW);
      const descLines = line.description.trim() ? wrapText(line.description, f.regular, 7.5, labelW) : [];
      const noteLines = line.kind === "item" && line.estimated ? wrapText("Quantité estimée, à confirmer sur place" + (line.estimateNote ? " : " + line.estimateNote : ""), f.italic, 7, labelW) : [];
      const h = labelLines.length * 10.5 + descLines.length * 9 + noteLines.length * 8.5 + 6;
      w.ensure(Math.min(h, 120));
      let ly = w.y;
      if (line.kind === "note") {
        for (const l of labelLines) {
          ly -= 10.5;
          w.text(l, cols.label + 4, ly, 8.5, f.italic, GREY);
        }
        for (const l of descLines) {
          ly -= 9;
          w.text(l, cols.label + 4, ly, 7.5, f.italic, GREY);
        }
        w.y = ly - 6;
        continue;
      }
      ly -= 10.5;
      // Les montants sont alignés sur la première ligne du libellé, avant tout saut de page.
      if (r && line.kind === "item") drawAmounts(ly, r, line.unit);
      if (line.kind === "pending") w.textRight("À compléter", cols.total - 4, ly, 8.5, f.italic, GREY);
      w.text(labelLines[0] ?? "", cols.label + 4, ly, 8.5, f.bold);
      const rest: [string, number, PDFFont, number, RGB][] = [
        ...labelLines.slice(1).map((l) => [l, 8.5, f.bold, 10.5, BLACK] as [string, number, PDFFont, number, RGB]),
        ...descLines.map((l) => [l, 7.5, f.regular, 9, GREY] as [string, number, PDFFont, number, RGB]),
        ...noteLines.map((l) => [l, 7, f.italic, 8.5, GREY] as [string, number, PDFFont, number, RGB]),
      ];
      for (const [t, size, font, lead, color] of rest) {
        if (ly - lead < M.bottom) {
          w.newPage();
          ly = w.y;
        }
        ly -= lead;
        w.text(t, cols.label + 4, ly, size, font, color);
      }
      w.y = ly - 6;
      w.page.drawLine({ start: { x: M.left, y: w.y + 2 }, end: { x: A4.w - M.right, y: w.y + 2 }, thickness: 0.4, color: LIGHT });
    }
    if (showSections && cs) {
      w.ensure(16);
      w.y -= 13;
      w.textRight(`Sous-total ${section.title || "section"} : ${formatEuros(cs.subtotalCents)} HT`, cols.total - 4, w.y, 8.5, f.bold, GREY);
      w.y -= 4;
    }
  }
  inTable = false;

  function drawAmounts(y: number, r: QuoteSnapshot["calc"]["sections"][number]["lines"][number], unit: string) {
    const draw = (t: string, xr: number, font = f.regular) => w.textRight(t, xr, y, 8.5, font);
    draw(formatQuantity(r.quantityMilli), cols.qty + 18);
    w.text(unit, cols.qty + 26, y, 8.5);
    draw(formatUnitPrice(r.unitPrice4, false), cols.pu);
    draw(r.discountBp ? formatPercent(r.discountBp, false) + "%" : "", cols.disc);
    draw(s.org.vat_regime === "franchise" ? "-" : formatPercent(r.vatBp, false) + "%", cols.vat);
    draw(formatEuros(r.netCents, false), cols.total - 4, f.bold);
  }

  // Totaux : bloc insécable
  const c = s.calc;
  const totalRows: [string, string, boolean][] = [];
  if (c.globalDiscountCents > 0) {
    totalRows.push(["Total HT avant remise", formatEuros(c.subtotalCents), false]);
    totalRows.push([`Remise globale (${formatPercent(c.globalDiscountBp)})`, "-" + formatEuros(c.globalDiscountCents), false]);
  }
  totalRows.push(["Total HT", formatEuros(c.totalHtCents), true]);
  if (s.org.vat_regime === "franchise") {
    totalRows.push(["TVA", "Non applicable", false]);
  } else {
    for (const g of c.vatGroups) {
      totalRows.push([`TVA ${formatPercent(g.vatBp)} sur ${formatEuros(g.baseCents)}`, formatEuros(g.vatCents), false]);
    }
  }
  const blockH = totalRows.length * 14 + 30;
  w.ensure(blockH + 10);
  w.y -= 10;
  const tx = M.left + CONTENT_W * 0.5;
  for (const [label, value, bold] of totalRows) {
    w.y -= 14;
    w.text(label, tx, w.y, 9, bold ? f.bold : f.regular);
    w.textRight(value, cols.total - 4, w.y, 9, bold ? f.bold : f.regular);
  }
  w.y -= 8;
  w.page.drawRectangle({ x: tx - 6, y: w.y - 18, width: cols.total - tx + 6, height: 22, color: s.template === "sobre" ? LIGHT : accent });
  const ttcColor = s.template === "sobre" ? BLACK : rgb(1, 1, 1);
  w.text("Total TTC", tx, w.y - 11, 11, f.bold, ttcColor);
  w.textRight(formatEuros(c.totalTtcCents), cols.total - 4, w.y - 11, 11, f.bold, ttcColor);
  w.y -= 26;

  // Conditions et mentions
  const section = (title: string, body: string, size = 8.5) => {
    if (!body.trim()) return;
    w.ensure(30);
    w.y -= 14;
    w.text(title, M.left, w.y, 9.5, f.bold, accent);
    w.y -= 2;
    w.paragraph(body, M.left, CONTENT_W, size);
  };
  section("Conditions de paiement", s.quote.paymentTerms);
  section("Conditions particulières", s.quote.specialConditions);
  section("Mentions", s.mentions.join("\n"));
  section("Conditions générales", s.org.general_conditions, 7.5);

  // Zone d'acceptation : jamais coupée
  w.ensure(110);
  w.y -= 16;
  const zoneH = 86;
  w.page.drawRectangle({ x: M.left, y: w.y - zoneH, width: CONTENT_W, height: zoneH, borderColor: GREY, borderWidth: 0.8 });
  w.text("Bon pour accord du client", M.left + 10, w.y - 14, 9.5, f.bold);
  w.text("Date, nom et signature précédés de la mention « Bon pour accord » :", M.left + 10, w.y - 27, 8, f.regular, GREY);
  w.text(`Pour ${s.org.trade_name}`, M.left + CONTENT_W / 2 + 10, w.y - 14, 9.5, f.bold);
  if (signature) {
    const scale = Math.min(150 / signature.width, 50 / signature.height, 1);
    w.page.drawImage(signature, {
      x: M.left + CONTENT_W / 2 + 10,
      y: w.y - zoneH + 8,
      width: signature.width * scale,
      height: signature.height * scale,
    });
  }
  w.y -= zoneH;

  // Pieds de page
  const footer = legalFooter(s);
  const total = w.pages.length;
  w.pages.forEach((p, i) => {
    const lines = wrapText(footer, f.regular, 7, CONTENT_W - 90);
    let fy = 34;
    for (const l of lines.slice(0, 2)) {
      p.drawText(l, { x: M.left, y: fy, size: 7, font: f.regular, color: GREY });
      fy -= 9;
    }
    const pageTxt = `Devis ${s.number} v${s.version} - page ${i + 1}/${total}`;
    p.drawText(sanitize(pageTxt, f.regular), {
      x: A4.w - M.right - f.regular.widthOfTextAtSize(pageTxt, 7),
      y: 34,
      size: 7,
      font: f.regular,
      color: GREY,
    });
    if (s.preview) {
      p.drawText("APERÇU - DOCUMENT NON ÉMIS", {
        x: 120,
        y: 300,
        size: 34,
        font: f.bold,
        color: rgb(0.85, 0.2, 0.2),
        opacity: 0.18,
        rotate: degrees(35),
      });
    }
    if (s.watermark) {
      p.drawText("Réalisé avec Pilot-Makers", { x: A4.w - M.right - 92, y: 22, size: 6.5, font: f.italic, color: GREY });
    }
  });

  return doc.save({ useObjectStreams: false });
}
