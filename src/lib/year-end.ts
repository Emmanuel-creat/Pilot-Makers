/** Préparation du bilan avec l'expert-comptable : points de clôture de l'exercice et état d'avancement. */

export const YEAR_END_CHECKS = [
  {
    id: "creances",
    label: "Factures clients non réglées au dernier jour de l'exercice",
    hint: "À rapprocher du compte clients : relancez ou provisionnez les impayés anciens.",
  },
  {
    id: "acomptes",
    label: "Acomptes reçus sur des chantiers non soldés",
    hint: "Avances des clients : le chiffre d'affaires correspondant n'est pas encore acquis.",
  },
  {
    id: "en_cours",
    label: "Travaux signés restant à facturer",
    hint: "Base de l'évaluation des travaux en cours : indiquez l'avancement réel de chaque chantier.",
  },
  { id: "retenues", label: "Retenues de garantie conservées par les clients", hint: "Créances à plus d'un an possibles : à signaler séparément." },
  { id: "stock", label: "Inventaire du stock", hint: "Comptez le stock au dépôt et dans les véhicules le dernier jour de l'exercice." },
  { id: "frais", label: "Notes de frais validées non remboursées", hint: "Dettes envers les salariés à la clôture." },
  { id: "banque", label: "Rapprochement bancaire au dernier jour", hint: "Relevé de fin d'exercice et paiements non encore pointés." },
  {
    id: "immobilisations",
    label: "Achats de matériel et véhicules de l'exercice",
    hint: "Factures d'achat d'outillage, de machines ou de véhicules à transmettre.",
  },
  { id: "emprunts", label: "Échéanciers d'emprunts et contrats de location", hint: "Tableaux d'amortissement et contrats de crédit-bail." },
  { id: "caisse", label: "Caisse et espèces", hint: "Solde de caisse au dernier jour, si l'entreprise en tient une." },
] as const;
export type YearEndCheckId = (typeof YEAR_END_CHECKS)[number]["id"];

export function isCheckId(v: string): v is YearEndCheckId {
  return YEAR_END_CHECKS.some((c) => c.id === v);
}

/** Dates de début et de fin de l'exercice, clôturé le jour et le mois indiqués (31/12 par défaut). */
export function fiscalYear(year: number, closingMonth = 12, closingDay = 31): { from: string; to: string } {
  const pad = (n: number) => String(n).padStart(2, "0");
  const lastDay = (y: number) => Math.min(closingDay, new Date(Date.UTC(y, closingMonth, 0)).getUTCDate());
  const to = `${year}-${pad(closingMonth)}-${pad(lastDay(year))}`;
  const start = new Date(Date.UTC(year - 1, closingMonth - 1, lastDay(year - 1)));
  start.setUTCDate(start.getUTCDate() + 1);
  return { from: start.toISOString().slice(0, 10), to };
}

export function completion(done: Record<string, boolean>): { done: number; total: number } {
  return { done: YEAR_END_CHECKS.filter((c) => done[c.id]).length, total: YEAR_END_CHECKS.length };
}
