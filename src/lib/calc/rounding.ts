/**
 * Arrondis commerciaux proposés dans l'éditeur de devis.
 *
 * Un prix calculé (coût x coefficient, ouvrage composé) tombe souvent sur des centimes peu parlants :
 * 43,87 €. On propose le prix rond le plus proche, avec un pas qui grandit avec le prix, et un total
 * TTC rond obtenu par la remise globale. Rien n'est appliqué sans que l'artisan le demande.
 */

import type { DraftSection, QuoteDraft } from "@/lib/services/quote-types";
import { parseScaled } from "./decimal";
import { draftToCalcInput } from "./draft";
import { computeQuote, PRICE_SCALE } from "./engine";
import { bpToInput, price4ToInput } from "./format";

/** Pas d'arrondi en dix-millièmes d'euro selon le prix unitaire. */
export function priceStep4(price4: bigint): bigint {
  if (price4 < 100000n) return 1000n; // moins de 10 € : 0,10 €
  if (price4 < 1000000n) return 5000n; // moins de 100 € : 0,50 €
  if (price4 < 10000000n) return 10000n; // moins de 1 000 € : 1 €
  return 50000n; // au-delà : 5 €
}

/** Prix rond le plus proche (moitié vers le haut) ; un prix trop petit pour être arrondi reste tel quel. */
export function commercialPrice4(price4: bigint): bigint {
  if (price4 <= 0n) return price4;
  const step = priceStep4(price4);
  const rounded = ((price4 + step / 2n) / step) * step;
  return rounded > 0n ? rounded : price4;
}

export interface PriceRounding {
  sectionId: string;
  lineId: string;
  label: string;
  fromPrice4: number;
  toPrice4: number;
}

/** Lignes chiffrées dont le prix unitaire gagnerait à être arrondi. */
export function priceRoundings(sections: readonly DraftSection[]): PriceRounding[] {
  const out: PriceRounding[] = [];
  for (const s of sections) {
    for (const l of s.lines) {
      if (l.kind !== "item" || l.signed || !l.unitPrice.trim()) continue;
      let p: bigint;
      try {
        p = parseScaled(l.unitPrice, PRICE_SCALE);
      } catch {
        continue;
      }
      const r = commercialPrice4(p);
      if (r !== p) out.push({ sectionId: s.id, lineId: l.id, label: l.label, fromPrice4: Number(p), toPrice4: Number(r) });
    }
  }
  return out;
}

export function applyPriceRoundings(sections: DraftSection[], roundings: readonly PriceRounding[]): DraftSection[] {
  const byLine = new Map(roundings.map((r) => [r.lineId, r.toPrice4]));
  return sections.map((s) => ({
    ...s,
    lines: s.lines.map((l) => (byLine.has(l.id) ? { ...l, unitPrice: price4ToInput(byLine.get(l.id)!) } : l)),
  }));
}

/** Pas du total rond : la dizaine, 50 € ou la centaine selon le montant. */
export function roundStep(ttcCents: number): number {
  return ttcCents < 100000 ? 1000 : ttcCents < 1000000 ? 5000 : 10000;
}

/** Total rond visé, toujours inférieur ou égal au total. */
export function roundTarget(ttcCents: number): number {
  const step = roundStep(ttcCents);
  return Math.floor(ttcCents / step) * step;
}

/** Remise globale au-delà de laquelle l'arrondi n'en est plus un. */
export const MAX_ROUNDING_BP = 300;

export interface TotalRounding {
  targetCents: number;
  /** Remise globale à saisir, en points de base */
  discountBp: number;
  /** Total TTC obtenu : égal à la cible, ou juste en dessous si aucune remise à 2 décimales ne tombe juste */
  resultCents: number;
}

/** Remise globale qui ramène le total TTC au montant rond inférieur, ou null s'il n'y a rien à arrondir. */
export function totalRounding(d: Pick<QuoteDraft, "sections" | "globalDiscount">, vatExempt: boolean): TotalRounding | null {
  const ttc = (bp: number) => computeQuote(draftToCalcInput({ sections: d.sections, globalDiscount: bpToInput(bp) }, vatExempt));
  const current = computeQuote(draftToCalcInput(d, vatExempt));
  if (current.issues.some((i) => i.blocking) || current.totalTtcCents <= 0) return null;
  const target = roundTarget(current.totalTtcCents);
  if (target === current.totalTtcCents || target <= 0) return null;
  // Juste sous un montant rond (arrondi déjà appliqué, à quelques centimes près) : rien à proposer.
  if (target + roundStep(current.totalTtcCents) - current.totalTtcCents < 100) return null;
  // Le total décroît avec la remise : plus petite remise qui passe sous la cible.
  let lo = current.globalDiscountBp;
  let hi = Math.min(10000, current.globalDiscountBp + MAX_ROUNDING_BP);
  if (ttc(hi).totalTtcCents > target) return null;
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    if (ttc(mid).totalTtcCents <= target) hi = mid;
    else lo = mid + 1;
  }
  return { targetCents: target, discountBp: lo, resultCents: ttc(lo).totalTtcCents };
}
