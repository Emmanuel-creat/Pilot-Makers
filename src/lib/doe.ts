/**
 * Dossier des ouvrages exécutés (DOE), fonctions pures : contenu attendu et points manquants avant
 * de remettre le dossier au client.
 */

import { warrantyPeriods, type WarrantyPeriod } from "./warranties";

export interface DoeWork {
  section: string;
  label: string;
  quantity: number;
  unit: string;
}

export interface DoeDocument {
  kind: string;
  title: string;
  item: string;
}

export interface DoeData {
  job: { title: string; address: string; startDate: string | null; endDate: string | null; quoteNumber: string | null };
  org: { name: string; address: string; siret: string; phone: string; email: string; insurer: string; policy: string; area: string; decennale: boolean };
  customer: { name: string; address: string };
  works: DoeWork[];
  documents: DoeDocument[];
  reception: { date: string; decision: string } | null;
  reserves: { label: string; location: string; liftedAt: string | null }[];
  photos: number;
  notes: string;
}

export interface DoeCheck {
  key: string;
  label: string;
  ok: boolean;
  hint: string;
}

/** Points à vérifier avant de remettre le dossier : il reste téléchargeable même incomplet. */
export function doeChecks(d: DoeData): DoeCheck[] {
  const open = d.reserves.filter((r) => !r.liftedAt).length;
  return [
    {
      key: "reception",
      label: "Réception prononcée",
      ok: !!d.reception && d.reception.decision !== "refus",
      hint: "Faites signer le procès-verbal de réception : il ouvre les garanties et figure dans le dossier.",
    },
    {
      key: "reserves",
      label: "Réserves levées",
      ok: open === 0,
      hint: `${open} réserve${open > 1 ? "s" : ""} encore à lever.`,
    },
    {
      key: "documents",
      label: "Fiches techniques des matériaux",
      ok: d.documents.length > 0,
      hint: "Joignez les fiches techniques et notices aux articles du catalogue utilisés par le devis.",
    },
    { key: "photos", label: "Photos du chantier", ok: d.photos > 0, hint: "Ajoutez des photos au journal de chantier, notamment des réseaux avant fermeture." },
    { key: "notes", label: "Conseils d'entretien", ok: d.notes.trim().length >= 20, hint: "Rédigez quelques conseils d'entretien propres à ces travaux." },
    {
      key: "assurance",
      label: "Assurance décennale renseignée",
      ok: d.org.decennale && !!d.org.insurer,
      hint: "Indiquez votre assureur décennale dans Entreprise, onglet Assurance.",
    },
  ];
}

/** Ouvrages regroupés par partie du devis, dans l'ordre. */
export function worksBySection(works: readonly DoeWork[]): { section: string; works: DoeWork[] }[] {
  const out: { section: string; works: DoeWork[] }[] = [];
  for (const w of works) {
    const last = out[out.length - 1];
    if (last && last.section === w.section) last.works.push(w);
    else out.push({ section: w.section, works: [w] });
  }
  return out;
}

export function doeWarranties(d: DoeData, today: string): WarrantyPeriod[] {
  return d.reception && d.reception.decision !== "refus" ? warrantyPeriods(d.reception.date, today) : [];
}

export function quantityText(w: DoeWork): string {
  if (!w.quantity) return "";
  return `${w.quantity.toLocaleString("fr-FR", { maximumFractionDigits: 2 })}${w.unit ? ` ${w.unit}` : ""}`;
}
