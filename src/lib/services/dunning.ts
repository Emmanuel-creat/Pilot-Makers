/**
 * Relances adaptées : le rythme et le ton des relances de factures suivent le
 * montant restant dû et l'habitude de paiement du client (fonctions pures).
 */

export type PayerProfile = "new" | "reliable" | "usual" | "late";

export const PAYER_PROFILES: Record<PayerProfile, string> = {
  new: "Premier règlement attendu",
  reliable: "Paie à l'heure",
  usual: "Retards occasionnels",
  late: "Paie souvent en retard",
};

/** Seuils en centimes : au-delà, on relance plus tôt ; en deçà, une relance de moins. */
export const LARGE_AMOUNT_CENTS = 5_000_00;
export const SMALL_AMOUNT_CENTS = 200_00;

/**
 * Habitude de paiement d'après les factures réglées du client : retard moyen
 * (en jours, depuis l'échéance) et pire retard. Sans historique : nouveau client.
 */
export function payerProfile(delays: number[]): { profile: PayerProfile; averageDelay: number; invoices: number } {
  if (!delays.length) return { profile: "new", averageDelay: 0, invoices: 0 };
  const late = delays.map((d) => Math.max(0, d));
  const averageDelay = Math.round(late.reduce((t, d) => t + d, 0) / late.length);
  const worst = Math.max(...late);
  const profile: PayerProfile = averageDelay <= 3 && worst <= 15 ? "reliable" : averageDelay > 10 ? "late" : "usual";
  return { profile, averageDelay, invoices: delays.length };
}

/**
 * Paliers de relance (jours après l'échéance) adaptés au montant et au client.
 * Un bon payeur a quelques jours de plus avant la première relance ; un client
 * souvent en retard et un montant important sont relancés plus tôt ; un petit
 * montant reçoit une relance de moins.
 */
export function adaptedSteps(days: number[], amountCents: number, profile: PayerProfile): number[] {
  let steps = [...days].sort((a, b) => a - b);
  if (amountCents < SMALL_AMOUNT_CENTS && steps.length > 1) steps = steps.slice(0, -1);
  let factor = 1;
  if (amountCents >= LARGE_AMOUNT_CENTS) factor *= 0.6;
  if (profile === "late") factor *= 0.5;
  steps = steps.map((d) => Math.round(d * factor));
  if (profile === "reliable" && steps.length) steps[0] += 4;
  // Paliers strictement croissants : deux relances ne partent jamais le même jour.
  for (let i = 1; i < steps.length; i++) if (steps[i] <= steps[i - 1]) steps[i] = steps[i - 1] + 1;
  return steps;
}

export type ReminderTone = "courtois" | "ferme" | "dernier";

/** Ton de la relance : courtois d'abord, plus ferme ensuite, dernier rappel au dernier palier. */
export function reminderTone(index: number, total: number, profile: PayerProfile): ReminderTone {
  if (total > 1 && index >= total - 1) return "dernier";
  if (index === 0 && profile !== "late") return "courtois";
  return "ferme";
}

export const REMINDER_TEMPLATES: Record<ReminderTone, { subject: string; body: string }> = {
  courtois: {
    subject: "Rappel : {type} {numero} à régler",
    body:
      "Bonjour,\n\nSauf erreur de notre part, la {type} n° {numero} d'un montant de {montant} TTC, échue le {echeance}, reste à régler à hauteur de {reste}. Il s'agit sans doute d'un simple oubli.\n\n" +
      "Nous vous remercions de bien vouloir procéder au règlement. Si celui-ci a été effectué entre-temps, merci de ne pas tenir compte de ce message.\n\nCordialement,\n{entreprise}",
  },
  ferme: {
    subject: "Relance : {type} {numero} impayée",
    body:
      "Bonjour,\n\nMalgré notre précédent message, la {type} n° {numero} d'un montant de {montant} TTC, échue le {echeance}, reste impayée à hauteur de {reste}.\n\n" +
      "Merci de procéder au règlement dès réception de ce message, ou de nous contacter si une difficulté vous en empêche : nous pouvons convenir d'un échéancier.\n\nCordialement,\n{entreprise}",
  },
  dernier: {
    subject: "Dernier rappel avant mise en demeure : {type} {numero}",
    body:
      "Bonjour,\n\nLa {type} n° {numero} d'un montant de {montant} TTC, échue le {echeance}, reste impayée à hauteur de {reste}, malgré nos relances.\n\n" +
      "Sans règlement de votre part sous 8 jours, nous serons contraints d'engager la procédure de recouvrement prévue par nos conditions{penalites}.\n\nCordialement,\n{entreprise}",
  },
};
