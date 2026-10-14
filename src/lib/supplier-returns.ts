/**
 * Livraisons et retours fournisseurs (fonctions pures) : écarts d'une livraison, quantité encore
 * retournable et avoir attendu, frais de reprise déduits.
 */

export const RETURN_REASONS = {
  casse: "Casse à la livraison",
  erreur: "Erreur de référence ou de quantité",
  defaut: "Défaut de fabrication",
  surplus: "Surplus non utilisé",
} as const;
export type ReturnReason = keyof typeof RETURN_REASONS;

export const RETURN_STATUSES = {
  a_reprendre: "À reprendre",
  repris: "Repris, avoir attendu",
  avoir_recu: "Avoir reçu",
} as const;
export type ReturnStatus = keyof typeof RETURN_STATUSES;

/** Les fournisseurs ne retiennent des frais de reprise que sur un surplus : casse, erreur et défaut sont à leur charge. */
export const restockingApplies = (reason: ReturnReason) => reason === "surplus";

export interface DeliveredLine {
  lineId: string;
  label: string;
  unit: string;
  quantityMilli: number;
}

/** Quantités apportées par une livraison : différence entre le cumul reçu avant et après. */
export function deliveryDeltas(before: Record<string, number>, after: Record<string, number>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [id, q] of Object.entries(after)) {
    const d = q - (before[id] ?? 0);
    if (d !== 0) out[id] = d;
  }
  return out;
}

/** Ce qui peut encore partir en retour : reçu moins déjà retourné, jamais négatif. */
export const returnableMilli = (receivedMilli: number, returnedMilli: number) => Math.max(0, receivedMilli - returnedMilli);

/** Avoir attendu pour un retour, en centimes HT : valeur de la marchandise moins les frais de reprise. */
export function expectedCreditCents(quantityMilli: number, unitCostCents: number, restockingBp = 0) {
  const value = Math.round((quantityMilli * unitCostCents) / 1000);
  return value - Math.round((value * restockingBp) / 10000);
}

/** Écart entre l'avoir reçu et l'avoir attendu (négatif : le fournisseur a crédité moins). */
export const creditGap = (receivedCents: number, expectedCents: number) => receivedCents - expectedCents;
