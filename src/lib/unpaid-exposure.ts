/**
 * Zéro impayé : sur chaque chantier en cours, la valeur des travaux déjà réalisés est comparée à ce
 * qui a été facturé et encaissé. L'écart, c'est ce que l'artisan a avancé à son client : plus il
 * est grand, plus un impayé coûterait cher. Le remède est connu : un paiement par étapes validées,
 * facturées au fur et à mesure.
 */

export interface JobMoney {
  jobId: string;
  title: string;
  customer: string;
  quoteId: string;
  totalTtcCents: number;
  /** Avancement pondéré des tâches, en points de base (10000 = terminé) */
  progressBp: number;
  invoicedTtcCents: number;
  paidTtcCents: number;
  hasStages: boolean;
  /** Étapes soumises au client, en attente de sa validation */
  stagesWaiting: number;
}

export type ExposureLevel = "ok" | "surveiller" | "risque";

/** Avance tolérée sans alerte : 10 % du chantier, et au moins 500 euros. */
const WATCH_SHARE = 0.1;
const RISK_SHARE = 0.3;
const MIN_ALERT_CENTS = 50_000;

export function exposure(j: JobMoney) {
  const doneValueCents = Math.round((j.totalTtcCents * Math.min(Math.max(j.progressBp, 0), 10000)) / 10000);
  const exposureCents = Math.max(0, doneValueCents - j.paidTtcCents);
  const uninvoicedCents = Math.max(0, doneValueCents - j.invoicedTtcCents);
  const unpaidInvoicedCents = Math.max(0, j.invoicedTtcCents - j.paidTtcCents);
  const share = j.totalTtcCents > 0 ? exposureCents / j.totalTtcCents : 0;
  const level: ExposureLevel = exposureCents < MIN_ALERT_CENTS || share < WATCH_SHARE ? "ok" : share >= RISK_SHARE ? "risque" : "surveiller";
  const advice: string[] = [];
  if (level !== "ok") {
    if (!j.hasStages) advice.push("Proposez au client un paiement par étapes validées en photo : chaque étape validée se facture aussitôt.");
    if (j.stagesWaiting) advice.push(`${j.stagesWaiting} étape${j.stagesWaiting > 1 ? "s attendent" : " attend"} la validation du client : relancez-le.`);
    if (uninvoicedCents >= MIN_ALERT_CENTS) advice.push("Facturez une situation de travaux pour la part déjà réalisée.");
    if (unpaidInvoicedCents >= MIN_ALERT_CENTS) advice.push("Relancez les factures émises non réglées avant de poursuivre.");
    if (level === "risque") advice.push("Envisagez de suspendre les travaux jusqu'au règlement, après en avoir informé le client par écrit.");
  }
  return { ...j, doneValueCents, exposureCents, uninvoicedCents, unpaidInvoicedCents, share, level, advice };
}

export type Exposure = ReturnType<typeof exposure>;

export function portfolio(jobs: JobMoney[]) {
  const list = jobs.map(exposure).sort((a, b) => b.exposureCents - a.exposureCents);
  const covered = list.filter((j) => j.hasStages).length;
  return {
    jobs: list,
    totalExposureCents: list.reduce((s, j) => s + j.exposureCents, 0),
    atRisk: list.filter((j) => j.level === "risque").length,
    toWatch: list.filter((j) => j.level === "surveiller").length,
    stagesCoverage: list.length ? Math.round((100 * covered) / list.length) : null,
  };
}

export const LEVEL_LABELS: Record<ExposureLevel, string> = { ok: "Maîtrisé", surveiller: "À surveiller", risque: "À risque" };
