/**
 * Comptabilité tenue en continu : chaque mois, quelques contrôles simples (relevé importé,
 * paiements rapprochés, notes de frais validées et justifiées). Un mois sans anomalie est
 * marqué vérifié ; quand tous les mois de l'exercice le sont, la clôture tient en un jour.
 */

export const MONTH_CHECKS = [
  { id: "releve", label: "Relevé bancaire importé", fix: "Importez le relevé du mois", href: "/app/banque" },
  { id: "rapprochement", label: "Mouvements bancaires rapprochés", fix: "Rapprochez ou ignorez les mouvements restants", href: "/app/banque" },
  { id: "frais", label: "Notes de frais validées", fix: "Validez ou refusez les notes de frais soumises", href: "/app/frais" },
  { id: "justificatifs", label: "Justificatifs des notes de frais", fix: "Ajoutez la photo du ticket aux notes de frais", href: "/app/frais" },
] as const;
export type MonthCheckId = (typeof MONTH_CHECKS)[number]["id"];

export interface MonthCounts {
  bankLines: number;
  unmatched: number;
  pendingExpenses: number;
  missingReceipts: number;
}

export interface MonthReview {
  verifiedAt: Date;
  vatDeclared: boolean;
  note: string;
}

const MONTHS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];
export const monthLabel = (m: string) => `${MONTHS[Number(m.slice(5, 7)) - 1]} ${m.slice(0, 4)}`;

/** Résultat de chaque contrôle : nombre d'éléments à reprendre (0 = conforme). */
export function monthChecks(c: MonthCounts): { id: MonthCheckId; ok: boolean; count: number }[] {
  return [
    { id: "releve", ok: c.bankLines > 0, count: c.bankLines > 0 ? 0 : 1 },
    { id: "rapprochement", ok: c.unmatched === 0, count: c.unmatched },
    { id: "frais", ok: c.pendingExpenses === 0, count: c.pendingExpenses },
    { id: "justificatifs", ok: c.missingReceipts === 0, count: c.missingReceipts },
  ];
}

/** Mois de l'exercice (AAAA-MM), du premier au dernier. */
export function fiscalMonths(from: string, to: string): string[] {
  const out: string[] = [];
  let y = Number(from.slice(0, 4));
  let m = Number(from.slice(5, 7));
  const end = to.slice(0, 7);
  for (;;) {
    const cur = `${y}-${String(m).padStart(2, "0")}`;
    out.push(cur);
    if (cur >= end) break;
    m = m === 12 ? 1 : m + 1;
    if (m === 1) y++;
  }
  return out;
}

export type MonthState = "a_venir" | "en_cours" | "a_corriger" | "pret" | "verifie";

/** Un mois se vérifie une fois terminé ; il est prêt quand tous les contrôles passent. */
export function monthState(month: string, today: string, checks: { ok: boolean }[], review: MonthReview | null): MonthState {
  if (review) return "verifie";
  const current = today.slice(0, 7);
  if (month > current) return "a_venir";
  if (month === current) return "en_cours";
  return checks.every((c) => c.ok) ? "pret" : "a_corriger";
}

/** Avancement de l'exercice : la clôture tient en un jour quand chaque mois écoulé est vérifié. */
export function yearProgress(states: MonthState[]): { verified: number; elapsed: number; late: number; oneDayClose: boolean } {
  const elapsed = states.filter((s) => s !== "a_venir" && s !== "en_cours").length;
  const verified = states.filter((s) => s === "verifie").length;
  const late = states.filter((s) => s === "pret" || s === "a_corriger").length;
  return { verified, elapsed, late, oneDayClose: states.length > 0 && states.every((s) => s === "verifie") };
}
