/**
 * Dossier des ouvrages exécutés : page de garde, ouvrages réalisés, matériaux et documents, réception
 * et réserves, garanties, conseils d'entretien et photos, suivis des documents eux-mêmes (procès-verbal
 * de réception, fiches techniques et notices des articles utilisés).
 */

import { PDFDocument, StandardFonts, type PDFImage } from "pdf-lib";
import { doeChecks, doeWarranties, quantityText, worksBySection, type DoeData } from "@/lib/doe";
import { A4, BLACK, fr, GREY, LEFT, LINE, Page, WIDTH } from "./reception-pdf";
import { sanitize } from "./quote-pdf";

export interface DoePhoto {
  bytes: Uint8Array;
  type: string;
  caption: string;
  date: string;
}

export interface DoeAttachment {
  title: string;
  bytes: Uint8Array;
}

const DECISIONS: Record<string, string> = { sans_reserve: "sans réserve", avec_reserves: "avec réserves", refus: "refusée" };

async function embed(doc: PDFDocument, p: DoePhoto): Promise<PDFImage | null> {
  try {
    if (p.type === "image/png") return await doc.embedPng(p.bytes);
    if (p.type === "image/jpeg") return await doc.embedJpg(p.bytes);
  } catch {
    // Photo illisible : on la passe.
  }
  return null;
}

export async function renderDoePdf(d: DoeData, photos: DoePhoto[], attachments: DoeAttachment[], today: string): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(`Dossier des ouvrages exécutés : ${d.job.title}`);
  doc.setProducer("Pilot-Makers");
  doc.setCreator("Pilot-Makers");
  const p = new Page(doc, await doc.embedFont(StandardFonts.Helvetica), await doc.embedFont(StandardFonts.HelveticaBold));
  const missing = doeChecks(d).filter((c) => !c.ok && c.key !== "notes");

  p.title("DOSSIER DES OUVRAGES EXÉCUTÉS", `${d.job.title}${d.job.quoteNumber ? `, devis ${d.job.quoteNumber}` : ""}. Édité le ${fr(today)}.`);
  if (!d.reception || d.reception.decision === "refus") p.line("Dossier provisoire : la réception des travaux n'est pas encore prononcée.", 10, p.bold);
  p.heading("Intervenants");
  p.field("Maître d'ouvrage", `${d.customer.name}${d.customer.address ? `, ${d.customer.address}` : ""}`);
  p.field("Entreprise", [d.org.name, d.org.address, d.org.siret ? `SIRET ${d.org.siret}` : ""].filter(Boolean).join(", "));
  p.field("Contact", [d.org.phone, d.org.email].filter(Boolean).join(", "));
  p.field(
    "Assurance décennale",
    d.org.decennale && d.org.insurer ? [d.org.insurer, d.org.policy ? `contrat ${d.org.policy}` : "", d.org.area].filter(Boolean).join(", ") : "Non renseignée",
  );
  p.heading("Chantier");
  p.field("Adresse", d.job.address);
  p.field("Début des travaux", d.job.startDate ? fr(d.job.startDate) : "-");
  p.field("Fin des travaux", d.job.endDate ? fr(d.job.endDate) : "-");
  p.field("Réception", d.reception ? `${DECISIONS[d.reception.decision] ?? d.reception.decision}, le ${fr(d.reception.date)}` : "Non prononcée");

  p.heading("Sommaire");
  const parts = [
    "1. Ouvrages exécutés",
    "2. Matériaux et documents techniques",
    "3. Réception et réserves",
    "4. Garanties",
    "5. Conseils d'entretien",
    "6. Photos du chantier",
    ...attachments.map((a, i) => `${7 + i}. ${a.title} (en annexe)`),
  ];
  for (const s of parts) p.line(s, 10);

  p.add();
  p.title("1. Ouvrages exécutés");
  const groups = worksBySection(d.works);
  if (!groups.length) p.line("Aucun ouvrage détaillé.", 10, p.regular, GREY);
  for (const g of groups) {
    if (g.section) p.heading(g.section);
    for (const w of g.works) {
      const q = quantityText(w);
      p.ensure(14);
      const top = p.y;
      p.line(w.label, 10, p.regular, BLACK, LEFT, WIDTH - 110);
      if (q)
        p.page.drawText(sanitize(q, p.regular), {
          x: A4.w - LEFT - p.regular.widthOfTextAtSize(sanitize(q, p.regular), 10),
          y: top - 14,
          size: 10,
          font: p.regular,
          color: GREY,
        });
    }
  }

  p.gap(10);
  p.title("2. Matériaux et documents techniques");
  if (!d.documents.length) p.line("Aucun document technique joint aux articles utilisés.", 10, p.regular, GREY);
  for (const doc_ of d.documents) {
    p.line(`${doc_.kind} : ${doc_.title}`, 10, p.bold);
    p.line(doc_.item, 9, p.regular, GREY);
  }

  p.gap(10);
  p.title("3. Réception et réserves");
  if (!d.reception) p.line("Réception non prononcée.", 10, p.regular, GREY);
  else {
    p.line(`Réception ${DECISIONS[d.reception.decision] ?? d.reception.decision} le ${fr(d.reception.date)}. Le procès-verbal signé figure en annexe.`, 10);
    if (!d.reserves.length) p.line("Aucune réserve.", 10, p.regular, GREY);
    d.reserves.forEach((r, i) => {
      p.rule();
      p.line(`${i + 1}. ${r.label}${r.location ? ` (${r.location})` : ""}`, 10, p.bold);
      p.line(r.liftedAt ? `Levée le ${fr(r.liftedAt)}` : "À lever", 9, p.regular, GREY);
    });
  }

  p.gap(10);
  p.title("4. Garanties");
  const periods = doeWarranties(d, today);
  if (!periods.length) p.line("Les garanties courent à partir de la réception des travaux.", 10, p.regular, GREY);
  for (const w of periods) {
    p.line(`${w.label} : jusqu'au ${fr(w.end)}`, 10, p.bold);
    p.line(w.covers, 9, p.regular, GREY);
  }

  p.gap(10);
  p.title("5. Conseils d'entretien");
  p.line(d.notes.trim() || "Reportez-vous aux notices des fabricants jointes en annexe.", 10);

  const images = (await Promise.all(photos.map(async (ph) => ({ ph, img: await embed(doc, ph) })))).filter((x) => x.img);
  p.add();
  p.title("6. Photos du chantier");
  if (!images.length) p.line("Aucune photo.", 10, p.regular, GREY);
  const colW = (WIDTH - 16) / 2;
  const boxH = 180;
  for (let i = 0; i < images.length; i += 2) {
    p.ensure(boxH + 30);
    const top = p.y;
    for (const [j, { ph, img }] of images.slice(i, i + 2).entries()) {
      const x = LEFT + j * (colW + 16);
      const scale = Math.min(colW / img!.width, boxH / img!.height, 1);
      const w = img!.width * scale;
      const h = img!.height * scale;
      p.page.drawRectangle({ x, y: top - boxH - 4, width: colW, height: boxH + 4, borderColor: LINE, borderWidth: 0.6 });
      p.page.drawImage(img!, { x: x + (colW - w) / 2, y: top - 2 - h - (boxH - h) / 2, width: w, height: h });
      const caption = sanitize(`${fr(ph.date)}${ph.caption ? ` : ${ph.caption}` : ""}`, p.regular).slice(0, 70);
      p.page.drawText(caption, { x, y: top - boxH - 16, size: 8, font: p.regular, color: GREY });
    }
    p.y = top - boxH - 26;
  }

  if (missing.length) {
    p.gap(10);
    p.line(`Éléments non fournis à la date d'édition : ${missing.map((c) => c.label.toLowerCase()).join(", ")}.`, 8, p.regular, GREY);
  }

  for (const a of attachments) {
    try {
      const src = await PDFDocument.load(a.bytes, { ignoreEncryption: true });
      const pages = await doc.copyPages(src, src.getPageIndices());
      pages.forEach((pg) => doc.addPage(pg));
    } catch {
      const pg = doc.addPage([A4.w, A4.h]);
      pg.drawText(sanitize(`Annexe illisible : ${a.title}`, p.regular).slice(0, 90), { x: LEFT, y: A4.h - 60, size: 11, font: p.regular, color: BLACK });
    }
  }
  return doc.save();
}
