/**
 * Prise de rendez-vous de visite en ligne (fonctions pures) : créneaux proposés d'après les plages
 * de visite de l'entreprise, la durée d'une visite, le délai de prévenance et les créneaux déjà pris.
 * Les heures sont celles de Paris, changement d'heure compris.
 */

import { cleanHours, DAYS, type DayKey, type Hours } from "./business-listing";

export interface VisitSettings {
  enabled: boolean;
  hours: Hours;
  durationMin: number;
  noticeHours: number;
  horizonDays: number;
}

export const DURATIONS = [30, 45, 60, 90, 120];
export const NOTICES = [12, 24, 48, 72];
export const DEFAULT_VISIT_SETTINGS: VisitSettings = { enabled: false, hours: {}, durationMin: 60, noticeHours: 48, horizonDays: 21 };

export function readVisitSettings(raw: unknown): VisitSettings {
  const o = (raw ?? {}) as Record<string, unknown>;
  const pick = (v: unknown, allowed: number[], d: number) => (allowed.includes(Number(v)) ? Number(v) : d);
  return {
    enabled: o.enabled === true,
    hours: cleanHours(o.hours),
    durationMin: pick(o.durationMin, DURATIONS, DEFAULT_VISIT_SETTINGS.durationMin),
    noticeHours: pick(o.noticeHours, NOTICES, DEFAULT_VISIT_SETTINGS.noticeHours),
    horizonDays: Number.isInteger(o.horizonDays) && (o.horizonDays as number) >= 7 && (o.horizonDays as number) <= 60 ? (o.horizonDays as number) : 21,
  };
}

/** Décalage de Paris par rapport à UTC à cet instant, en minutes (60 l'hiver, 120 l'été). */
export function parisOffsetMinutes(at: Date): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Paris",
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(at);
  const get = (t: string) => Number(parts.find((p) => p.type === t)!.value);
  return Math.round((Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute")) - Math.floor(at.getTime() / 60000) * 60000) / 60000);
}

/** Instant correspondant à une date et une heure de Paris. */
export function parisToUtc(day: string, time: string): Date {
  const guess = new Date(`${day}T${time}:00Z`);
  let d = new Date(guess.getTime() - parisOffsetMinutes(guess) * 60000);
  const again = parisOffsetMinutes(d);
  if (again * 60000 !== guess.getTime() - d.getTime()) d = new Date(guess.getTime() - again * 60000);
  return d;
}

const addDays = (iso: string, n: number) => new Date(Date.parse(`${iso}T12:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
const minutes = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
const dayKey = (iso: string): DayKey => DAYS[(new Date(`${iso}T12:00:00Z`).getUTCDay() + 6) % 7].key;

export interface Slot {
  day: string;
  time: string;
  /** Début en UTC, format ISO */
  start: string;
}

/** Créneaux libres, du plus proche au plus lointain. */
export function availableSlots(
  s: VisitSettings,
  now: Date,
  taken: readonly { start: Date; end: Date }[],
  blockedDays: ReadonlySet<string> = new Set(),
): Slot[] {
  const out: Slot[] = [];
  const earliest = now.getTime() + s.noticeHours * 3600000;
  const today = new Intl.DateTimeFormat("fr-CA", { timeZone: "Europe/Paris" }).format(now);
  for (let i = 0; i <= s.horizonDays; i++) {
    const day = addDays(today, i);
    if (blockedDays.has(day)) continue;
    for (const [a, b] of s.hours[dayKey(day)] ?? []) {
      for (let m = minutes(a); m + s.durationMin <= minutes(b); m += s.durationMin) {
        const start = parisToUtc(day, hhmm(m));
        const end = start.getTime() + s.durationMin * 60000;
        if (start.getTime() < earliest) continue;
        if (taken.some((t) => t.start.getTime() < end && t.end.getTime() > start.getTime())) continue;
        out.push({ day, time: hhmm(m), start: start.toISOString() });
      }
    }
  }
  return out;
}

/** « mardi 14 octobre à 17:30 » */
export function slotLabel(start: Date): string {
  const day = start.toLocaleDateString("fr-FR", { timeZone: "Europe/Paris", weekday: "long", day: "numeric", month: "long" });
  const time = start.toLocaleTimeString("fr-FR", { timeZone: "Europe/Paris", hour: "2-digit", minute: "2-digit" });
  return `${day} à ${time}`;
}
