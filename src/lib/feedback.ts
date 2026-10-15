/**
 * Retours mesurés : chaque page de l'application demande « utile ou à améliorer ? ». Les réponses sont regroupées
 * par rubrique et par semaine, pour voir chaque semaine ce qui progresse et ce qui gêne. Fonctions pures.
 */

/** Rubrique d'une adresse de l'application : le premier segment après /app (« devis », « factures »...) */
export function areaOf(path: string): string {
  const m = /^\/app(?:\/([a-z0-9-]+))?/.exec(path.split(/[?#]/)[0]);
  if (!m) return "autre";
  return m[1] ?? "accueil";
}

export interface FeedbackRow {
  area: string;
  useful: boolean;
  createdAt: string;
}

export interface AreaWeek {
  area: string;
  count: number;
  useful: number;
  /** Part de réponses « utile », en pour cent ; null sans réponse */
  satisfaction: number | null;
  previousSatisfaction: number | null;
  /** Évolution en points par rapport à la semaine précédente */
  trend: number | null;
}

const pct = (useful: number, n: number) => (n ? Math.round((useful / n) * 100) : null);

/** Semaine glissante (sept derniers jours) comparée aux sept jours d'avant, rubrique par rubrique */
export function weeklyFeedback(rows: readonly FeedbackRow[], now: Date) {
  const t = now.getTime();
  const week = rows.filter((r) => t - Date.parse(r.createdAt) < 7 * 86400000);
  const prev = rows.filter((r) => {
    const age = t - Date.parse(r.createdAt);
    return age >= 7 * 86400000 && age < 14 * 86400000;
  });
  const areas = [...new Set([...week, ...prev].map((r) => r.area))];
  const stats: AreaWeek[] = areas.map((area) => {
    const w = week.filter((r) => r.area === area);
    const p = prev.filter((r) => r.area === area);
    const s = pct(w.filter((r) => r.useful).length, w.length);
    const ps = pct(p.filter((r) => r.useful).length, p.length);
    return {
      area,
      count: w.length,
      useful: w.filter((r) => r.useful).length,
      satisfaction: s,
      previousSatisfaction: ps,
      trend: s != null && ps != null ? s - ps : null,
    };
  });
  // Les rubriques qui gênent le plus d'utilisateurs d'abord
  stats.sort((a, b) => b.count - b.useful - (a.count - a.useful) || b.count - a.count || a.area.localeCompare(b.area));
  return {
    areas: stats,
    total: week.length,
    satisfaction: pct(week.filter((r) => r.useful).length, week.length),
    previousSatisfaction: pct(prev.filter((r) => r.useful).length, prev.length),
  };
}
