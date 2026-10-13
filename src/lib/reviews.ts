/**
 * Avis clients (fonctions pures) : nom affiché, moyenne, et motifs pour lesquels l'entreprise peut
 * masquer un avis. Un avis n'est jamais modifié ni trié selon sa note : il est publié tel quel si
 * le client l'accepte, et seul un avis injurieux, hors sujet ou contenant des données personnelles
 * peut être masqué, motif à l'appui.
 */

export const HIDE_REASONS = {
  injurieux: "Propos injurieux ou diffamatoires",
  donnees_personnelles: "Données personnelles d'un tiers",
  hors_sujet: "Sans rapport avec les travaux",
} as const;
export type HideReason = keyof typeof HIDE_REASONS;

/** Prénom et initiale du nom : « Claire D. » ; une société garde son nom. */
export function displayName(c: { type?: string; first_name?: string; last_name?: string; company_name?: string }): string {
  if (c.type && c.type !== "particulier" && c.company_name?.trim()) return c.company_name.trim();
  const first = (c.first_name ?? "").trim();
  const last = (c.last_name ?? "").trim();
  if (first && last) return `${first} ${last[0].toUpperCase()}.`;
  return first || (last ? `${last[0].toUpperCase()}.` : "Client");
}

export function averageRating(ratings: readonly number[]): { average: number | null; count: number } {
  if (!ratings.length) return { average: null, count: 0 };
  return { average: Math.round((ratings.reduce((t, r) => t + r, 0) / ratings.length) * 10) / 10, count: ratings.length };
}

export function stars(rating: number): string {
  return `${rating} sur 5`;
}
