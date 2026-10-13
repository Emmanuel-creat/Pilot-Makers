/**
 * Procès-verbal de réception des travaux (article 1792-6 du Code civil) et procès-verbal de levée des réserves.
 * Le PDF ne lit que la photographie figée au moment de la signature.
 */

import { PDFDocument, PDFFont, PDFImage, PDFPage, StandardFonts, rgb } from "pdf-lib";
import { sanitize, wrapText } from "./quote-pdf";

export type ReceptionDecision = "sans_reserve" | "avec_reserves" | "refus";

export interface ReceptionSnapshot {
  date: string;
  place: string;
  decision: ReceptionDecision;
  refusalReason: string;
  job: { title: string; address: string };
  quoteNumber: string | null;
  org: { name: string; address: string; siret: string };
  customer: { name: string; address: string };
  reserves: { label: string; location: string; dueDate: string | null }[];
  client: { name: string; signature: string };
  company: { name: string; signature: string };
  signedAt: string;
}

export interface LiftedReserve {
  label: string;
  location: string;
  liftedAt: string;
  note: string;
}

const A4 = { w: 595.28, h: 841.89 };
const LEFT = 48;
const WIDTH = A4.w - 2 * LEFT;
const GREY = rgb(0.38, 0.4, 0.44);
const BLACK = rgb(0.1, 0.11, 0.13);
const LINE = rgb(0.8, 0.82, 0.85);

export const fr = (iso: string) => {
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
};

class Page {
  page!: PDFPage;
  y = 0;
  constructor(
    private doc: PDFDocument,
    public regular: PDFFont,
    public bold: PDFFont,
  ) {
    this.add();
  }
  add() {
    this.page = this.doc.addPage([A4.w, A4.h]);
    this.y = A4.h - 52;
  }
  ensure(h: number) {
    if (this.y - h < 60) this.add();
  }
  line(text: string, size = 10, font = this.regular, color = BLACK, x = LEFT, width = WIDTH) {
    for (const l of wrapText(text, font, size, width)) {
      this.ensure(size * 1.4);
      this.y -= size * 1.4;
      if (l) this.page.drawText(l, { x, y: this.y, size, font, color });
    }
  }
  gap(h = 8) {
    this.y -= h;
  }
  rule() {
    this.ensure(10);
    this.y -= 6;
    this.page.drawLine({ start: { x: LEFT, y: this.y }, end: { x: A4.w - LEFT, y: this.y }, thickness: 0.6, color: LINE });
    this.y -= 4;
  }
  title(text: string, sub?: string) {
    this.line(text, 15, this.bold);
    if (sub) this.line(sub, 9, this.regular, GREY);
    this.gap(6);
  }
  heading(text: string) {
    this.gap(6);
    this.line(text, 11, this.bold);
    this.gap(2);
  }
  field(label: string, value: string) {
    const lw = 130;
    const lines = wrapText(value || "-", this.regular, 10, WIDTH - lw);
    this.ensure(lines.length * 14);
    this.y -= 14;
    this.page.drawText(sanitize(label, this.regular), { x: LEFT, y: this.y, size: 10, font: this.regular, color: GREY });
    lines.forEach((l, i) => {
      if (i) this.y -= 14;
      this.page.drawText(l, { x: LEFT + lw, y: this.y, size: 10, font: this.regular, color: BLACK });
    });
  }
}

async function signatureImage(doc: PDFDocument, dataUrl: string): Promise<PDFImage | null> {
  const m = /^data:image\/png;base64,(.+)$/.exec(dataUrl);
  if (!m) return null;
  try {
    return await doc.embedPng(Buffer.from(m[1], "base64"));
  } catch {
    return null;
  }
}

async function signatures(doc: PDFDocument, p: Page, s: ReceptionSnapshot) {
  p.ensure(150);
  p.gap(10);
  p.line(`Fait à ${s.place || "-"}, le ${fr(s.date)}, en deux exemplaires.`, 10);
  p.gap(10);
  const top = p.y;
  const colW = (WIDTH - 20) / 2;
  const blocks = [
    { x: LEFT, title: "Le maître d'ouvrage", name: s.client.name, sig: s.client.signature },
    { x: LEFT + colW + 20, title: "L'entreprise", name: s.company.name, sig: s.company.signature },
  ];
  for (const b of blocks) {
    p.page.drawText(sanitize(b.title, p.bold), { x: b.x, y: top - 12, size: 10, font: p.bold, color: BLACK });
    p.page.drawText(sanitize(b.name, p.regular), { x: b.x, y: top - 26, size: 10, font: p.regular, color: BLACK });
    p.page.drawRectangle({ x: b.x, y: top - 116, width: colW, height: 82, borderColor: LINE, borderWidth: 0.8 });
    const img = b.sig ? await signatureImage(doc, b.sig) : null;
    if (img) {
      const scale = Math.min((colW - 12) / img.width, 70 / img.height, 1);
      p.page.drawImage(img, { x: b.x + 6, y: top - 110, width: img.width * scale, height: img.height * scale });
    }
  }
  p.y = top - 124;
  p.line(`Signé sur l'écran de l'entreprise le ${fr(s.signedAt)} à ${s.signedAt.slice(11, 16)} (heure UTC).`, 8, p.regular, GREY);
}

function header(p: Page, s: ReceptionSnapshot) {
  p.heading("Parties");
  p.field("Entreprise", `${s.org.name}, ${s.org.address}${s.org.siret ? `, SIRET ${s.org.siret}` : ""}`);
  p.field("Maître d'ouvrage", `${s.customer.name}${s.customer.address ? `, ${s.customer.address}` : ""}`);
  p.heading("Travaux");
  p.field("Chantier", s.job.title);
  p.field("Adresse", s.job.address);
  if (s.quoteNumber) p.field("Marché", `Devis n° ${s.quoteNumber}`);
}

export async function renderReceptionPdf(s: ReceptionSnapshot): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(`Procès-verbal de réception : ${s.job.title}`);
  doc.setProducer("Pilot-Makers");
  doc.setCreationDate(new Date(s.signedAt));
  doc.setModificationDate(new Date(s.signedAt));
  const p = new Page(doc, await doc.embedFont(StandardFonts.Helvetica), await doc.embedFont(StandardFonts.HelveticaBold));
  p.title("PROCÈS-VERBAL DE RÉCEPTION DES TRAVAUX", "Article 1792-6 du Code civil");
  header(p, s);
  p.heading("Décision du maître d'ouvrage");
  p.field("Date de réception", fr(s.date));
  if (s.decision === "refus") {
    p.line("Après visite des travaux en présence de l'entreprise, le maître d'ouvrage REFUSE la réception pour le motif suivant :", 10);
    p.line(s.refusalReason || "-", 10, p.bold);
  } else if (s.decision === "sans_reserve") {
    p.line("Après visite des travaux en présence de l'entreprise, le maître d'ouvrage déclare ACCEPTER la réception SANS RÉSERVE.", 10);
  } else {
    p.line(
      `Après visite des travaux en présence de l'entreprise, le maître d'ouvrage déclare ACCEPTER la réception AVEC ${s.reserves.length} RÉSERVE${s.reserves.length > 1 ? "S" : ""}, que l'entreprise s'engage à lever dans les délais indiqués :`,
      10,
    );
    p.gap(4);
    s.reserves.forEach((r, i) => {
      p.rule();
      p.line(`${i + 1}. ${r.label}`, 10, p.bold);
      const meta = [r.location ? `Localisation : ${r.location}` : "", r.dueDate ? `À lever avant le ${fr(r.dueDate)}` : ""]
        .filter(Boolean)
        .join("    ");
      if (meta) p.line(meta, 9, p.regular, GREY);
    });
    p.rule();
  }
  if (s.decision !== "refus") {
    p.gap(4);
    p.line(
      "La réception fait courir la garantie de parfait achèvement (un an), la garantie biennale de bon fonctionnement des éléments d'équipement (deux ans) et la garantie décennale (dix ans). Elle rend exigible le solde du marché, sous réserve de la retenue de garantie éventuellement prévue.",
      9,
      p.regular,
      GREY,
    );
  }
  await signatures(doc, p, s);
  return doc.save();
}

export async function renderLiftingPdf(s: ReceptionSnapshot, reserves: LiftedReserve[], liftedOn: string): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(`Levée des réserves : ${s.job.title}`);
  doc.setProducer("Pilot-Makers");
  const p = new Page(doc, await doc.embedFont(StandardFonts.Helvetica), await doc.embedFont(StandardFonts.HelveticaBold));
  p.title("PROCÈS-VERBAL DE LEVÉE DES RÉSERVES", `Suite à la réception du ${fr(s.date)}`);
  header(p, s);
  p.heading("Réserves levées");
  reserves.forEach((r, i) => {
    p.rule();
    p.line(`${i + 1}. ${r.label}`, 10, p.bold);
    p.line([r.location ? `Localisation : ${r.location}` : "", `Levée le ${fr(r.liftedAt)}`, r.note].filter(Boolean).join("    "), 9, p.regular, GREY);
  });
  p.rule();
  p.gap(6);
  p.line(`Toutes les réserves émises lors de la réception sont levées au ${fr(liftedOn)}.`, 10, p.bold);
  p.gap(20);
  p.line("Le maître d'ouvrage", 10, p.bold);
  p.line(s.client.name, 10);
  p.gap(50);
  p.line("L'entreprise", 10, p.bold);
  p.line(s.company.name, 10);
  return doc.save();
}
