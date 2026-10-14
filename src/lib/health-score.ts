/**
 * Score de santé de l'entreprise : sept indicateurs notés sur des seuils simples, un score sur 100
 * et une lettre de A à E, avec la piste d'amélioration de chaque indicateur faible.
 */

export interface HealthFigures {
  revenueCents: number;
  previousRevenueCents: number;
  costsCents: number;
  /** Délai moyen de paiement des factures soldées, en jours ; null sans donnée */
  paymentDays: number | null;
  outstandingCents: number;
  overdueCents: number;
  /** Part du plus gros client dans le chiffre d'affaires, entre 0 et 1 */
  topCustomerShare: number | null;
  /** Travaux acceptés restant à facturer, HT */
  backlogCents: number;
  /** Devis acceptés / devis décidés, entre 0 et 1 ; null sans donnée */
  acceptance: number | null;
}

export interface Indicator {
  key: string;
  label: string;
  value: string;
  points: number;
  max: number;
  advice: string | null;
}

const pct = (v: number) => `${Math.round(v * 100)} %`;
/** Points au prorata entre un seuil mauvais et un seuil bon (dans un sens ou dans l'autre). */
function scale(v: number, bad: number, good: number, max: number): number {
  const t = (v - bad) / (good - bad);
  return Math.round(Math.max(0, Math.min(1, t)) * max);
}

export function indicators(f: HealthFigures): Indicator[] {
  const out: Indicator[] = [];
  const growth = f.previousRevenueCents > 0 ? f.revenueCents / f.previousRevenueCents - 1 : null;
  out.push({
    key: "croissance",
    label: "Évolution du chiffre d'affaires sur un an",
    value: growth === null ? "pas d'année précédente" : `${growth >= 0 ? "+" : ""}${pct(growth)}`,
    points: growth === null ? 8 : scale(growth, -0.2, 0.1, 15),
    max: 15,
    advice: growth !== null && growth < 0 ? "Relancez les devis en attente et les anciens clients pour retrouver du volume." : null,
  });
  const margin = f.revenueCents > 0 ? (f.revenueCents - f.costsCents) / f.revenueCents : null;
  out.push({
    key: "marge",
    label: "Marge sur achats et frais",
    value: margin === null ? "pas de chiffre d'affaires" : pct(margin),
    points: margin === null ? 0 : scale(margin, 0.2, 0.55, 20),
    max: 20,
    advice: margin !== null && margin < 0.4 ? "Vérifiez vos coefficients de vente et les écarts entre coûts prévus et réels des chantiers." : null,
  });
  out.push({
    key: "paiement",
    label: "Délai moyen de paiement des clients",
    value: f.paymentDays === null ? "pas encore mesuré" : `${Math.round(f.paymentDays)} jours`,
    points: f.paymentDays === null ? 8 : scale(f.paymentDays, 60, 15, 15),
    max: 15,
    advice: f.paymentDays !== null && f.paymentDays > 30 ? "Demandez un acompte à la commande et activez les relances automatiques." : null,
  });
  const overdue = f.outstandingCents > 0 ? f.overdueCents / f.outstandingCents : 0;
  out.push({
    key: "retards",
    label: "Part des sommes dues en retard",
    value: f.outstandingCents > 0 ? pct(overdue) : "aucune somme due",
    points: scale(overdue, 0.5, 0.05, 15),
    max: 15,
    advice: overdue > 0.2 ? "Traitez les factures en retard : relance, appel, puis mise en demeure." : null,
  });
  out.push({
    key: "concentration",
    label: "Part du plus gros client",
    value: f.topCustomerShare === null ? "pas de chiffre d'affaires" : pct(f.topCustomerShare),
    points: f.topCustomerShare === null ? 0 : scale(f.topCustomerShare, 0.5, 0.15, 10),
    max: 10,
    advice: f.topCustomerShare !== null && f.topCustomerShare > 0.3 ? "Un client pèse lourd : diversifiez pour réduire le risque s'il s'arrête." : null,
  });
  const monthly = f.revenueCents / 12;
  const months = monthly > 0 ? f.backlogCents / monthly : 0;
  out.push({
    key: "carnet",
    label: "Carnet de commandes",
    value: `${months.toLocaleString("fr-FR", { maximumFractionDigits: 1 })} mois de travaux`,
    points: scale(months, 0.25, 3, 15),
    max: 15,
    advice: months < 1 ? "Moins d'un mois de travaux signés : accélérez l'envoi et la relance des devis." : null,
  });
  out.push({
    key: "signature",
    label: "Devis acceptés",
    value: f.acceptance === null ? "pas encore mesuré" : pct(f.acceptance),
    points: f.acceptance === null ? 5 : scale(f.acceptance, 0.15, 0.5, 10),
    max: 10,
    advice: f.acceptance !== null && f.acceptance < 0.3 ? "Relancez sous huit jours et proposez des options pour signer davantage." : null,
  });
  return out;
}

export function grade(score: number): "A" | "B" | "C" | "D" | "E" {
  return score >= 80 ? "A" : score >= 65 ? "B" : score >= 50 ? "C" : score >= 35 ? "D" : "E";
}

export function healthScore(f: HealthFigures) {
  const list = indicators(f);
  const score = list.reduce((s, i) => s + i.points, 0);
  return { score, grade: grade(score), indicators: list };
}
