/**
 * Tarifs de l'entreprise : taux horaires par qualification et barème des frais de
 * déplacement. Fonctions pures, utilisables dans l'éditeur comme sur le serveur.
 */

import { parseScaled } from "@/lib/calc/decimal";
import { centsToInput } from "@/lib/calc/format";

export interface LaborRate {
  label: string;
  /** Prix de vente HT de l'heure, en centimes */
  priceCents: number;
  /** Coût interne de l'heure (salaire chargé), en centimes, 0 si inconnu */
  costCents: number;
}

export interface TravelSettings {
  /** Prix HT du kilomètre parcouru */
  perKmCents: number;
  /** Forfait HT par déplacement, quelle que soit la distance */
  fixedCents: number;
  /** Rayon sans frais kilométriques autour de l'entreprise */
  freeKm: number;
}

/** Familles qui peuvent avoir un coefficient de vente (prix = coût d'achat x coefficient). */
export const COEFFICIENT_FAMILIES = {
  materiau: "Matériaux et fournitures",
  sous_traitance: "Sous-traitance",
  main_oeuvre: "Main-d'œuvre",
  autre: "Autres",
} as const;
export type CoefficientFamily = keyof typeof COEFFICIENT_FAMILIES;

export interface Pricing {
  laborRates: LaborRate[];
  travel: TravelSettings;
  /** Coefficient de vente par famille, en dix-millièmes (13000 = x 1,30) */
  coefficients: Partial<Record<CoefficientFamily, number>>;
}

export const LABOR_RATES_MAX = 8;
export const DEFAULT_QUALIFICATIONS = ["Apprenti", "Ouvrier", "Chef d'équipe"];

const int = (v: unknown, max: number) => {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isInteger(n) && n >= 0 && n <= max ? n : 0;
};

/** Lit les tarifs enregistrés, en ignorant toute valeur invalide. */
export function readPricing(raw: unknown): Pricing {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const rates = Array.isArray(r.laborRates) ? r.laborRates : [];
  const t = (r.travel && typeof r.travel === "object" ? r.travel : {}) as Record<string, unknown>;
  const c = (r.coefficients && typeof r.coefficients === "object" ? r.coefficients : {}) as Record<string, unknown>;
  const coefficients: Pricing["coefficients"] = {};
  for (const k of Object.keys(COEFFICIENT_FAMILIES) as CoefficientFamily[]) {
    const v = int(c[k], 100_000);
    if (v >= 10_000) coefficients[k] = v;
  }
  return {
    coefficients,
    laborRates: rates
      .map((x) => x as Record<string, unknown>)
      .filter((x) => typeof x.label === "string" && x.label.trim())
      .slice(0, LABOR_RATES_MAX)
      .map((x) => ({ label: String(x.label).trim().slice(0, 60), priceCents: int(x.priceCents, 10_000_00), costCents: int(x.costCents, 10_000_00) })),
    travel: { perKmCents: int(t.perKmCents, 100_00), fixedCents: int(t.fixedCents, 10_000_00), freeKm: int(t.freeKm, 500) },
  };
}

/** Montant saisi en euros vers des centimes ; vide vaut 0. */
export function eurosToCents(input: string, label: string): number {
  const t = input.trim();
  if (!t) return 0;
  let v: bigint;
  try {
    v = parseScaled(t.replace("€", "").trim(), 2);
  } catch {
    throw new Error(`${label} : montant invalide`);
  }
  if (v < 0n) throw new Error(`${label} : montant négatif`);
  return Number(v);
}

/** Taux correspondant au prix d'une ligne, pour afficher la qualification choisie. */
export function rateForPrice(rates: LaborRate[], unitPrice: string) {
  let cents: number;
  try {
    cents = Number(parseScaled(unitPrice.trim() || "x", 2));
  } catch {
    return -1;
  }
  return rates.findIndex((r) => r.priceCents === cents);
}

/** Ce que l'éditeur écrit sur une ligne de main-d'oeuvre quand on choisit une qualification. */
export function laborPatch(rate: LaborRate) {
  return { unit: "h", unitPrice: centsToInput(rate.priceCents), unitCost: rate.costCents ? centsToInput(rate.costCents) : "" };
}

/**
 * Frais de déplacement : forfait par trajet, plus les kilomètres aller-retour
 * au-delà du rayon gratuit. La distance est celle d'un aller.
 */
export function travelCostCents(t: TravelSettings, km: number) {
  const billable = Math.max(0, km - t.freeKm) * 2;
  return t.fixedCents + Math.round(billable * t.perKmCents);
}

export function travelLine(t: TravelSettings, km: number, trips: number) {
  const unit = travelCostCents(t, km);
  const parts = [`${String(km).replace(".", ",")} km aller`];
  if (t.freeKm && km > t.freeKm) parts.push(`au-delà de ${t.freeKm} km`);
  return {
    label: "Frais de déplacement",
    description: `Par déplacement : ${parts.join(", ")}, aller-retour.`,
    nature: "deplacement" as const,
    quantity: String(trips),
    unit: "u",
    unitPrice: centsToInput(unit),
  };
}

/** Coefficient saisi ("1,3") vers des dix-millièmes ; vide vaut 0 (pas de coefficient). */
export function coefficientToBp(input: string, label: string): number {
  const t = input.trim().replace(/^x\s*/i, "");
  if (!t) return 0;
  let v: bigint;
  try {
    v = parseScaled(t, 4);
  } catch {
    throw new Error(`${label} : coefficient invalide`);
  }
  if (v < 10_000n || v > 100_000n) throw new Error(`${label} : coefficient entre 1 et 10`);
  return Number(v);
}

export const coefficientLabel = (bp: number) => (bp / 10_000).toFixed(2).replace(".", ",");

/** Prix de vente HT déduit du coût d'achat et du coefficient de la famille, au centime. */
export function priceFromCost(unitCost: string, coefBp: number): string | null {
  let cost: bigint;
  try {
    cost = parseScaled(unitCost.trim() || "x", 4);
  } catch {
    return null;
  }
  if (cost <= 0n || !coefBp) return null;
  // coût (4 décimales) x coefficient (4 décimales) arrondi au centime
  const cents = (cost * BigInt(coefBp) + 500_000n) / 1_000_000n;
  return centsToInput(Number(cents));
}

/** Quantité à fournir : quantité mesurée augmentée des chutes, arrondie au centième supérieur. */
export function withWaste(quantity: string, wastePercent: string): string | null {
  let q: bigint;
  let w: bigint;
  try {
    q = parseScaled(quantity.trim() || "x", 3);
    w = parseScaled(wastePercent.trim() || "x", 2);
  } catch {
    return null;
  }
  if (q <= 0n || w <= 0n) return null;
  // q en millièmes, w en points de base : résultat en centièmes, arrondi vers le haut
  const num = q * (10_000n + w);
  const den = 100_000n;
  const hundredths = (num + den - 1n) / den;
  const t = hundredths.toString().padStart(3, "0");
  const out = `${t.slice(0, -2)},${t.slice(-2)}`.replace(/,?0+$/, "");
  return out;
}
