/**
 * Décompte général définitif d'un marché : montant du marché et de ses avenants, factures émises
 * (acomptes, situations, solde, avoirs), retenue de garantie, pénalités et règlements, jusqu'au solde.
 */

export interface AccountInvoice {
  number: string;
  kind: "deposit" | "progress" | "final" | "credit_note";
  issueDate: string;
  /** TTC de la facture */
  ttcCents: number;
  /** Net à payer : TTC moins acomptes déduits et retenue */
  amountDueCents: number;
  retentionCents: number;
  paidCents: number;
}

export interface AccountInput {
  marketHtCents: number;
  marketTtcCents: number;
  amendments: { label: string; htCents: number; ttcCents: number }[];
  invoices: AccountInvoice[];
  penaltiesCents: number;
}

export interface FinalAccount {
  contractHtCents: number;
  contractTtcCents: number;
  /** Travaux facturés TTC, acomptes déduits une seule fois et avoirs retirés */
  invoicedTtcCents: number;
  /** Écart entre le facturé et le marché : révision de prix, ou travaux restant à facturer s'il est négatif */
  gapTtcCents: number;
  retentionCents: number;
  penaltiesCents: number;
  paidCents: number;
  /** Ce que le client doit encore, retenue de garantie mise à part */
  balanceCents: number;
  hasFinalInvoice: boolean;
}

/** Une facture rapporte au marché son net à payer augmenté de sa retenue : les acomptes déduits du solde ne comptent qu'une fois. */
export function invoiceContribution(i: AccountInvoice): number {
  return i.kind === "credit_note" ? -i.ttcCents : i.amountDueCents + i.retentionCents;
}

export function computeFinalAccount(a: AccountInput): FinalAccount {
  const contractHtCents = a.marketHtCents + a.amendments.reduce((t, x) => t + x.htCents, 0);
  const contractTtcCents = a.marketTtcCents + a.amendments.reduce((t, x) => t + x.ttcCents, 0);
  const invoicedTtcCents = a.invoices.reduce((t, i) => t + invoiceContribution(i), 0);
  const retentionCents = a.invoices.reduce((t, i) => t + (i.kind === "credit_note" ? -i.retentionCents : i.retentionCents), 0);
  const paidCents = a.invoices.reduce((t, i) => t + (i.kind === "credit_note" ? 0 : i.paidCents), 0);
  const penaltiesCents = Math.max(0, a.penaltiesCents);
  return {
    contractHtCents,
    contractTtcCents,
    invoicedTtcCents,
    gapTtcCents: invoicedTtcCents - contractTtcCents,
    retentionCents,
    penaltiesCents,
    paidCents,
    balanceCents: invoicedTtcCents - retentionCents - penaltiesCents - paidCents,
    hasFinalInvoice: a.invoices.some((i) => i.kind === "final"),
  };
}

export const ACCOUNT_STATUSES = {
  projet: "Projet de décompte",
  envoye: "Envoyé au client",
  accepte: "Accepté par le client",
  conteste: "Contesté par le client",
} as const;
export type AccountStatus = keyof typeof ACCOUNT_STATUSES;
