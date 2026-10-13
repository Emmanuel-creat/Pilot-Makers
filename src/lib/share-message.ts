/**
 * Envoi du lien de devis par SMS ou messagerie instantanée depuis le téléphone de l'artisan.
 *
 * Aucun service d'envoi n'est utilisé : le message est préparé ici, puis ouvert dans l'application
 * Messages ou WhatsApp de l'appareil, où l'artisan le relit et l'envoie lui-même.
 */

import { formatEuros } from "@/lib/calc/format";

export interface ShareInput {
  orgName: string;
  number: string;
  title: string;
  totalTtcCents: number;
  /** AAAA-MM-JJ */
  validUntil: string;
  url: string;
  /** Prénom ou nom du client, pour la formule d'appel */
  greetingName: string;
}

const frDate = (iso: string) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : "";
};

/** Message court, lisible sur un écran de téléphone. */
export function shareMessage(i: ShareInput): string {
  const hello = i.greetingName.trim() ? `Bonjour ${i.greetingName.trim()},` : "Bonjour,";
  const what = i.title.trim() ? ` (${i.title.trim()})` : "";
  const until = frDate(i.validUntil);
  return [
    hello,
    `voici le devis ${i.number}${what} de ${i.orgName} : ${formatEuros(i.totalTtcCents)} TTC.`,
    `Consultez-le et répondez en ligne${until ? ` jusqu'au ${until}` : ""} :`,
    i.url,
  ].join("\n");
}

/** Numéro français ramené au format international sans « + » (33612345678), ou "" s'il n'est pas lisible. */
export function internationalNumber(phone: string): string {
  let d = phone.replace(/[\s.\-()]/g, "");
  if (d.startsWith("+")) d = d.slice(1);
  else if (d.startsWith("00")) d = d.slice(2);
  else if (/^0[1-9]\d{8}$/.test(d)) d = "33" + d.slice(1);
  return /^[1-9]\d{7,14}$/.test(d) ? d : "";
}

/** Un numéro de portable français (06, 07) ou étranger : seul un portable reçoit un SMS. */
export function isMobile(phone: string): boolean {
  const n = internationalNumber(phone);
  if (!n) return false;
  return n.startsWith("33") ? /^33[67]\d{8}$/.test(n) : true;
}

/** Lien qui ouvre l'application Messages avec le texte prérempli (« ?&body= » est compris par iOS et Android). */
export function smsHref(phone: string, body: string): string {
  const n = internationalNumber(phone);
  return `sms:${n ? "+" + n : ""}?&body=${encodeURIComponent(body)}`;
}

export function whatsappHref(phone: string, body: string): string {
  const n = internationalNumber(phone);
  return `https://wa.me/${n}?text=${encodeURIComponent(body)}`;
}
