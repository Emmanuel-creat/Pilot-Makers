/** Motifs de refus proposés au client et à l'artisan, pour comprendre les devis perdus. */
export const REFUSAL_REASONS = {
  prix: "Prix trop élevé",
  autre_entreprise: "Une autre entreprise a été choisie",
  delai: "Délai de réalisation trop long",
  contenu: "Prestations ne correspondant pas au besoin",
  reporte: "Projet reporté ou abandonné",
  autre: "Autre raison",
} as const;
export type RefusalReason = keyof typeof REFUSAL_REASONS;
export const REFUSAL_CODES = Object.keys(REFUSAL_REASONS) as [RefusalReason, ...RefusalReason[]];
