/**
 * Congés payés du bâtiment (fonctions pures) : jours ouvrés d'un mois, absences, droits acquis et
 * cotisation à la caisse, pour préparer la déclaration périodique.
 */

/** Durée légale d'un mois complet : 35 heures par semaine. */
export const FULL_MONTH_MINUTES = Math.round(151.67 * 60);
/** Jours ouvrables acquis pour un mois complet de travail. */
export const DAYS_PER_FULL_MONTH = 2.5;

export const isPeriod = (p: string) => /^\d{4}-(0[1-9]|1[0-2])$/.test(p);

const iso = (d: Date) => d.toISOString().slice(0, 10);

/** Dimanche de Pâques (calcul grégorien de Meeus). */
export function easter(year: number) {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(year, month - 1, day));
}

/** Jours fériés de métropole. */
export function publicHolidays(year: number): Set<string> {
  const e = easter(year);
  const plus = (n: number) => iso(new Date(e.getTime() + n * 86400000));
  return new Set([
    `${year}-01-01`,
    plus(1),
    `${year}-05-01`,
    `${year}-05-08`,
    plus(39),
    plus(50),
    `${year}-07-14`,
    `${year}-08-15`,
    `${year}-11-01`,
    `${year}-11-11`,
    `${year}-12-25`,
  ]);
}

/** Jours ouvrés (lundi au vendredi, hors fériés) d'une période AAAA-MM, éventuellement bornée. */
export function workingDays(period: string, from?: string, to?: string): string[] {
  const [y, m] = period.split("-").map(Number);
  const holidays = publicHolidays(y);
  const out: string[] = [];
  for (let d = new Date(Date.UTC(y, m - 1, 1)); d.getUTCMonth() === m - 1; d = new Date(d.getTime() + 86400000)) {
    const day = iso(d);
    const wd = d.getUTCDay();
    if (wd === 0 || wd === 6 || holidays.has(day)) continue;
    if ((from && day < from) || (to && day > to)) continue;
    out.push(day);
  }
  return out;
}

/** Jours ouvrés de la période couverts par des absences (sans double compte). */
export function absenceDays(period: string, absences: { start: string; end: string }[]) {
  const days = new Set<string>();
  for (const a of absences) for (const d of workingDays(period, a.start, a.end)) days.add(d);
  return days.size;
}

/** Jours de congés acquis sur le mois, au prorata des heures (2,5 jours ouvrables pour un mois complet). */
export function acquiredDays(minutes: number) {
  return Math.round(DAYS_PER_FULL_MONTH * Math.min(1, minutes / FULL_MONTH_MINUTES) * 10) / 10;
}

export const contributionCents = (grossCents: number, rateBp: number) => Math.round((grossCents * rateBp) / 10000);

/** Période précédente, AAAA-MM. */
export function previousPeriod(period: string) {
  const [y, m] = period.split("-").map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
}
