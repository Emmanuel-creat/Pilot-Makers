/**
 * Contrôles périodiques du parc : véhicules (contrôle technique, entretien, assurance) et outillage
 * (vérifications générales périodiques, contrôle électrique). Les périodicités proposées sont les
 * plus courantes et restent modifiables.
 */

export const CHECK_PRESETS: { label: string; months: number; for: "vehicle" | "tool" }[] = [
  { label: "Contrôle technique", months: 24, for: "vehicle" },
  { label: "Entretien et vidange", months: 12, for: "vehicle" },
  { label: "Assurance", months: 12, for: "vehicle" },
  { label: "Pneus et freins", months: 12, for: "vehicle" },
  { label: "Vérification générale périodique", months: 6, for: "tool" },
  { label: "Contrôle électrique", months: 12, for: "tool" },
  { label: "Vérification des échafaudages", months: 3, for: "tool" },
  { label: "Vérification des extincteurs", months: 12, for: "tool" },
];

/** Jours avant l'échéance à partir desquels un contrôle est à prévoir. */
export const CHECK_SOON_DAYS = 30;
/** Rappel envoyé quand l'échéance est dans ce délai. */
export const CHECK_REMINDER_DAYS = 15;

export type CheckState = "a_jour" | "a_prevoir" | "en_retard" | "sans_echeance";

export const CHECK_STATES: Record<CheckState, string> = {
  a_jour: "À jour",
  a_prevoir: "À prévoir",
  en_retard: "En retard",
  sans_echeance: "Sans échéance",
};

const utc = (iso: string) => Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10));

export function addMonths(iso: string, months: number): string {
  const y = +iso.slice(0, 4);
  const m = +iso.slice(5, 7) - 1 + months;
  const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return new Date(Date.UTC(y, m, Math.min(+iso.slice(8, 10), last))).toISOString().slice(0, 10);
}

export function checkState(dueDate: string | null, today: string): CheckState {
  if (!dueDate) return "sans_echeance";
  const left = Math.round((utc(dueDate) - utc(today)) / 86400000);
  return left < 0 ? "en_retard" : left <= CHECK_SOON_DAYS ? "a_prevoir" : "a_jour";
}

/** Prochaine échéance une fois le contrôle fait : selon la périodicité, sinon plus d'échéance. */
export function nextDue(doneOn: string, intervalMonths: number | null): string | null {
  return intervalMonths ? addMonths(doneOn, intervalMonths) : null;
}
