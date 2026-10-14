/**
 * Planification automatique d'un chantier : première période de jours ouvrés où assez de personnes
 * compétentes sont libres (ni affectées ailleurs, ni absentes), en préférant les plus proches du chantier.
 */

import { publicHolidays } from "@/lib/leave-fund";
import { distanceKm, type GeoPoint } from "@/lib/map";

export interface Busy {
  start: string;
  end: string;
}

export interface Candidate {
  id: string;
  name: string;
  /** Qualification et habilitations en cours de validité, en minuscules */
  skills: string[];
  busy: Busy[];
  /** Dernier chantier connu avant la période, sinon le dépôt */
  from: GeoPoint | null;
}

export interface Proposal {
  start: string;
  end: string;
  days: string[];
  crew: { id: string; name: string; km: number | null }[];
  /** Personnes compétentes écartées faute de disponibilité sur cette période */
  skipped: number;
}

const iso = (d: Date) => d.toISOString().slice(0, 10);

/** Jours ouvrés (hors week-ends et jours fériés) à partir d'une date, au nombre demandé. */
export function workingDaysFrom(start: string, count: number): string[] {
  const out: string[] = [];
  const d = new Date(`${start}T12:00:00Z`);
  const holidays = new Map<number, Set<string>>();
  while (out.length < count) {
    const y = d.getUTCFullYear();
    if (!holidays.has(y)) holidays.set(y, publicHolidays(y));
    const day = d.getUTCDay();
    const s = iso(d);
    if (day !== 0 && day !== 6 && !holidays.get(y)!.has(s)) out.push(s);
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}

export function isFree(busy: Busy[], days: string[]): boolean {
  return days.every((day) => !busy.some((b) => b.start <= day && b.end >= day));
}

export function hasSkill(c: Pick<Candidate, "skills">, skill: string): boolean {
  const s = skill.trim().toLowerCase();
  return !s || c.skills.some((k) => k.includes(s));
}

/**
 * Cherche, jour ouvré après jour ouvré sur l'horizon donné, la première période où l'équipe demandée est libre.
 * À disponibilité égale, les personnes les plus proches du chantier passent d'abord.
 */
export function propose(
  candidates: Candidate[],
  need: { days: number; crew: number; skill: string; from: string },
  site: GeoPoint | null,
  horizonDays = 90,
): Proposal | null {
  const days = Math.max(1, Math.ceil(need.days));
  const crew = Math.max(1, need.crew);
  const able = candidates.filter((c) => hasSkill(c, need.skill));
  if (able.length < crew) return null;
  for (const start of workingDaysFrom(need.from, horizonDays)) {
    const window = workingDaysFrom(start, days);
    const free = able.filter((c) => isFree(c.busy, window));
    if (free.length < crew) continue;
    const ranked = free
      .map((c) => ({ id: c.id, name: c.name, km: site && c.from ? Math.round(distanceKm(c.from, site)) : null }))
      .sort((a, b) => (a.km ?? 1e9) - (b.km ?? 1e9) || a.name.localeCompare(b.name, "fr"));
    return { start: window[0], end: window[window.length - 1], days: window, crew: ranked.slice(0, crew), skipped: able.length - free.length };
  }
  return null;
}
