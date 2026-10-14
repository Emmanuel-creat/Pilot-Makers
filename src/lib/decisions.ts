/**
 * Simulateur de décisions : effet estimé sur le résultat annuel d'une embauche, d'une hausse de prix
 * ou de l'achat d'un véhicule, à partir des chiffres de l'entreprise et d'hypothèses modifiables.
 */

import { monthlyPayment } from "@/lib/financing";

export interface Baseline {
  /** Chiffre d'affaires HT des 12 derniers mois */
  revenueCents: number;
  /** Achats affectés aux chantiers et frais, HT, sur la même période */
  costsCents: number;
  /** Taux horaire de main-d'oeuvre facturé HT */
  hourlyRateCents: number;
}

export const marginRate = (b: Baseline) => (b.revenueCents > 0 ? Math.max(0, (b.revenueCents - b.costsCents) / b.revenueCents) : 0);

export interface HireInput {
  /** Salaire brut mensuel */
  grossMonthlyCents: number;
  /** Coefficient de charges patronales (1,45 par défaut pour un ouvrier du bâtiment, à vérifier) */
  employerFactor: number;
  /** Heures facturables par mois une fois la personne autonome */
  billableHours: number;
  /** Mois de montée en compétence la première année, facturés à moitié */
  rampMonths: number;
  /** Achats supplémentaires en part du chiffre d'affaires de main-d'oeuvre (fournitures, petit outillage) */
  materialRate: number;
}

export function simulateHire(b: Baseline, h: HireInput) {
  const yearlyCost = Math.round(h.grossMonthlyCents * h.employerFactor * 12);
  const ramp = Math.min(12, Math.max(0, h.rampMonths));
  const hoursYear = h.billableHours * (12 - ramp / 2);
  const revenue = Math.round(hoursYear * b.hourlyRateCents);
  const extraCosts = Math.round(revenue * h.materialRate);
  const result = revenue - extraCosts - yearlyCost;
  const perHour = b.hourlyRateCents * (1 - h.materialRate);
  const breakEvenHours = perHour > 0 ? Math.ceil((h.grossMonthlyCents * h.employerFactor) / perHour) : null;
  return { yearlyCost, revenue, extraCosts, result, breakEvenHoursPerMonth: breakEvenHours };
}

export interface PriceInput {
  /** Hausse des prix en pour cent */
  increasePct: number;
  /** Part du chiffre d'affaires perdue (devis refusés en plus), en pour cent */
  volumeLossPct: number;
}

/** Hausse de prix : le volume perdu fait aussi baisser les achats, la hausse s'ajoute entièrement à la marge. */
export function simulatePrice(b: Baseline, p: PriceInput) {
  const keep = 1 - p.volumeLossPct / 100;
  const revenue = Math.round(b.revenueCents * (1 + p.increasePct / 100) * keep);
  const costs = Math.round(b.costsCents * keep);
  const before = b.revenueCents - b.costsCents;
  const after = revenue - costs;
  // Perte de volume au-delà de laquelle la hausse fait perdre de l'argent.
  const m = marginRate(b);
  const breakEvenLossPct = m + p.increasePct / 100 > 0 ? Math.round((p.increasePct / 100 / (m + p.increasePct / 100)) * 1000) / 10 : null;
  return { revenue, costs, before, after, delta: after - before, breakEvenLossPct };
}

export interface VehicleInput {
  priceCents: number;
  months: number;
  rateBp: number;
  /** Assurance, entretien, carburant par mois */
  runningMonthlyCents: number;
  /** Coût mensuel actuel évité (location, ancien véhicule), 0 si aucun */
  savedMonthlyCents: number;
}

export function simulateVehicle(b: Baseline, v: VehicleInput) {
  const monthly = monthlyPayment(v.priceCents, v.months, v.rateBp);
  const net = monthly + v.runningMonthlyCents - v.savedMonthlyCents;
  const yearly = net * 12;
  const m = marginRate(b);
  const revenueNeeded = m > 0 ? Math.round(yearly / m) : null;
  const hoursNeeded = b.hourlyRateCents > 0 && net > 0 ? Math.ceil(net / b.hourlyRateCents) : 0;
  return { monthlyPayment: monthly, netMonthly: net, yearly, revenueNeeded, hoursNeededPerMonth: hoursNeeded };
}
