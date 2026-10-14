/**
 * Estimation de la durée d'un chantier et de l'équipe nécessaire (fonctions pures), à partir des lignes de
 * main-d'oeuvre du devis : temps unitaire du catalogue, quantité en heures ou en jours, ou coût de la ligne
 * rapporté au coût horaire.
 */

/** Journée de travail retenue (35 heures sur 5 jours). */
export const HOURS_PER_DAY = 7;
/** Au-delà, on propose d'étoffer l'équipe. */
export const TARGET_DAYS = 10;
export const MAX_CREW = 4;

export type DurationMethod = "catalogue" | "unite" | "cout" | "prix" | "inconnue";
export const DURATION_METHODS: Record<DurationMethod, string> = {
  catalogue: "temps unitaire du catalogue",
  unite: "quantité exprimée en temps",
  cout: "coût de la ligne et coût horaire",
  prix: "prix de la ligne et taux horaire de vente",
  inconnue: "temps non estimable",
};

export interface LaborLine {
  label: string;
  quantityMilli: number;
  unit: string;
  /** Temps par unité, venu de l'article du catalogue */
  minutesPerUnit: number | null;
  /** Coût total de la ligne (main-d'oeuvre), en centimes */
  costCents: number;
  /** Coût horaire de référence (article ou taux de l'entreprise), en centimes */
  hourlyCostCents: number | null;
  /** Montant HT de la ligne, en centimes */
  netCents: number;
  /** Taux horaire de vente moyen de l'entreprise, en centimes */
  hourlyPriceCents: number | null;
}

const HOUR_UNITS = new Set(["h", "heure", "heures", "hr", "hrs"]);
const DAY_UNITS = new Set(["j", "jour", "jours", "jr", "jrs", "journée", "journee", "journées", "journees"]);

export function lineMinutes(l: LaborLine): { minutes: number; method: DurationMethod } {
  const qty = l.quantityMilli / 1000;
  const unit = l.unit.trim().toLowerCase().replace(/\.$/, "");
  if (l.minutesPerUnit && l.minutesPerUnit > 0) return { minutes: Math.round(qty * l.minutesPerUnit), method: "catalogue" };
  if (HOUR_UNITS.has(unit)) return { minutes: Math.round(qty * 60), method: "unite" };
  if (DAY_UNITS.has(unit)) return { minutes: Math.round(qty * HOURS_PER_DAY * 60), method: "unite" };
  if (l.costCents > 0 && l.hourlyCostCents) return { minutes: Math.round((l.costCents * 60) / l.hourlyCostCents), method: "cout" };
  if (l.netCents > 0 && l.hourlyPriceCents) return { minutes: Math.round((l.netCents * 60) / l.hourlyPriceCents), method: "prix" };
  return { minutes: 0, method: "inconnue" };
}

/** Jours ouvrés pour une équipe donnée, arrondis à la demi-journée supérieure. */
export function workingDays(minutes: number, crew: number, hoursPerDay = HOURS_PER_DAY) {
  if (minutes <= 0) return 0;
  return Math.ceil((minutes / (crew * hoursPerDay * 60)) * 2) / 2;
}

/**
 * Équipe conseillée : la plus petite qui tient dans l'objectif de jours, sans dépasser l'effectif de
 * l'entreprise. Une personne seule suffit pour un chantier de trois jours ou moins.
 */
export function recommendCrew(minutes: number, teamSize: number, targetDays = TARGET_DAYS) {
  const max = Math.max(1, Math.min(MAX_CREW, teamSize));
  if (workingDays(minutes, 1) <= 3) return 1;
  for (let crew = 1; crew <= max; crew++) if (workingDays(minutes, crew) <= targetDays) return crew;
  return max;
}

const plural = (n: number, word: string) => `${String(n).replace(".", ",")} ${word}${n > 1 ? "s" : ""}`;

export function estimateDuration(lines: LaborLine[], teamSize = 1) {
  const detail = lines.map((l) => ({ label: l.label, ...lineMinutes(l) }));
  const minutes = detail.reduce((a, l) => a + l.minutes, 0);
  const crew = recommendCrew(minutes, teamSize);
  const days = workingDays(minutes, crew);
  const options = Array.from({ length: Math.max(1, Math.min(MAX_CREW, Math.max(teamSize, crew))) }, (_, i) => ({
    crew: i + 1,
    days: workingDays(minutes, i + 1),
  }));
  const text = minutes <= 0 ? "" : `${plural(days, "jour")} ouvré${days > 1 ? "s" : ""}, ${plural(crew, "personne")}`;
  return {
    minutes,
    hours: Math.round(minutes / 6) / 10,
    crew,
    days,
    options,
    text,
    detail,
    unknown: detail.filter((l) => l.method === "inconnue").map((l) => l.label),
  };
}
