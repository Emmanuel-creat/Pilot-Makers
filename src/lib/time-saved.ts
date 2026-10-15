/**
 * Heures rendues aux artisans : chaque tâche que l'application fait à leur place est comptée, avec une durée
 * prudente de ce qu'elle aurait pris à la main. Le total de chaque entreprise s'affiche dans ses rapports ; le total
 * de toutes les entreprises est publié, sans aucun chiffre d'entreprise. Fonctions pures.
 */

export interface TimeSource {
  key: string;
  label: string;
  /** Minutes estimées pour faire la même chose à la main */
  minutes: number;
  how: string;
}

export const TIME_SOURCES: TimeSource[] = [
  { key: "devis", label: "Devis émis", minutes: 15, how: "calculs, mise en page, mentions légales et envoi" },
  { key: "factures", label: "Factures établies", minutes: 15, how: "reprise du devis, numérotation, mentions et envoi" },
  { key: "relances_devis", label: "Relances de devis", minutes: 6, how: "repérer le devis, écrire et envoyer la relance" },
  { key: "relances_factures", label: "Relances de factures", minutes: 6, how: "repérer l'impayé, écrire et envoyer la relance" },
  { key: "avis_clients", label: "Avis aux clients", minutes: 5, how: "rappels d'entretien et avis de retard" },
  { key: "rapprochement", label: "Paiements rapprochés seuls", minutes: 3, how: "pointer le relevé bancaire avec la facture" },
  { key: "pointage", label: "Heures pointées", minutes: 2, how: "feuille d'heures papier recopiée" },
  { key: "commandes", label: "Commandes fournisseurs", minutes: 10, how: "liste du matériel reprise du devis" },
  { key: "remises", label: "Bordereaux de remise", minutes: 10, how: "bordereau de chèques rempli à la main" },
];

export type TimeCounts = Partial<Record<string, number>>;

export function timeSaved(counts: TimeCounts) {
  const lines = TIME_SOURCES.map((s) => {
    const count = Math.max(0, Math.floor(counts[s.key] ?? 0));
    return { ...s, count, savedMinutes: count * s.minutes };
  });
  const totalMinutes = lines.reduce((t, l) => t + l.savedMinutes, 0);
  return { lines, totalMinutes, hours: Math.round(totalMinutes / 60) };
}

/** « 12 h 30 » ou « 45 min » */
export function formatDuration(minutes: number) {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h.toLocaleString("fr-FR")} h ${String(m).padStart(2, "0")}` : `${h.toLocaleString("fr-FR")} h`;
}

/** Entreprises minimum pour publier un total commun */
export const PUBLIC_MIN_ORGS = 10;
