/** Libellés des chantiers, sans dépendance serveur (utilisables dans le navigateur). */
export const JOB_STATUSES = {
  a_planifier: "À planifier",
  en_cours: "En cours",
  termine: "Travaux terminés",
  receptionne: "Réceptionné",
} as const;
export type JobStatus = keyof typeof JOB_STATUSES;

export const pct = (bp: number) => (bp / 100).toLocaleString("fr-FR", { maximumFractionDigits: 1 });
