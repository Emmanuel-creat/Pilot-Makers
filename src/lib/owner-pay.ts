/**
 * Mon vrai salaire : ce que le dirigeant gagne réellement par heure travaillée, et ce qu'il faudrait changer pour
 * vivre correctement de son métier. Fonctions pures, montants en centimes.
 *
 * Deux cas : en entreprise individuelle ou en société, les cotisations du dirigeant se calculent sur son revenu
 * (environ 45 % du revenu net pour un travailleur non salarié) ; en micro-entreprise, elles se calculent sur le
 * chiffre d'affaires et les charges ne se déduisent pas. Les taux sont indicatifs et modifiables : seul l'expert-
 * comptable connaît le chiffre exact.
 */

export const REGIMES = {
  reel: { label: "Entreprise individuelle ou société", rateLabel: "Cotisations, en % du revenu net", defaultRate: 45 },
  micro: { label: "Micro-entreprise", rateLabel: "Cotisations, en % du chiffre d'affaires", defaultRate: 21.2 },
} as const;
export type Regime = keyof typeof REGIMES;

/** Semaines travaillées par an, une fois retirés congés et jours fériés */
export const WORK_WEEKS = 47;

export interface OwnerPayInputs {
  regime: Regime;
  /** Chiffre d'affaires HT des douze derniers mois */
  revenueCents: number;
  /** Achats et frais tenus dans l'application, HT */
  costsCents: number;
  /** Charges annuelles non saisies (salaires de l'équipe, loyer, crédit du véhicule...) */
  otherCostsCents: number;
  /** Taux de cotisations, en pour cent */
  ratePercent: number;
  /** Heures travaillées par semaine par le dirigeant, chantier et bureau compris */
  hoursPerWeek: number;
  /** Revenu net mensuel visé */
  targetMonthlyCents: number;
}

export interface OwnerPay {
  surplusCents: number;
  contributionsCents: number;
  netYearCents: number;
  netMonthCents: number;
  hoursYear: number;
  /** Revenu net par heure réellement travaillée */
  netHourCents: number;
  /** Excédent avant cotisations nécessaire pour atteindre l'objectif */
  neededSurplusCents: number;
  /** Hausse de prix nécessaire, en pour cent, à charges égales (0 si l'objectif est atteint ; null sans chiffre d'affaires) */
  priceIncreasePercent: number | null;
  /** Part de chaque euro facturé : charges, cotisations, revenu du dirigeant */
  split: { costs: number; contributions: number; net: number } | null;
}

export function ownerPay(i: OwnerPayInputs): OwnerPay {
  const rate = Math.max(0, i.ratePercent) / 100;
  const costs = i.costsCents + i.otherCostsCents;
  let contributions: number;
  let net: number;
  let neededSurplus: number;
  const targetYear = i.targetMonthlyCents * 12;
  if (i.regime === "micro") {
    contributions = Math.round(i.revenueCents * rate);
    net = i.revenueCents - costs - contributions;
    // Chiffre d'affaires nécessaire R : R (1 - taux) - charges = objectif
    const neededRevenue = rate < 1 ? (targetYear + costs) / (1 - rate) : Infinity;
    neededSurplus = Math.round(neededRevenue - costs);
  } else {
    const surplus = i.revenueCents - costs;
    net = surplus > 0 ? Math.round(surplus / (1 + rate)) : surplus;
    contributions = surplus > 0 ? surplus - net : 0;
    neededSurplus = Math.round(targetYear * (1 + rate));
  }
  const surplus = i.revenueCents - costs;
  const hoursYear = Math.max(0, i.hoursPerWeek) * WORK_WEEKS;
  const missing = neededSurplus - surplus;
  // À charges égales, le chiffre d'affaires manquant est l'écart d'excédent (en micro-entreprise, l'excédent
  // nécessaire inclut déjà les cotisations prélevées sur ce chiffre d'affaires).
  const extraRevenue = missing;
  return {
    surplusCents: surplus,
    contributionsCents: contributions,
    netYearCents: net,
    netMonthCents: Math.round(net / 12),
    hoursYear,
    netHourCents: hoursYear ? Math.round(net / hoursYear) : 0,
    neededSurplusCents: neededSurplus,
    priceIncreasePercent: i.revenueCents > 0 ? Math.max(0, Math.round((extraRevenue / i.revenueCents) * 1000) / 10) : null,
    split:
      i.revenueCents > 0
        ? {
            costs: Math.round((costs / i.revenueCents) * 100),
            contributions: Math.round((contributions / i.revenueCents) * 100),
            net: Math.round((net / i.revenueCents) * 100),
          }
        : null,
  };
}

/** Lecture tolérante d'un nombre saisi (« 2 500 », « 45,5 ») ; la valeur par défaut si vide ou invalide */
export function readNumber(v: string | undefined, fallback: number, min = 0, max = 1e9): number {
  const t = (v ?? "").replace(/[\s €%]/g, "").replace(",", ".");
  if (!t) return fallback;
  const n = Number(t);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
}
