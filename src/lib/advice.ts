/**
 * Conseils proactifs : chaque signal tiré des chiffres de l'entreprise devient une action concrète,
 * avec son enjeu en euros quand il existe, classée de la plus rentable à la moins urgente.
 */

import type { Indicator } from "@/lib/health-score";
import { formatEuros } from "@/lib/calc/format";

export interface AdviceSignals {
  overdue: { count: number; cents: number };
  staleQuotes: { count: number; cents: number };
  expiringQuotes: number;
  unbilled: { count: number; cents: number };
  unreceivedJobs: number;
  overloaded: number | null;
  maintenanceDue: number;
  lateJobs: number;
  weakIndicators: Indicator[];
}

export interface Advice {
  key: string;
  title: string;
  detail: string;
  href: string;
  /** Montant en jeu, en centimes ; 0 si le conseil n'a pas d'enjeu chiffré direct */
  stakeCents: number;
  /** 1 urgent, 2 important, 3 à prévoir */
  priority: 1 | 2 | 3;
}

/** Jours sans réponse après lesquels un devis envoyé mérite une relance. */
export const STALE_QUOTE_DAYS = 10;
/** Jours après l'acceptation au-delà desquels un devis non facturé est signalé. */
export const UNBILLED_DAYS = 30;

const plural = (n: number, one: string, many: string) => (n > 1 ? many : one);

const INDICATOR_LINK: Record<string, string> = {
  croissance: "/app/devis?status=pending",
  marge: "/app/rapports/rentabilite",
  paiement: "/app/factures?statut=overdue",
  retards: "/app/factures?statut=overdue",
  concentration: "/app/clients",
  carnet: "/app/demandes",
  signature: "/app/rapports",
};

export function buildAdvice(s: AdviceSignals): Advice[] {
  const out: Advice[] = [];
  if (s.overdue.count)
    out.push({
      key: "factures-retard",
      title: `Relancer ${s.overdue.count} ${plural(s.overdue.count, "facture en retard", "factures en retard")}`,
      detail: `${formatEuros(s.overdue.cents)} TTC dépassent leur échéance. Une relance dans la semaine récupère la plupart des paiements.`,
      href: "/app/factures?statut=overdue",
      stakeCents: s.overdue.cents,
      priority: 1,
    });
  if (s.unbilled.count)
    out.push({
      key: "devis-non-factures",
      title: `Facturer ${s.unbilled.count} ${plural(s.unbilled.count, "devis accepté", "devis acceptés")}`,
      detail: `Acceptés depuis plus de ${UNBILLED_DAYS} jours sans aucune facture, pour ${formatEuros(s.unbilled.cents)} HT. Un acompte ou une situation sécurise votre trésorerie.`,
      href: "/app/devis?status=accepted",
      stakeCents: s.unbilled.cents,
      priority: 1,
    });
  if (s.staleQuotes.count)
    out.push({
      key: "devis-sans-reponse",
      title: `Relancer ${s.staleQuotes.count} ${plural(s.staleQuotes.count, "devis sans réponse", "devis sans réponse")}`,
      detail: `Envoyés depuis plus de ${STALE_QUOTE_DAYS} jours, pour ${formatEuros(s.staleQuotes.cents)} HT. Un appel rapide fait souvent la différence.`,
      href: "/app/devis?status=pending",
      stakeCents: s.staleQuotes.cents,
      priority: 2,
    });
  if (s.expiringQuotes)
    out.push({
      key: "devis-expiration",
      title: `${s.expiringQuotes} ${plural(s.expiringQuotes, "devis expire", "devis expirent")} sous 7 jours`,
      detail: "Prolongez la validité ou relancez le client avant que l'offre ne tombe.",
      href: "/app/devis?status=pending",
      stakeCents: 0,
      priority: 2,
    });
  if (s.unreceivedJobs)
    out.push({
      key: "receptions",
      title: `Faire réceptionner ${s.unreceivedJobs} ${plural(s.unreceivedJobs, "chantier terminé", "chantiers terminés")}`,
      detail: "Le procès-verbal de réception déclenche les garanties et permet de facturer le solde.",
      href: "/app/chantiers",
      stakeCents: 0,
      priority: 2,
    });
  if (s.overloaded)
    out.push({
      key: "surcharge",
      title: `${s.overloaded} ${plural(s.overloaded, "personne surchargée", "personnes surchargées")} dans les quatre semaines`,
      detail: "Des réaffectations vers des collègues libres sont proposées.",
      href: "/app/planning/equilibre",
      stakeCents: 0,
      priority: 2,
    });
  if (s.lateJobs)
    out.push({
      key: "chantiers-retard",
      title: `${s.lateJobs} ${plural(s.lateJobs, "chantier en retard", "chantiers en retard")}`,
      detail: "La fin probable dépasse la date prévue : renforcez l'équipe ou prévenez le client de la nouvelle date.",
      href: "/app/chantiers/retards",
      stakeCents: 0,
      priority: 1,
    });
  if (s.maintenanceDue)
    out.push({
      key: "entretiens",
      title: `Proposer ${s.maintenanceDue} ${plural(s.maintenanceDue, "entretien", "entretiens")} d'équipement`,
      detail: "Des équipements notés dans les carnets de logement arrivent à l'échéance de leur entretien : autant de rendez-vous à caler.",
      href: "/app/carnets/entretiens",
      stakeCents: 0,
      priority: 2,
    });
  for (const i of s.weakIndicators) {
    if (!i.advice || i.points / i.max >= 0.5) continue;
    if ((i.key === "retards" || i.key === "paiement") && s.overdue.count) continue;
    out.push({
      key: `sante-${i.key}`,
      title: `${i.label} : ${i.value}`,
      detail: i.advice,
      href: INDICATOR_LINK[i.key] ?? "/app/rapports/sante",
      stakeCents: 0,
      priority: 3,
    });
  }
  return out.sort((a, b) => a.priority - b.priority || b.stakeCents - a.stakeCents);
}
