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

export interface Pricing {
  laborRates: LaborRate[];
  travel: TravelSettings;
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
  return {
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
