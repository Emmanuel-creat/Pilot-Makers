/**
 * Rénovation coordonnée : un client, un dossier, plusieurs artisans, un seul pilote. Chaque
 * entreprise garde son propre devis et sa responsabilité ; le pilote rassemble les devis, fixe
 * l'enchaînement des interventions et reste l'unique interlocuteur du client.
 */

import { coordinationIssues, sortInterventions, tradeByKey, type CoordinationIssue } from "@/lib/coordination";

export type ParticipantStatus = "pilote" | "invite" | "accepte" | "refuse" | "externe";

export const STATUS_LABELS: Record<ParticipantStatus, string> = {
  pilote: "Pilote du dossier",
  invite: "Invitation envoyée",
  accepte: "Participe",
  refuse: "A décliné",
  externe: "Entreprise hors application",
};

export interface Participant {
  id: string;
  name: string;
  trade: string;
  status: ParticipantStatus;
  startDate: string | null;
  endDate: string | null;
  /** Montant TTC du devis rattaché (ou saisi pour une entreprise hors application), null si pas encore de devis */
  amountTtcCents: number | null;
  /** Devis rattaché ou montant saisi ; vrai même quand le montant est masqué à un autre participant */
  hasQuote: boolean;
  quoteStatus: string | null;
  quoteNumber: string | null;
}

/** Les entreprises qui comptent dans le dossier : celles qui ont décliné en sortent. */
export const active = (p: Participant) => p.status !== "refuse";

export function dossierSummary(list: readonly Participant[]) {
  const kept = list.filter(active);
  const sorted = sortInterventions(kept.map((p) => ({ ...p, company: p.name, afterId: null, note: "" })));
  const issues: CoordinationIssue[] = coordinationIssues(sorted);
  const missingQuotes = kept.filter((p) => !p.hasQuote && p.status !== "invite").map((p) => p.name);
  const waiting = kept.filter((p) => p.status === "invite").map((p) => p.name);
  const accepted = kept.filter((p) => p.quoteStatus === "accepted").length;
  const dated = kept.filter((p) => p.startDate && p.endDate);
  return {
    participants: sorted.map(({ company: _c, afterId: _a, note: _n, ...p }) => p as Participant),
    totalTtcCents: kept.reduce((s, p) => s + (p.amountTtcCents ?? 0), 0),
    complete: kept.length > 0 && !missingQuotes.length && !waiting.length,
    missingQuotes,
    waiting,
    accepted,
    from: dated.length ? dated.map((p) => p.startDate!).sort()[0] : null,
    to: dated.length
      ? dated
          .map((p) => p.endDate!)
          .sort()
          .at(-1)!
      : null,
    issues,
  };
}

export const tradeLabel = (key: string) => tradeByKey(key)?.label ?? "Autre intervention";

/** Montant saisi en euros (« 12 500,50 ») converti en centimes, null si vide. */
export function parseEuros(v: string): number | null {
  const t = v.replace(/[\s €]/g, "").replace(",", ".");
  if (!t) return null;
  if (!/^\d+(?:\.\d{1,2})?$/.test(t)) throw new Error("Montant TTC invalide");
  return Math.round(Number(t) * 100);
}
