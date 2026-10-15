/**
 * Remise de chèques en banque : liste des chèques reçus et pas encore remis, bordereau numéroté, alerte avant que
 * le chèque ne puisse plus être encaissé. Fonctions pures, montants en centimes.
 *
 * Un chèque émis en France métropolitaine se présente dans un délai d'un an et huit jours après sa date
 * d'émission (Code monétaire et financier, article L131-59) ; la date de réception sert ici d'estimation.
 */

export interface PendingCheque {
  id: string;
  amountCents: number;
  receivedOn: string;
  reference: string;
  drawer: string;
  invoiceNumber: string;
}

/** Date limite estimée de présentation : un an et huit jours après la réception */
export function chequeDeadline(receivedOn: string): string {
  const d = new Date(`${receivedOn}T12:00:00Z`);
  d.setUTCFullYear(d.getUTCFullYear() + 1);
  d.setUTCDate(d.getUTCDate() + 8);
  return d.toISOString().slice(0, 10);
}

const days = (from: string, to: string) => Math.round((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 86400000);

/** Ancienneté en jours et niveau d'alerte d'un chèque non remis */
export function chequeAge(receivedOn: string, today: string): { days: number; level: "ok" | "a_remettre" | "urgent" } {
  const n = days(receivedOn, today);
  const left = days(today, chequeDeadline(receivedOn));
  return { days: n, level: left <= 30 ? "urgent" : n >= 7 ? "a_remettre" : "ok" };
}

/** Lignes du bordereau triées par client puis montant, avec total et nombre de chèques */
export function depositSlip(cheques: readonly PendingCheque[]) {
  const lines = [...cheques].sort((a, b) => a.drawer.localeCompare(b.drawer, "fr") || b.amountCents - a.amountCents);
  return { lines, totalCents: lines.reduce((s, c) => s + c.amountCents, 0), count: lines.length };
}

/** IBAN affiché par groupes de quatre caractères */
export const formatIban = (iban: string) =>
  iban
    .replace(/\s/g, "")
    .toUpperCase()
    .replace(/(.{4})(?=.)/g, "$1 ");
