/**
 * Retards de chantier : l'avancement saisi est comparé au temps écoulé entre le début et la fin prévus,
 * la fin probable est estimée d'après le reste à faire, et le client peut être prévenu de la nouvelle date.
 */

import { workingDays } from "@/lib/balance";
import { addDays, isWeekend } from "@/lib/services/planning-dates";

export type DelayState = "a_l_heure" | "en_retard" | "depasse";

export const DELAY_STATES: Record<DelayState, string> = {
  a_l_heure: "Dans les temps",
  en_retard: "En retard",
  depasse: "Date de fin dépassée",
};

/** Retard, en jours ouvrés, à partir duquel un chantier est signalé. */
export const LATE_DAYS = 2;

export interface DelayInput {
  start: string;
  end: string;
  today: string;
  /** Avancement pondéré entre 0 et 1 */
  progress: number;
  /** Jours de main-d'œuvre restants d'après les tâches, 0 si inconnus */
  remainingLabourDays: number;
  /** Personnes affectées aujourd'hui (1 au moins) */
  crew: number;
}

export interface DelayAssessment {
  state: DelayState;
  expected: number;
  progress: number;
  projectedEnd: string;
  lateDays: number;
  /** Fin estimée avec une personne de plus, si cela fait gagner au moins un jour */
  withOneMore: string | null;
}

/** Jour ouvré atteint après n jours ouvrés de travail à partir de `from` inclus. */
export function addWorkingDays(from: string, n: number): string {
  let d = from;
  while (isWeekend(d)) d = addDays(d, 1);
  let left = Math.max(1, Math.ceil(n));
  for (;;) {
    if (!isWeekend(d)) left--;
    if (left <= 0) return d;
    d = addDays(d, 1);
  }
}

function remainingWorkDays(i: DelayInput, crew: number): number {
  if (i.progress >= 1) return 0;
  if (i.remainingLabourDays > 0) return i.remainingLabourDays / crew;
  const elapsed = workingDays(i.start, i.today < i.start ? i.start : i.today).length;
  if (i.progress > 0) return (elapsed * (1 - i.progress)) / i.progress;
  return Math.max(1, workingDays(i.today, i.end).length);
}

export function assessDelay(i: DelayInput): DelayAssessment {
  const total = Math.max(1, workingDays(i.start, i.end).length);
  const elapsed = i.today < i.start ? 0 : workingDays(i.start, i.today < i.end ? addDays(i.today, -1) : i.end).length;
  const expected = Math.min(1, elapsed / total);
  const from = i.today < i.start ? i.start : i.today;
  const crew = Math.max(1, i.crew);
  const left = remainingWorkDays(i, crew);
  const projectedEnd = left <= 0 ? i.end : addWorkingDays(from, left);
  const lateDays = projectedEnd > i.end ? workingDays(addDays(i.end, 1), projectedEnd).length : 0;
  const state: DelayState = i.today > i.end && i.progress < 1 ? "depasse" : lateDays >= LATE_DAYS ? "en_retard" : "a_l_heure";
  let withOneMore: string | null = null;
  if (state !== "a_l_heure" && i.remainingLabourDays > 0) {
    const faster = addWorkingDays(from, remainingWorkDays(i, crew + 1));
    if (faster < projectedEnd) withOneMore = faster;
  }
  return { state, expected, progress: i.progress, projectedEnd, lateDays, withOneMore };
}

const frDate = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });

/** E-mail au client : nouvelle date de fin, sans jargon. */
export function delayMail(v: { title: string; address: string; plannedEnd: string; newEnd: string; orgName: string; orgPhone: string }) {
  return {
    subject: `Vos travaux : nouvelle date de fin prévue`,
    body: [
      "Bonjour,",
      "",
      `Les travaux « ${v.title} »${v.address ? ` au ${v.address}` : ""} prennent plus de temps que prévu.`,
      `Nous prévoyons désormais de terminer le ${frDate(v.newEnd)}, au lieu du ${frDate(v.plannedEnd)}.`,
      "Nous vous tiendrons informé si cette date évolue.",
      "",
      `Pour toute question, répondez à ce message${v.orgPhone ? ` ou appelez le ${v.orgPhone}` : ""}.`,
      "",
      v.orgName,
    ].join("\n"),
  };
}
