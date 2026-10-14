/**
 * Risque d'impayé d'un client avant de signer : habitude de paiement, impayés en cours, montant engagé
 * par rapport à ce qu'il a déjà réglé. Chaque niveau propose les garanties à prévoir dans le devis.
 */

export interface RiskInput {
  customerType: "particulier" | "pro";
  hasSiren: boolean;
  /** Factures soldées et retard moyen de paiement, en jours */
  paidInvoices: number;
  averageDelay: number;
  /** Reste dû en retard aujourd'hui, et plus ancien retard en jours */
  overdueCents: number;
  oldestOverdueDays: number;
  /** Plus grosse facture déjà réglée par le client, TTC */
  largestPaidCents: number;
  /** Montant TTC du devis envisagé, 0 si inconnu */
  quoteCents: number;
}

export type RiskLevel = "faible" | "modere" | "eleve";

export const RISK_LEVELS: Record<RiskLevel, string> = { faible: "Faible", modere: "Modéré", eleve: "Élevé" };

export interface RiskResult {
  score: number;
  level: RiskLevel;
  reasons: string[];
  guarantees: string[];
  depositPercent: number;
}

const euros = (c: number) =>
  `${Math.round(c / 100)
    .toLocaleString("fr-FR")
    .replace(/ | /g, " ")} €`;

export function customerRisk(i: RiskInput): RiskResult {
  let score = 0;
  const reasons: string[] = [];
  if (i.overdueCents > 0) {
    score += i.oldestOverdueDays > 60 ? 45 : 35;
    reasons.push(`${euros(i.overdueCents)} en retard de paiement aujourd'hui, depuis ${i.oldestOverdueDays} jours au plus`);
  }
  if (i.paidInvoices) {
    if (i.averageDelay > 30) {
      score += 20;
      reasons.push(`paie en moyenne ${i.averageDelay} jours après l'échéance`);
    } else if (i.averageDelay > 10) {
      score += 10;
      reasons.push(`paie en moyenne ${i.averageDelay} jours après l'échéance`);
    } else if (i.paidInvoices >= 3 && !i.overdueCents) {
      score -= 15;
      reasons.push(`${i.paidInvoices} factures réglées à temps`);
    }
  } else {
    score += 10;
    reasons.push("premier chantier avec ce client");
    if (i.customerType === "pro" && !i.hasSiren) {
      score += 10;
      reasons.push("entreprise sans SIREN renseigné");
    }
  }
  if (i.quoteCents >= 1_000_000 && !i.paidInvoices) {
    score += 15;
    reasons.push(`montant important (${euros(i.quoteCents)}) pour un premier chantier`);
  } else if (i.paidInvoices && i.quoteCents >= 500_000 && i.quoteCents > 3 * i.largestPaidCents) {
    score += 15;
    reasons.push(`montant bien supérieur à ce que le client a déjà réglé (${euros(i.largestPaidCents)} au plus)`);
  }
  score = Math.max(0, Math.min(100, score));
  const level: RiskLevel = score < 25 ? "faible" : score < 50 ? "modere" : "eleve";
  const guarantees: string[] = [];
  let depositPercent = 30;
  if (i.overdueCents > 0) guarantees.push("Obtenir le règlement des factures en retard avant de commencer.");
  if (level === "faible") {
    guarantees.push("Acompte habituel de 30 % à la signature.");
  } else if (level === "modere") {
    depositPercent = 40;
    guarantees.push("Acompte de 40 % à la signature, encaissé avant la commande des matériaux.");
    guarantees.push("Factures de situation à chaque étape plutôt qu'un solde unique.");
  } else {
    depositPercent = 50;
    guarantees.push("Acompte de 50 % à la signature, encaissé avant tout démarrage.");
    guarantees.push("Paiement par étapes : chaque étape réglée avant d'engager la suivante.");
    if (i.customerType === "pro")
      guarantees.push("Demander une caution bancaire ou une garantie de paiement (article 1799-1 du Code civil pour les marchés de plus de 12 000 € HT).");
    else guarantees.push("Matériaux spécifiques commandés seulement après encaissement de l'acompte.");
  }
  return { score, level, reasons, guarantees, depositPercent };
}
