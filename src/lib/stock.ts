/**
 * Stock du dépôt et des véhicules (fonctions pures) : quantités par emplacement à partir des
 * mouvements, articles sous le seuil de réapprovisionnement, véhicules à recharger.
 */

export const DEPOT = "depot";

export const MOVE_KINDS = {
  entree: "Entrée (livraison, achat)",
  sortie: "Sortie vers un chantier",
  transfert: "Transfert",
  inventaire: "Inventaire",
} as const;
export type MoveKind = keyof typeof MOVE_KINDS;

export interface StockMove {
  itemId: string;
  location: string;
  qty: number;
}

/** Quantité de chaque article par emplacement. */
export function stockLevels(moves: readonly StockMove[]): Map<string, Map<string, number>> {
  const out = new Map<string, Map<string, number>>();
  for (const m of moves) {
    const byLoc = out.get(m.itemId) ?? new Map<string, number>();
    byLoc.set(m.location, round((byLoc.get(m.location) ?? 0) + m.qty));
    out.set(m.itemId, byLoc);
  }
  return out;
}

export const round = (n: number) => Math.round(n * 1000) / 1000;

export function qtyAt(levels: Map<string, Map<string, number>>, itemId: string, location: string) {
  return levels.get(itemId)?.get(location) ?? 0;
}

export interface StockItemRef {
  id: string;
  label: string;
  unit: string;
  minQty: number;
  reorderQty: number;
  supplier: string;
  unitCost4: number | null;
}

/**
 * Articles du dépôt au seuil ou en dessous. La quantité à commander est la quantité de
 * réapprovisionnement de l'article, ou de quoi remonter au double du seuil si elle n'est pas fixée.
 */
export function reorderList(items: readonly StockItemRef[], levels: Map<string, Map<string, number>>) {
  return items
    .filter((i) => i.minQty > 0 && qtyAt(levels, i.id, DEPOT) <= i.minQty)
    .map((item) => {
      const have = qtyAt(levels, item.id, DEPOT);
      const order = round(item.reorderQty > 0 ? Math.max(item.reorderQty, item.minQty - have) : item.minQty * 2 - have);
      return { item, have, order, costCents: item.unitCost4 == null ? null : Math.round((item.unitCost4 * order) / 100) };
    });
}

export interface KitLine {
  itemId: string;
  vehicleId: string;
  target: number;
}

/** Ce qu'il manque dans chaque véhicule par rapport à sa dotation, et ce que le dépôt peut fournir. */
export function refillList(kits: readonly KitLine[], levels: Map<string, Map<string, number>>) {
  return kits
    .map((k) => {
      const have = qtyAt(levels, k.itemId, k.vehicleId);
      const missing = round(k.target - have);
      return { ...k, have, missing, fromDepot: round(Math.max(0, Math.min(missing, qtyAt(levels, k.itemId, DEPOT)))) };
    })
    .filter((k) => k.missing > 0);
}

/** Valeur du stock au coût d'achat, en centimes, pour les articles dont le coût est connu. */
export function stockValueCents(items: readonly StockItemRef[], levels: Map<string, Map<string, number>>) {
  let total = 0;
  for (const i of items) {
    if (i.unitCost4 == null) continue;
    const qty = [...(levels.get(i.id)?.values() ?? [])].reduce((s, q) => s + Math.max(q, 0), 0);
    total += (i.unitCost4 * qty) / 100;
  }
  return Math.round(total);
}
