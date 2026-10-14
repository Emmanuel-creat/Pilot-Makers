/**
 * Écarts entre coût prévu et coût réel sur les chantiers terminés (fonctions pures), pour corriger le
 * coût des articles du catalogue avant les prochains devis.
 */

export interface CostSample {
  jobId: string;
  plannedCents: number;
  realCents: number;
  /** Quantité de la tâche dans l'unité de l'article, en millièmes (0 si inconnue) */
  quantityMilli?: number;
}

export type ReviewAction = "hausse" | "baisse" | "conforme";
export type Confidence = "faible" | "moyenne" | "bonne";

export const REVIEW_ACTIONS: Record<ReviewAction, string> = { hausse: "Coût sous-estimé", baisse: "Coût surestimé", conforme: "Conforme" };
export const CONFIDENCE: Record<Confidence, string> = { faible: "1 chantier", moyenne: "2 ou 3 chantiers", bonne: "4 chantiers ou plus" };

/** Écart toléré avant de proposer une correction, en points de base (5 %). */
export const TOLERANCE_BP = 500;

export const confidenceOf = (jobs: number): Confidence => (jobs >= 4 ? "bonne" : jobs >= 2 ? "moyenne" : "faible");

export interface ItemReview {
  jobs: number;
  plannedCents: number;
  realCents: number;
  /** Écart des chantiers : (réel - prévu) / prévu, en points de base */
  gapBp: number;
  /** Coût unitaire constaté sur les chantiers, en dix-millièmes d'euro */
  observedCost4: number | null;
  /** Écart entre le coût constaté et le coût actuel du catalogue, en points de base */
  catalogGapBp: number | null;
  action: ReviewAction;
  confidence: Confidence;
  /** Coût unitaire proposé, en dix-millièmes d'euro, ou null si rien à corriger */
  suggestedCost4: number | null;
}

/**
 * Bilan d'un article sur plusieurs chantiers. Le coût constaté est le réel cumulé divisé par les quantités
 * posées (les gros chantiers pèsent plus que les petits), arrondi au centime. Il est comparé au coût actuel
 * du catalogue : une fois la correction appliquée, l'article redevient conforme.
 */
export function reviewItem(samples: CostSample[], currentCost4: number | null, toleranceBp = TOLERANCE_BP): ItemReview | null {
  const valid = samples.filter((s) => s.plannedCents > 0);
  if (!valid.length) return null;
  const plannedCents = valid.reduce((a, s) => a + s.plannedCents, 0);
  const realCents = valid.reduce((a, s) => a + s.realCents, 0);
  const jobs = new Set(valid.map((s) => s.jobId)).size;
  const gapBp = Math.round(((realCents - plannedCents) * 10000) / plannedCents);
  const known = valid.every((s) => (s.quantityMilli ?? 0) > 0);
  const qty = valid.reduce((a, s) => a + (s.quantityMilli ?? 0), 0);
  const observedCost4 = known
    ? Math.round((realCents * 1000) / qty) * 100
    : currentCost4
      ? Math.round((currentCost4 * realCents) / plannedCents / 100) * 100
      : null;
  const catalogGapBp = currentCost4 && observedCost4 != null ? Math.round(((observedCost4 - currentCost4) * 10000) / currentCost4) : null;
  const ref = catalogGapBp ?? gapBp;
  const action: ReviewAction = Math.abs(ref) < toleranceBp ? "conforme" : ref > 0 ? "hausse" : "baisse";
  const suggestedCost4 = action === "conforme" ? null : observedCost4;
  return { jobs, plannedCents, realCents, gapBp, observedCost4, catalogGapBp, action, confidence: confidenceOf(jobs), suggestedCost4 };
}

/** Prix de vente ajusté dans la même proportion que le coût, pour garder le même taux de marge. */
export function keepMarginPrice4(price4: number, oldCost4: number, newCost4: number) {
  if (!oldCost4) return price4;
  return Math.round((price4 * newCost4) / oldCost4 / 100) * 100;
}

/** Temps de main-d'oeuvre : rapport entre le coût réel des heures pointées et le coût prévu au devis. */
export function laborReview(samples: CostSample[], toleranceBp = TOLERANCE_BP) {
  const r = reviewItem(
    samples.map((s) => ({ ...s, quantityMilli: 0 })),
    null,
    toleranceBp,
  );
  return r ? { jobs: r.jobs, plannedCents: r.plannedCents, realCents: r.realCents, gapBp: r.gapBp, action: r.action, confidence: r.confidence } : null;
}
