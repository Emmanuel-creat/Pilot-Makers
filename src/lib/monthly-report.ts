/**
 * Rapport mensuel envoyé au gérant (fonctions pures) : l'essentiel du mois écoulé en quelques
 * lignes, comparé au mois précédent, au même mois de l'an dernier et à l'objectif.
 */

export interface MonthFigures {
  month: string;
  sent: number;
  signed: number;
  refused: number;
  signedHtCents: number;
  invoicedHtCents: number;
  collectedCents: number;
}

export interface MonthlyReportInput {
  orgName: string;
  current: MonthFigures;
  previous: MonthFigures | null;
  lastYear: MonthFigures | null;
  goalSignedHtCents: number;
  pendingQuotesTtcCents: number;
  overdue: { count: number; cents: number };
  activeJobs: number;
  appUrl: string;
}

const MONTHS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];

export function monthName(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return `${MONTHS[m - 1]} ${y}`;
}

/** Mois précédant celui de la date donnée (AAAA-MM). */
export function previousMonth(isoDate: string): string {
  const [y, m] = isoDate.slice(0, 7).split("-").map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
}

const eur = (cents: number) => (cents / 100).toLocaleString("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).replace(/ | /g, " ");

/** « en hausse de 12 % », « en baisse de 5 % », « stable », ou vide sans base de comparaison. */
export function trend(current: number, base: number | null | undefined): string {
  if (!base) return "";
  const p = Math.round(((current - base) * 100) / base);
  if (Math.abs(p) < 3) return "stable";
  return p > 0 ? `en hausse de ${p} %` : `en baisse de ${-p} %`;
}

export function signatureRate(f: Pick<MonthFigures, "signed" | "refused">): number | null {
  const decided = f.signed + f.refused;
  return decided ? Math.round((f.signed * 100) / decided) : null;
}

export function buildMonthlyReport(r: MonthlyReportInput): { subject: string; body: string; lines: string[] } {
  const c = r.current;
  const name = monthName(c.month);
  const lines: string[] = [];
  const compare = (value: number, key: "signedHtCents" | "invoicedHtCents" | "collectedCents") => {
    const m = r.previous ? trend(value, r.previous[key]) : "";
    const y = r.lastYear ? trend(value, r.lastYear[key]) : "";
    const parts = [m ? `${m} sur un mois` : "", y ? `${y} sur un an` : ""].filter(Boolean);
    return parts.length ? ` (${parts.join(", ")})` : "";
  };
  lines.push(`Devis signés : ${c.signed} pour ${eur(c.signedHtCents)} HT${compare(c.signedHtCents, "signedHtCents")}.`);
  if (r.goalSignedHtCents) {
    const p = Math.round((c.signedHtCents * 100) / r.goalSignedHtCents);
    lines.push(`Objectif du mois : ${eur(r.goalSignedHtCents)} HT, atteint à ${p} %.`);
  }
  const rate = signatureRate(c);
  lines.push(`Devis envoyés : ${c.sent}${rate !== null ? `, taux de signature ${rate} %` : ""}.`);
  lines.push(`Facturé : ${eur(c.invoicedHtCents)} HT${compare(c.invoicedHtCents, "invoicedHtCents")}.`);
  lines.push(`Encaissé : ${eur(c.collectedCents)}${compare(c.collectedCents, "collectedCents")}.`);
  if (r.pendingQuotesTtcCents) lines.push(`Devis en attente de réponse : ${eur(r.pendingQuotesTtcCents)} TTC.`);
  lines.push(r.overdue.count ? `Factures en retard : ${r.overdue.count}, pour ${eur(r.overdue.cents)} restant dus.` : "Aucune facture en retard de paiement.");
  if (r.activeJobs) lines.push(`Chantiers en cours : ${r.activeJobs}.`);
  const body = [
    "Bonjour,",
    "",
    `Voici l'essentiel de ${name} pour ${r.orgName} :`,
    "",
    ...lines.map((l) => `- ${l}`),
    "",
    `Le détail mois par mois est dans vos rapports : ${r.appUrl}`,
    "",
    "Pour ne plus recevoir ce rapport, décochez l'envoi dans la page Rapports.",
  ].join("\n");
  return { subject: `Votre mois de ${name} : ${eur(c.signedHtCents)} HT signés`, body, lines };
}
