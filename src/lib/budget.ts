/**
 * Budget annuel comparé au réalisé : chaque poste a un montant annuel, réparti en douzièmes,
 * et le réalisé de l'année en cours est projeté sur douze mois au rythme des mois écoulés.
 */

export const BUDGET_LINES = {
  facture: { label: "Chiffre d'affaires facturé (HT)", kind: "produit" },
  encaisse: { label: "Encaissements", kind: "produit" },
  achats: { label: "Achats de chantier (HT)", kind: "charge" },
  frais: { label: "Notes de frais (HT)", kind: "charge" },
} as const;
export type BudgetLine = keyof typeof BUDGET_LINES;
export const BUDGET_KEYS = Object.keys(BUDGET_LINES) as BudgetLine[];

export type Amounts = Partial<Record<BudgetLine, number>>;

/** Budget d'un mois : douzième du montant annuel, le reste des centimes sur décembre. */
export function monthlyBudget(annual: number, month: number): number {
  const base = Math.floor(annual / 12);
  return month === 12 ? annual - base * 11 : base;
}

export function cumulativeBudget(annual: number, throughMonth: number): number {
  let t = 0;
  for (let m = 1; m <= throughMonth; m++) t += monthlyBudget(annual, m);
  return t;
}

export type Gap = "favorable" | "defavorable" | "neutre";

/** Un produit au-dessus du budget est favorable, une charge au-dessus défavorable ; 5 % de tolérance. */
export function gap(line: BudgetLine, actual: number, budget: number): Gap {
  if (!budget) return "neutre";
  const ratio = actual / budget;
  if (ratio >= 0.95 && ratio <= 1.05) return "neutre";
  const above = ratio > 1;
  return BUDGET_LINES[line].kind === "produit" ? (above ? "favorable" : "defavorable") : above ? "defavorable" : "favorable";
}

/** Projection sur l'année au rythme des mois écoulés (mois en cours compris). */
export function projection(actualToDate: number, monthsElapsed: number): number {
  return monthsElapsed > 0 ? Math.round((actualToDate * 12) / monthsElapsed) : 0;
}
