/** Calculs des feuilles de temps, sans dépendance serveur (utilisables à l'écran). */

import { addDays, mondayOf } from "./planning-dates";

/** Durée légale hebdomadaire et seuil des heures supplémentaires majorées à 50 %. */
export const WEEKLY_LEGAL_MINUTES = 35 * 60;
export const WEEKLY_HS25_LIMIT_MINUTES = 43 * 60;

/** Durée saisie : « 7:30 », « 7h30 », « 7 h », « 7,5 » ou « 450 min ». Renvoie des minutes, ou null si illisible. */
export function parseDuration(input: string): number | null {
  const s = input.trim().toLowerCase().replace(/\s+/g, "");
  if (!s) return null;
  let m: RegExpExecArray | null;
  if ((m = /^(\d{1,2})[:h](\d{1,2})?$/.exec(s))) {
    const min = Number(m[2] ?? 0);
    return min < 60 ? Number(m[1]) * 60 + min : null;
  }
  if ((m = /^(\d{1,4})min$/.exec(s))) return Number(m[1]);
  if ((m = /^(\d{1,2})(?:[.,](\d{1,2}))?$/.exec(s))) return Math.round(Number(`${m[1]}.${m[2] ?? 0}`) * 60);
  return null;
}

export function formatMinutes(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h} h ${String(m).padStart(2, "0")}` : `${h} h`;
}

/** Heures décimales pour un tableur (7,50). */
export function decimalHours(min: number): string {
  return (min / 60).toFixed(2).replace(".", ",");
}

export interface DayClass {
  normal: number;
  hs25: number;
  hs50: number;
}

/**
 * Répartit les minutes de chaque jour entre heures normales, supplémentaires à 25 % (de la 36e à la 43e heure
 * de la semaine) et à 50 % (au-delà), dans l'ordre chronologique de la semaine civile (lundi au dimanche).
 */
export function classifyDays(days: Record<string, number>): Record<string, DayClass> {
  const out: Record<string, DayClass> = {};
  const weeks = new Map<string, string[]>();
  for (const d of Object.keys(days).sort()) {
    const w = mondayOf(d);
    weeks.set(w, [...(weeks.get(w) ?? []), d]);
  }
  for (const dates of weeks.values()) {
    let cumul = 0;
    for (const d of dates) {
      const min = days[d];
      const normal = Math.max(0, Math.min(min, WEEKLY_LEGAL_MINUTES - cumul));
      const hs25 = Math.max(0, Math.min(min - normal, WEEKLY_HS25_LIMIT_MINUTES - Math.max(cumul, WEEKLY_LEGAL_MINUTES)));
      out[d] = { normal, hs25, hs50: min - normal - hs25 };
      cumul += min;
    }
  }
  return out;
}

export function weekDays(monday: string): string[] {
  return Array.from({ length: 7 }, (_, i) => addDays(monday, i));
}
