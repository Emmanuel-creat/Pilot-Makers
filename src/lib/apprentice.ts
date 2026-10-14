/**
 * Parcours de formation des apprentis : compétences à acquérir, niveaux de progression,
 * jours d'école en alternance et alerte de fin de contrat.
 */

export const SKILL_LEVELS = ["a_voir", "montre", "accompagne", "autonome"] as const;
export type SkillLevel = (typeof SKILL_LEVELS)[number];

export const LEVEL_LABELS: Record<SkillLevel, string> = {
  a_voir: "À voir",
  montre: "Montré par le tuteur",
  accompagne: "Fait avec le tuteur",
  autonome: "Autonome",
};

const LEVEL_POINTS: Record<SkillLevel, number> = { a_voir: 0, montre: 1, accompagne: 2, autonome: 3 };

export function isSkillLevel(v: unknown): v is SkillLevel {
  return typeof v === "string" && (SKILL_LEVELS as readonly string[]).includes(v);
}

/** Parcours proposé à la création, commun aux métiers du bâtiment ; chaque entreprise l'adapte. */
export const DEFAULT_PATH: { category: string; labels: string[] }[] = [
  {
    category: "Sécurité",
    labels: [
      "Porter les équipements de protection adaptés",
      "Baliser et protéger la zone de travail",
      "Travailler en hauteur en sécurité",
      "Gestes et postures",
    ],
  },
  {
    category: "Organisation du chantier",
    labels: ["Lire un plan simple", "Préparer son poste et son matériel", "Trier et évacuer les déchets", "Nettoyer et ranger en fin de journée"],
  },
  {
    category: "Gestes du métier",
    labels: ["Utiliser l'outillage à main", "Utiliser l'outillage électroportatif", "Prendre des cotes et tracer", "Mettre en oeuvre les matériaux courants"],
  },
  {
    category: "Relation client",
    labels: ["Se présenter chez le client", "Respecter les lieux et le voisinage", "Rendre compte au tuteur"],
  },
];

export interface SkillProgress {
  total: number;
  autonomous: number;
  started: number;
  /** Avancement pondéré par niveau, de 0 à 100 */
  percent: number;
}

export function progress(levels: SkillLevel[]): SkillProgress {
  const total = levels.length;
  const points = levels.reduce((n, l) => n + LEVEL_POINTS[l], 0);
  return {
    total,
    autonomous: levels.filter((l) => l === "autonome").length,
    started: levels.filter((l) => l !== "a_voir").length,
    percent: total ? Math.round((points / (total * 3)) * 100) : 0,
  };
}

/** Compétences à travailler en priorité : les plus proches de l'autonomie d'abord, puis dans l'ordre du parcours. */
export function nextSkills<T extends { level: SkillLevel; position: number }>(skills: T[], count = 3): T[] {
  return skills
    .filter((s) => s.level !== "autonome")
    .sort((a, b) => LEVEL_POINTS[b.level] - LEVEL_POINTS[a.level] || a.position - b.position)
    .slice(0, count);
}

const DAY_NAMES = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"];

/** Jours d'école de la semaine (1 = lundi ... 6 = samedi) */
export function parseSchoolDays(values: unknown[]): number[] {
  return [...new Set(values.map(Number).filter((d) => Number.isInteger(d) && d >= 1 && d <= 6))].sort();
}

export function schoolDaysLabel(days: number[]): string {
  return days.length ? days.map((d) => DAY_NAMES[d]).join(", ") : "aucun jour fixe";
}

export function isSchoolDay(date: string, days: number[]): boolean {
  return days.includes(new Date(`${date}T12:00:00Z`).getUTCDay());
}

/** Jours restants avant la fin du contrat, et alerte à 60 jours pour préparer la suite. */
export function contractStatus(end: string | null, today: string): { daysLeft: number | null; tone: "ok" | "soon" | "ended" } {
  if (!end) return { daysLeft: null, tone: "ok" };
  const daysLeft = Math.round((Date.parse(`${end}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86400000);
  return { daysLeft, tone: daysLeft < 0 ? "ended" : daysLeft <= 60 ? "soon" : "ok" };
}
