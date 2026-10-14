/**
 * Devis vivant (fonctions pures) : tant que le devis n'est pas signé, les lignes reprises du
 * catalogue sont comparées aux prix actuels du catalogue (tarifs fournisseurs importés, prix revus).
 * Rien ne change sans l'accord de l'artisan : l'outil propose, l'artisan applique.
 */

import { parseScaled } from "./calc/decimal";

/** Statuts où les prix peuvent encore suivre le catalogue. */
export const LIVE_STATUSES = ["draft", "incomplete", "ready", "sent", "viewed"] as const;

export interface LiveLine {
  id: string;
  label: string;
  unitPrice: string;
  unitCost: string;
  catalogPrice4: number;
  catalogCost4: number | null;
  priceValidUntil: string | null;
}

export interface PriceChange {
  lineId: string;
  label: string;
  oldPrice4: number;
  newPrice4: number;
  /** Écart de prix de vente en points de base (+250 = +2,5 %) */
  deltaBp: number;
  oldCost4: number | null;
  newCost4: number | null;
}

const toPrice4 = (v: string): number | null => {
  const t = v.replace(/\s/g, "");
  if (!t) return null;
  try {
    return Number(parseScaled(t, 4));
  } catch {
    return null;
  }
};

/** Lignes dont le prix ou le coût diffère du catalogue actuel. */
export function priceChanges(lines: LiveLine[]): PriceChange[] {
  return lines.flatMap((l) => {
    const oldPrice4 = toPrice4(l.unitPrice);
    const oldCost4 = toPrice4(l.unitCost);
    if (oldPrice4 === null || l.catalogPrice4 <= 0) return [];
    const priceMoved = Math.abs(oldPrice4 - l.catalogPrice4) >= 100; // au moins un centime
    const costMoved = l.catalogCost4 !== null && oldCost4 !== null && Math.abs(oldCost4 - l.catalogCost4) >= 100;
    if (!priceMoved && !costMoved) return [];
    return [
      {
        lineId: l.id,
        label: l.label,
        oldPrice4,
        newPrice4: l.catalogPrice4,
        deltaBp: oldPrice4 ? Math.round(((l.catalogPrice4 - oldPrice4) * 10000) / oldPrice4) : 0,
        oldCost4,
        newCost4: l.catalogCost4,
      },
    ];
  });
}

/** Lignes dont le prix fournisseur a dépassé sa date de validité : à reconfirmer avant d'envoyer. */
export function expiredPrices(lines: LiveLine[], today: string): string[] {
  return lines.filter((l) => l.priceValidUntil && l.priceValidUntil < today).map((l) => l.label);
}
