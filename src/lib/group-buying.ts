/**
 * Achats groupés entre artisans d'un même réseau.
 *
 * Un membre ouvre un achat auprès d'un fournisseur avec son prix de base et des paliers dégressifs
 * (à partir de telle quantité, tel prix unitaire). Chacun engage sa quantité avant la date limite ;
 * le total atteint fixe le palier, donc le prix de tous.
 */

import { z } from "zod";
import { priceCents } from "@/lib/network-board";

export interface Tier {
  minQty: number;
  priceCents: number;
}

export const PURCHASE_STATUSES = { ouverte: "Ouvert aux engagements", close: "Clos", annulee: "Annulé" } as const;
export type PurchaseStatus = keyof typeof PURCHASE_STATUSES;
export const MAX_TIERS = 4;

/** Paliers saisis : quantités croissantes, prix décroissants et inférieurs au prix de base. Lignes vides ignorées. */
export function parseTiers(rows: { minQty: string; price: string }[], baseCents: number): { tiers: Tier[]; error: string | null } {
  const tiers: Tier[] = [];
  for (const [i, r] of rows.entries()) {
    const q = r.minQty.trim();
    const p = r.price.trim();
    if (!q && !p) continue;
    const n = i + 1;
    if (!/^\d{1,7}$/.test(q) || Number(q) < 2) return { tiers: [], error: `Palier ${n} : quantité minimale entière, 2 au moins` };
    const cents = priceCents(p);
    if (typeof cents !== "number" || cents <= 0) return { tiers: [], error: `Palier ${n} : prix unitaire invalide` };
    const prev = tiers[tiers.length - 1];
    if (cents >= (prev?.priceCents ?? baseCents)) return { tiers: [], error: `Palier ${n} : le prix doit baisser par rapport au palier précédent` };
    if (prev && Number(q) <= prev.minQty) return { tiers: [], error: `Palier ${n} : la quantité doit dépasser celle du palier précédent` };
    tiers.push({ minQty: Number(q), priceCents: cents });
  }
  if (!tiers.length) return { tiers: [], error: "Indiquez au moins un palier de prix dégressif" };
  if (tiers.length > MAX_TIERS) return { tiers: [], error: `${MAX_TIERS} paliers au plus` };
  return { tiers, error: null };
}

/** Palier atteint par la quantité totale engagée, ou null si aucun. */
export function reachedTier(tiers: Tier[], total: number): Tier | null {
  return [...tiers].reverse().find((t) => total >= t.minQty) ?? null;
}

/** Palier suivant et quantité qui manque pour l'atteindre. */
export function nextTier(tiers: Tier[], total: number): { tier: Tier; missing: number } | null {
  const t = tiers.find((x) => total < x.minQty);
  return t ? { tier: t, missing: t.minQty - total } : null;
}

/** Prix unitaire courant et économie d'un participant par rapport au prix de base. */
export function priceFor(baseCents: number, tiers: Tier[], total: number, quantity: number) {
  const unitCents = reachedTier(tiers, total)?.priceCents ?? baseCents;
  return { unitCents, totalCents: unitCents * quantity, savingCents: (baseCents - unitCents) * quantity };
}

export const purchaseSchema = z.object({
  title: z.string().trim().min(3, "Indiquez le produit acheté").max(160),
  supplier: z.string().trim().min(2, "Indiquez le fournisseur").max(160),
  unit: z.string().trim().min(1, "Indiquez l'unité").max(20),
  deadline: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Indiquez la date limite des engagements"),
});
