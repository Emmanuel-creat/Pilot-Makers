/**
 * Livraisons juste à temps : la livraison d'une commande arrive le jour ouvré qui précède le début des travaux
 * sur le chantier. Trop tôt, le matériel encombre le chantier ou se fait voler ; trop tard, l'équipe attend.
 */

import { publicHolidays } from "@/lib/leave-fund";

/** Jours de stockage sur chantier tolérés avant le début des travaux */
export const EARLY_MARGIN = 3;

const holidaysCache = new Map<number, Set<string>>();
const holidays = (y: number) => {
  if (!holidaysCache.has(y)) holidaysCache.set(y, publicHolidays(y));
  return holidaysCache.get(y)!;
};

export function isWorkday(iso: string): boolean {
  const d = new Date(`${iso}T12:00:00Z`);
  const wd = d.getUTCDay();
  return wd !== 0 && wd !== 6 && !holidays(d.getUTCFullYear()).has(iso);
}

const shift = (iso: string, n: number) => new Date(Date.parse(`${iso}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

/** n-ième jour ouvré avant (n négatif) ou après (n positif) la date. */
export function workdayOffset(iso: string, n: number): string {
  let d = iso;
  let left = Math.abs(n);
  while (left > 0) {
    d = shift(d, Math.sign(n));
    if (isWorkday(d)) left--;
  }
  return d;
}

/** Jours ouvrés entre deux dates (b exclu), négatif si b est avant a. */
export function workdaysBetween(a: string, b: string): number {
  if (a === b) return 0;
  const sign = a < b ? 1 : -1;
  let n = 0;
  for (let d = a; d !== b; d = shift(d, sign)) if (isWorkday(d)) n++;
  return n * sign;
}

export type DeliveryState = "ok" | "trop_tot" | "trop_tard" | "sans_date" | "sans_planning";

export interface DeliveryAdvice {
  state: DeliveryState;
  ideal: string | null;
  message: string;
}

const fr = (iso: string) => iso.split("-").reverse().join("/");

/** Conseil pour une commande : date idéale et écart avec la date demandée au fournisseur. */
export function deliveryAdvice(o: { deliveryDate: string | null; workStart: string | null; today: string }): DeliveryAdvice {
  if (!o.workStart) return { state: "sans_planning", ideal: null, message: "Chantier pas encore planifié : la livraison se calera sur le planning." };
  const tomorrow = workdayOffset(o.today, 1);
  const before = workdayOffset(o.workStart, -1);
  const ideal = before < tomorrow ? tomorrow : before;
  if (!o.deliveryDate) return { state: "sans_date", ideal, message: `Travaux le ${fr(o.workStart)} : demandez la livraison pour le ${fr(ideal)}.` };
  if (o.deliveryDate > o.workStart) {
    const late = workdaysBetween(o.workStart, o.deliveryDate);
    return {
      state: "trop_tard",
      ideal,
      message: `Livrée ${late} jour${late > 1 ? "s" : ""} ouvré${late > 1 ? "s" : ""} après le début des travaux : l'équipe attendra.`,
    };
  }
  const early = workdaysBetween(o.deliveryDate, o.workStart);
  if (early > EARLY_MARGIN)
    return {
      state: "trop_tot",
      ideal,
      message: `Livrée ${early} jours ouvrés avant les travaux : matériel stocké sur le chantier, risque de casse ou de vol.`,
    };
  return { state: "ok", ideal, message: "Livraison calée sur le planning." };
}
