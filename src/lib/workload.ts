/**
 * Saisonnalité de l'activité et prévision de charge de l'équipe (fonctions pures).
 *
 * Saisonnalité : pour chaque mois de l'année, le montant signé moyen comparé à la moyenne de tous
 * les mois (100 = un mois ordinaire). Prévision : semaine par semaine, les jours de travail
 * disponibles (équipe moins absences) face aux jours déjà planifiés, puis le reste à faire des
 * chantiers signés mais pas encore planifiés, versé dans les premières semaines libres.
 */

export const MONTH_NAMES = ["Janvier", "Février", "Mars", "Avril", "Mai", "Juin", "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"];
/** Durée d'une journée de travail pour convertir des heures de main-d'œuvre en jours. */
export const HOURS_PER_DAY = 7;

/** Indice saisonnier par mois civil (0 = janvier), null pour un mois jamais observé ; null partout sans au moins 12 mois. */
export function seasonality(rows: readonly { month: string; signedHtCents: number }[]): (number | null)[] {
  const out: (number | null)[] = Array(12).fill(null);
  if (rows.length < 12) return out;
  const sums = Array(12).fill(0);
  const counts = Array(12).fill(0);
  for (const r of rows) {
    const m = Number(r.month.slice(5, 7)) - 1;
    sums[m] += r.signedHtCents;
    counts[m]++;
  }
  const total = rows.reduce((t, r) => t + r.signedHtCents, 0);
  if (total <= 0) return out;
  const mean = total / rows.length;
  return out.map((_, m) => (counts[m] ? Math.round((sums[m] / counts[m] / mean) * 100) : null));
}

/** Mois les plus forts et les plus calmes (indice au-dessus de 120, en dessous de 80). */
export function peaks(index: readonly (number | null)[]): { high: string[]; low: string[] } {
  return {
    high: index.flatMap((v, m) => (v !== null && v >= 120 ? [MONTH_NAMES[m]] : [])),
    low: index.flatMap((v, m) => (v !== null && v <= 80 ? [MONTH_NAMES[m]] : [])),
  };
}

const parseQty = (q: string) => {
  const n = Number(q.replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(n) && n > 0 ? n : 0;
};

/** Jours de main-d'œuvre restant à faire d'après les tâches du chantier (heures ou jours), au dixième. */
export function remainingLabourDays(tasks: readonly { nature: string; quantity: string; unit: string; progressBp: number }[]): number {
  let days = 0;
  for (const t of tasks) {
    if (t.nature !== "main_oeuvre") continue;
    const unit = t.unit.trim().toLowerCase();
    const qty = parseQty(t.quantity);
    const left = Math.max(0, 1 - t.progressBp / 10000);
    if (unit === "h") days += (qty / HOURS_PER_DAY) * left;
    else if (unit === "j") days += qty * left;
  }
  return Math.round(days * 10) / 10;
}

export interface WeekLoad {
  monday: string;
  capacityDays: number;
  plannedDays: number;
  /** Reste à faire des chantiers non planifiés, placé dans cette semaine */
  backlogDays: number;
  /** Charge totale en pourcentage de la capacité, null sans capacité */
  loadPercent: number | null;
}

/** Verse le reste à faire dans les semaines dans l'ordre, sans dépasser la capacité libre de chacune. */
export function forecast(weeks: readonly { monday: string; capacityDays: number; plannedDays: number }[], backlogDays: number) {
  let left = backlogDays;
  const out: WeekLoad[] = weeks.map((w) => {
    const free = Math.max(0, w.capacityDays - w.plannedDays);
    const put = Math.min(free, left);
    left = Math.round((left - put) * 10) / 10;
    const total = w.plannedDays + put;
    return {
      ...w,
      backlogDays: Math.round(put * 10) / 10,
      loadPercent: w.capacityDays ? Math.round((total * 100) / w.capacityDays) : null,
    };
  });
  const firstFree = out.find((w) => w.loadPercent !== null && w.loadPercent < 80)?.monday ?? null;
  return { weeks: out, overflowDays: left, firstFree };
}
