/**
 * Carnet de santé du logement : l'historique des travaux d'une adresse, ses équipements, entretiens
 * et diagnostics, avec les garanties en cours. Il se transmet au propriétaire suivant par un lien.
 */

import { warrantyPeriods, type WarrantyPeriod } from "@/lib/warranties";

export const ENTRY_KINDS = {
  travaux: "Travaux",
  equipement: "Équipement installé",
  entretien: "Entretien",
  diagnostic: "Diagnostic",
} as const;
export type EntryKind = keyof typeof ENTRY_KINDS;

/** Clé d'adresse stable : sans accents, ponctuation ni variations courantes d'écriture. */
export function addressKey(line1: string, postalCode: string, city: string): string {
  const norm = (s: string) =>
    s
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .replace(/\b(avenue)\b/g, "av")
      .replace(/\b(boulevard)\b/g, "bd")
      .replace(/\b(chemin)\b/g, "ch")
      .replace(/\b(place)\b/g, "pl")
      .replace(/\b(bis)\b/g, "b")
      .replace(/\s+/g, " ")
      .trim();
  return [norm(line1), postalCode.replace(/\s/g, ""), norm(city)].join("|");
}

export interface RecordJob {
  id: string;
  title: string;
  startDate: string | null;
  endDate: string | null;
  receptionDate: string | null;
}

export interface RecordEntry {
  id: string;
  date: string;
  kind: EntryKind;
  label: string;
  detail: string;
  brand: string;
  warrantyUntil: string | null;
  maintenanceMonths: number | null;
  /** Entreprise qui a écrit l'entrée, quand elle vient d'un carnet transmis par un autre artisan */
  source?: string;
}

export type TimelineItem =
  | { type: "chantier"; date: string; job: RecordJob; warranties: WarrantyPeriod[] }
  | { type: "entree"; date: string; entry: RecordEntry };

/** Frise du logement, du plus récent au plus ancien. Un chantier est daté par sa réception, sinon sa fin ou son début. */
export function timeline(jobs: readonly RecordJob[], entries: readonly RecordEntry[], today: string): TimelineItem[] {
  const items: TimelineItem[] = [];
  for (const j of jobs) {
    const date = j.receptionDate ?? j.endDate ?? j.startDate;
    if (!date) continue;
    items.push({ type: "chantier", date, job: j, warranties: j.receptionDate ? warrantyPeriods(j.receptionDate, today) : [] });
  }
  for (const e of entries) items.push({ type: "entree", date: e.date, entry: e });
  return items.sort((a, b) => b.date.localeCompare(a.date));
}

/** Garanties encore actives du logement : décennale, biennale et parfait achèvement des chantiers, garanties fabricant des équipements. */
export function activeWarranties(items: readonly TimelineItem[], today: string): { label: string; end: string; source: string }[] {
  const out: { label: string; end: string; source: string }[] = [];
  for (const it of items) {
    if (it.type === "chantier") {
      for (const w of it.warranties) if (w.state !== "terminee") out.push({ label: w.label, end: w.end, source: it.job.title });
    } else if (it.entry.warrantyUntil && it.entry.warrantyUntil >= today) {
      out.push({ label: "Fabricant", end: it.entry.warrantyUntil, source: it.entry.label });
    }
  }
  return out.sort((a, b) => a.end.localeCompare(b.end));
}

/** Jeton d'un lien de transmission collé tel quel ou dans son adresse complète (.../carnet/JETON) */
export function shareTokenOf(input: string): string | null {
  const t = input.trim();
  const m = /\/carnet\/([A-Za-z0-9_-]{20,80})(?:[/?#]|$)/.exec(t) ?? /^([A-Za-z0-9_-]{20,80})$/.exec(t);
  return m ? m[1] : null;
}

/** Entrées à reprendre d'un carnet transmis : chantiers et entrées de l'autre artisan, avec leur auteur. */
export function entriesToImport(items: readonly TimelineItem[], sourceName: string) {
  return items.map((it) =>
    it.type === "chantier"
      ? {
          sourceId: it.job.id,
          date: it.date,
          kind: "travaux" as EntryKind,
          label: it.job.title,
          detail: [
            it.job.receptionDate ? `Chantier réceptionné le ${it.job.receptionDate.split("-").reverse().join("/")}.` : "Chantier non réceptionné.",
            ...it.warranties.filter((w) => w.state !== "terminee").map((w) => `${w.label} jusqu'au ${w.end.split("-").reverse().join("/")}.`),
          ].join(" "),
          brand: "",
          warrantyUntil: null as string | null,
          maintenanceMonths: null as number | null,
          source: sourceName,
        }
      : {
          sourceId: it.entry.id,
          date: it.entry.date,
          kind: it.entry.kind,
          label: it.entry.label,
          detail: it.entry.detail,
          brand: it.entry.brand,
          warrantyUntil: it.entry.warrantyUntil,
          maintenanceMonths: it.entry.maintenanceMonths,
          // Une entrée déjà reprise garde son auteur d'origine
          source: it.entry.source || sourceName,
        },
  );
}
