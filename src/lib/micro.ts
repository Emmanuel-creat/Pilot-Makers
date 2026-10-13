/**
 * Micro-entreprise : plafonds de chiffre d'affaires, seuils de franchise de TVA et cotisations sociales.
 *
 * Le régime se juge sur les encaissements de l'année civile. Les montants ci-dessous sont ceux en
 * vigueur pour l'année indiquée ; ils sont revus régulièrement par la loi et restent à vérifier sur
 * urssaf.fr et impots.gouv.fr avant toute décision.
 */

export const MICRO_RULES = {
  year: 2026,
  /** Plafonds du régime micro (chiffre d'affaires annuel encaissé) */
  ceilingSales: 20310000,
  ceilingServices: 8360000,
  /** Franchise en base de TVA : seuil de base et seuil majoré */
  vatSales: 8500000,
  vatSalesMajor: 9350000,
  vatServices: 3750000,
  vatServicesMajor: 4125000,
  /** Taux de cotisations sociales, en points de base : ventes et prestations artisanales (BIC) */
  rateSalesBp: 1230,
  rateServicesBp: 2120,
};

export interface MicroIncome {
  /** Encaissements de prestations (main-d'œuvre, pose, forfaits) en centimes */
  services: number;
  /** Encaissements de fournitures vendues, déclarables en vente de marchandises */
  sales: number;
}

export type Level = "ok" | "attention" | "depasse";

/** Attention à 80 % d'un seuil, dépassé au-delà. */
export function level(amount: number, threshold: number): Level {
  return amount > threshold ? "depasse" : amount >= threshold * 0.8 ? "attention" : "ok";
}

/**
 * Plafond d'une activité mixte : le total ne dépasse pas le plafond des ventes, et la part des
 * prestations ne dépasse pas le plafond des prestations.
 */
export function ceilingStatus(i: MicroIncome, splitSales: boolean) {
  const total = i.services + i.sales;
  const services = splitSales ? i.services : total;
  return {
    total: { amount: total, threshold: MICRO_RULES.ceilingSales, level: splitSales ? level(total, MICRO_RULES.ceilingSales) : ("ok" as Level) },
    services: { amount: services, threshold: MICRO_RULES.ceilingServices, level: level(services, MICRO_RULES.ceilingServices) },
  };
}

export function vatStatus(i: MicroIncome, splitSales: boolean) {
  const total = i.services + i.sales;
  const services = splitSales ? i.services : total;
  const lv = (amount: number, base: number, major: number): Level => (amount > major ? "depasse" : amount > base ? "attention" : level(amount, base));
  return {
    services: {
      amount: services,
      threshold: MICRO_RULES.vatServices,
      major: MICRO_RULES.vatServicesMajor,
      level: lv(services, MICRO_RULES.vatServices, MICRO_RULES.vatServicesMajor),
    },
    total: {
      amount: total,
      threshold: MICRO_RULES.vatSales,
      major: MICRO_RULES.vatSalesMajor,
      level: splitSales ? lv(total, MICRO_RULES.vatSales, MICRO_RULES.vatSalesMajor) : ("ok" as Level),
    },
  };
}

/** Cotisations sociales estimées sur des encaissements. */
export function contributions(i: MicroIncome, splitSales: boolean): number {
  const services = splitSales ? i.services : i.services + i.sales;
  const sales = splitSales ? i.sales : 0;
  return Math.round((services * MICRO_RULES.rateServicesBp + sales * MICRO_RULES.rateSalesBp) / 10000);
}

/** Part des fournitures dans un montant, au prorata du hors taxe des lignes de matériaux. */
export function splitAmount(amount: number, materialHt: number, totalHt: number): MicroIncome {
  if (totalHt <= 0 || materialHt <= 0) return { services: amount, sales: 0 };
  const sales = Math.round((amount * Math.min(materialHt, totalHt)) / totalHt);
  return { services: amount - sales, sales };
}
