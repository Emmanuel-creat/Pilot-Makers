/** Demande de financement d'équipement : simulation des mensualités et contenu du dossier pour la banque ou le loueur. */

export const FINANCING_KINDS = {
  credit_bail: "Crédit-bail",
  loa: "Location avec option d'achat",
  pret: "Prêt professionnel",
  lld: "Location longue durée",
} as const;
export type FinancingKind = keyof typeof FINANCING_KINDS;

export const EQUIPMENT_CATEGORIES = {
  vehicule: "Véhicule utilitaire",
  engin: "Engin de chantier",
  outillage: "Outillage et machines",
  informatique: "Informatique et logiciels",
  autre: "Autre équipement",
} as const;
export type EquipmentCategory = keyof typeof EQUIPMENT_CATEGORIES;

export const FINANCING_STATUSES = { brouillon: "Brouillon", envoyee: "Envoyée", accordee: "Accordée", refusee: "Refusée" } as const;
export type FinancingStatus = keyof typeof FINANCING_STATUSES;

/** Taux annuels indicatifs par défaut, en points de base, à ajuster avec l'offre reçue. */
export const DEFAULT_RATE_BP: Record<FinancingKind, number> = { credit_bail: 550, loa: 600, pret: 480, lld: 650 };
export const DURATIONS = [24, 36, 48, 60, 72] as const;

/**
 * Mensualité (en centimes) d'un financement de `principal` sur `months` mois au taux annuel `rateBp`,
 * avec une valeur résiduelle (option d'achat ou loyer final) payée à la fin.
 */
export function monthlyPayment(principalCents: number, months: number, rateBp: number, residualCents = 0): number {
  if (months <= 0 || principalCents <= 0) return 0;
  const r = rateBp / 10_000 / 12;
  if (r === 0) return Math.round((principalCents - residualCents) / months);
  const f = Math.pow(1 + r, months);
  return Math.round(((principalCents - residualCents / f) * r * f) / (f - 1));
}

export interface Simulation {
  months: number;
  monthlyCents: number;
  totalCents: number;
  costCents: number;
}

/** Simulation sur les durées usuelles : mensualité, total payé (apport et option compris) et coût du financement. */
export function simulate(amountCents: number, downCents: number, rateBp: number, residualBp: number, months: readonly number[] = DURATIONS): Simulation[] {
  const principal = Math.max(0, amountCents - downCents);
  const residual = Math.round((amountCents * residualBp) / 10_000);
  return months.map((m) => {
    const monthly = monthlyPayment(principal, m, rateBp, residual);
    const total = downCents + monthly * m + residual;
    return { months: m, monthlyCents: monthly, totalCents: total, costCents: total - amountCents };
  });
}

/** Part de la mensualité dans le chiffre d'affaires mensuel moyen, en pour cent ; null sans chiffre d'affaires. */
export function burden(monthlyCents: number, yearlyRevenueCents: number): number | null {
  if (yearlyRevenueCents <= 0) return null;
  return Math.round((monthlyCents / (yearlyRevenueCents / 12)) * 1000) / 10;
}

export interface DossierCheck {
  key: string;
  label: string;
  ok: boolean;
}

/** Pièces et informations que demandent en général les financeurs. */
export function dossierChecks(d: {
  siret: string;
  legalForm: string;
  yearsOfRevenue: number;
  quoteRef: string;
  supplier: string;
  insurer: string;
}): DossierCheck[] {
  return [
    { key: "siret", label: "SIRET de l'entreprise", ok: /^\d{14}$/.test(d.siret.replace(/\s/g, "")) },
    { key: "forme", label: "Forme juridique", ok: !!d.legalForm.trim() },
    { key: "ca", label: "Chiffre d'affaires d'au moins une année complète", ok: d.yearsOfRevenue >= 1 },
    { key: "fournisseur", label: "Fournisseur de l'équipement", ok: !!d.supplier.trim() },
    { key: "devis", label: "Référence du devis ou de la facture pro forma du fournisseur", ok: !!d.quoteRef.trim() },
    { key: "assurance", label: "Assureur de l'entreprise", ok: !!d.insurer.trim() },
  ];
}
