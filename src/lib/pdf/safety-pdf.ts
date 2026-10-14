/**
 * Plan de prévention à afficher sur le chantier : secours, intervenants, repérages, risques et mesures,
 * équipements de protection, consignes, et une liste d'émargement pour chaque personne qui l'a lu.
 */

import { PDFDocument, StandardFonts } from "pdf-lib";
import { EMERGENCY_NUMBERS, riskByKey } from "@/lib/safety";
import type { SafetyPlan } from "@/lib/services/safety";
import { A4, fr, GREY, LEFT, LINE, Page, WIDTH } from "./reception-pdf";
import { sanitize } from "./quote-pdf";

export interface SafetyDoc {
  org: { name: string; phone: string };
  job: { title: string; address: string; startDate: string | null; endDate: string | null; customer: string };
  plan: SafetyPlan;
  team: string[];
  companies: string[];
  surveys: string[];
  ppe: string[];
  today: string;
}

export async function renderSafetyPdf(d: SafetyDoc): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(`Plan de prévention : ${d.job.title}`);
  doc.setProducer("Pilot-Makers");
  doc.setCreator("Pilot-Makers");
  const p = new Page(doc, await doc.embedFont(StandardFonts.Helvetica), await doc.embedFont(StandardFonts.HelveticaBold));
  p.title("PLAN DE PRÉVENTION DU CHANTIER", `${d.job.title}. Établi par ${d.org.name} le ${fr(d.today)}.`);

  p.heading("En cas d'accident");
  for (const n of EMERGENCY_NUMBERS) p.field(n.label, n.number);
  p.field("Sauveteur secouriste", d.plan.firstAider || "-");
  p.field("Hôpital le plus proche", d.plan.hospital || "-");
  p.field("Point de rassemblement", d.plan.meetingPoint || "-");
  p.line(
    "Protéger, alerter, secourir : sécurisez la zone, appelez les secours en donnant l'adresse du chantier, puis prévenez le responsable.",
    9,
    p.regular,
    GREY,
  );

  p.heading("Chantier et intervenants");
  p.field("Adresse", d.job.address || "-");
  p.field("Maître d'ouvrage", d.job.customer || "-");
  p.field("Période", d.job.startDate ? `du ${fr(d.job.startDate)}${d.job.endDate ? ` au ${fr(d.job.endDate)}` : ""}` : "-");
  p.field("Responsable", `${d.plan.manager}${d.org.phone ? `, ${d.org.phone}` : ""}`);
  p.field("Équipe", d.team.join(", ") || "-");
  p.field("Autres entreprises", d.companies.join(", ") || "Aucune");
  if (d.plan.buildingYear) p.field("Construction", String(d.plan.buildingYear));

  if (d.surveys.length) {
    p.heading("Avant de commencer");
    for (const s of d.surveys) p.line(`- ${s}`, 10);
  }

  p.heading("Risques et mesures de prévention");
  for (const key of d.plan.risks) {
    const r = riskByKey(key);
    if (!r) continue;
    p.rule();
    p.line(r.label, 10.5, p.bold);
    for (const m of r.measures) p.line(`- ${m}`, 9.5);
  }

  p.heading("Équipements de protection individuelle");
  for (const e of d.ppe) p.line(`- ${e}`, 10);

  if (d.plan.instructions.trim()) {
    p.heading("Consignes propres au chantier");
    p.line(d.plan.instructions.trim(), 10);
  }

  p.heading("Lu et compris");
  p.line("Chaque personne intervenant sur le chantier lit ce plan avant de commencer et signe ci-dessous.", 9, p.regular, GREY);
  const names = [...d.team, "", "", "", ""];
  for (const name of names) {
    p.ensure(28);
    p.y -= 24;
    p.page.drawText(sanitize(name || "Nom :", p.regular), { x: LEFT, y: p.y + 4, size: 10, font: p.regular, color: name ? undefined : GREY });
    p.page.drawText("Date :", { x: LEFT + WIDTH * 0.45, y: p.y + 4, size: 10, font: p.regular, color: GREY });
    p.page.drawText("Signature :", { x: LEFT + WIDTH * 0.65, y: p.y + 4, size: 10, font: p.regular, color: GREY });
    p.page.drawLine({ start: { x: LEFT, y: p.y }, end: { x: A4.w - LEFT, y: p.y }, thickness: 0.5, color: LINE });
  }
  return doc.save();
}
