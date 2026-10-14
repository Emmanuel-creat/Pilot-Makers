/**
 * Équilibre de charge de l'équipe : taux d'occupation de chacun sur les semaines à venir, alertes de surcharge
 * (doubles affectations, travail pendant une absence, série trop longue sans respiration) et propositions
 * de réaffectation vers la personne la moins chargée et libre sur toute la période.
 */

import { addDays, isWeekend } from "@/lib/services/planning-dates";

export interface BalancePerson {
  id: string;
  name: string;
  /** Jours ouvrés d'absence sur l'horizon */
  absent: ReadonlySet<string>;
}

export interface BalanceAssignment {
  id: string;
  jobTitle: string;
  userId: string;
  start: string;
  end: string;
}

export type LoadStatus = "surcharge" | "chargé" | "équilibré" | "disponible";

export interface PersonLoad {
  id: string;
  name: string;
  capacityDays: number;
  plannedDays: number;
  rate: number;
  doubleDays: number;
  absentBusyDays: number;
  longestStreak: number;
  status: LoadStatus;
  reasons: string[];
}

export interface Suggestion {
  assignmentId: string;
  jobTitle: string;
  fromId: string;
  fromName: string;
  toId: string;
  toName: string;
  start: string;
  end: string;
  days: number;
}

/** Série de jours ouvrés consécutifs au-delà de laquelle une personne est signalée. */
export const MAX_STREAK = 15;

export function workingDays(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) if (!isWeekend(d)) out.push(d);
  return out;
}

function occupancy(days: string[], assignments: readonly BalanceAssignment[]) {
  const count = new Map<string, number>();
  for (const a of assignments) for (const d of days) if (d >= a.start && d <= a.end) count.set(`${a.userId}|${d}`, (count.get(`${a.userId}|${d}`) ?? 0) + 1);
  return count;
}

export function personLoads(days: string[], people: readonly BalancePerson[], assignments: readonly BalanceAssignment[]): PersonLoad[] {
  const count = occupancy(days, assignments);
  return people.map((p) => {
    let capacityDays = 0;
    let plannedDays = 0;
    let doubleDays = 0;
    let absentBusyDays = 0;
    let streak = 0;
    let longestStreak = 0;
    for (const d of days) {
      const n = count.get(`${p.id}|${d}`) ?? 0;
      if (p.absent.has(d)) {
        if (n) absentBusyDays++;
        streak = 0;
        continue;
      }
      capacityDays++;
      if (n) {
        plannedDays++;
        streak++;
        longestStreak = Math.max(longestStreak, streak);
      } else streak = 0;
      if (n > 1) doubleDays++;
    }
    const rate = capacityDays ? plannedDays / capacityDays : 0;
    const reasons: string[] = [];
    if (doubleDays) reasons.push(`${doubleDays} jour${doubleDays > 1 ? "s" : ""} sur deux chantiers`);
    if (absentBusyDays) reasons.push(`${absentBusyDays} jour${absentBusyDays > 1 ? "s" : ""} affecté${absentBusyDays > 1 ? "s" : ""} pendant une absence`);
    if (longestStreak >= MAX_STREAK) reasons.push(`${longestStreak} jours ouvrés d'affilée sans pause`);
    if (capacityDays && rate >= 0.95) reasons.push("planning plein");
    const status: LoadStatus = reasons.length ? "surcharge" : rate >= 0.8 ? "chargé" : rate < 0.5 ? "disponible" : "équilibré";
    return { id: p.id, name: p.name, capacityDays, plannedDays, rate, doubleDays, absentBusyDays, longestStreak, status, reasons };
  });
}

/** Écart entre la personne la plus chargée et la moins chargée, en points de taux. */
export function spread(loads: readonly PersonLoad[]): number {
  const rates = loads.filter((l) => l.capacityDays > 0).map((l) => l.rate);
  return rates.length > 1 ? Math.max(...rates) - Math.min(...rates) : 0;
}

/**
 * Propositions de réaffectation : pour chaque personne en surcharge, les affectations à venir sont proposées
 * à la personne la moins chargée qui est présente et libre tous les jours ouvrés de la période.
 */
export function suggestions(
  days: string[],
  people: readonly BalancePerson[],
  assignments: readonly BalanceAssignment[],
  today: string,
  limit = 5,
): Suggestion[] {
  const sim = assignments.map((a) => ({ ...a }));
  const out: Suggestion[] = [];
  const names = new Map(people.map((p) => [p.id, p.name]));
  for (let round = 0; round < limit; round++) {
    const loads = personLoads(days, people, sim);
    const over = loads.filter((l) => l.status === "surcharge").sort((a, b) => b.rate - a.rate || b.doubleDays - a.doubleDays);
    let moved = false;
    for (const o of over) {
      const count = occupancy(days, sim);
      const mine = sim
        .filter((a) => a.userId === o.id && a.start >= today && !out.some((s) => s.assignmentId === a.id))
        .sort((a, b) => {
          const dbl = (x: BalanceAssignment) => workingDays(x.start, x.end).some((d) => (count.get(`${o.id}|${d}`) ?? 0) > 1);
          return Number(dbl(b)) - Number(dbl(a)) || a.start.localeCompare(b.start);
        });
      for (const a of mine) {
        const span = workingDays(a.start, a.end);
        if (!span.length) continue;
        const target = loads
          .filter((l) => l.id !== o.id && l.status !== "surcharge" && l.rate < o.rate)
          .filter((l) => span.every((d) => !people.find((p) => p.id === l.id)!.absent.has(d) && !count.get(`${l.id}|${d}`)))
          .sort((x, y) => x.rate - y.rate)[0];
        if (!target) continue;
        out.push({
          assignmentId: a.id,
          jobTitle: a.jobTitle,
          fromId: o.id,
          fromName: names.get(o.id) ?? "",
          toId: target.id,
          toName: target.name,
          start: a.start,
          end: a.end,
          days: span.length,
        });
        a.userId = target.id;
        moved = true;
        break;
      }
      if (moved) break;
    }
    if (!moved) break;
  }
  return out;
}
