/**
 * Comparateur de prix entre fournisseurs (fonctions pures) : rapprochement d'un même produit d'un tarif à
 * l'autre, meilleure offre et économie annuelle estimée.
 */

import { words } from "./similar-quotes";

export interface Offer {
  id: string;
  supplier: string;
  reference: string;
  ean: string;
  label: string;
  unit: string;
  net4: number;
}

/** Même produit : même code EAN, sinon mêmes mots de désignation et même unité. */
export function productKey(p: { ean?: string; label: string; unit: string }) {
  const ean = (p.ean ?? "").replace(/\D/g, "");
  if (ean.length >= 8) return `ean:${ean}`;
  const w = [...new Set(words(p.label))].sort().join(" ");
  return w ? `lib:${w}|${p.unit.trim().toLowerCase()}` : "";
}

/** Offres des autres fournisseurs, la moins chère en premier, avec l'écart au coût actuel en points de base. */
export function rankOffers(currentSupplier: string, currentCost4: number | null, offers: Offer[]) {
  const own = currentSupplier.trim().toLowerCase();
  // Une offre par fournisseur : la moins chère si un tarif contient plusieurs références du même produit.
  const best = new Map<string, Offer>();
  for (const o of offers) {
    const k = o.supplier.trim().toLowerCase();
    if (k === own || o.net4 <= 0) continue;
    const cur = best.get(k);
    if (!cur || o.net4 < cur.net4) best.set(k, o);
  }
  return [...best.values()]
    .sort((a, b) => a.net4 - b.net4)
    .map((o) => ({ ...o, gapBp: currentCost4 ? Math.round(((o.net4 - currentCost4) * 10000) / currentCost4) : null }));
}

/** Économie sur un an, en centimes, si les quantités achetées restent les mêmes. */
export function annualSavingCents(quantityMilli: number, currentCost4: number | null, offerCost4: number) {
  if (!currentCost4 || offerCost4 >= currentCost4 || quantityMilli <= 0) return 0;
  return Math.round(((currentCost4 - offerCost4) * quantityMilli) / 1000 / 100);
}
