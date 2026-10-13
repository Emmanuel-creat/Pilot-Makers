/**
 * Phrase de relance adaptée au client et à l'historique du devis (variable {suivi} des relances).
 *
 * Le ton change selon que le client a ouvert le devis ou non, qu'il est particulier ou professionnel,
 * que des choix l'attendent, que l'échéance approche ou que c'est la dernière relance prévue.
 */

export interface FollowUpInput {
  /** Le client a ouvert au moins un lien de consultation */
  viewed: boolean;
  customerType: string;
  /** Rang de la relance envoyée (1 pour la première) et nombre maximal prévu */
  reminder: number;
  maxReminders: number;
  /** Jours restants avant la fin de validité */
  daysLeft: number;
  /** AAAA-MM-JJ */
  validUntil: string;
  /** Options ou variantes à choisir */
  hasChoices: boolean;
}

const frDate = (iso: string) => iso.slice(0, 10).split("-").reverse().join("/");

export function followUpText(i: FollowUpInput): string {
  const pro = i.customerType === "entreprise";
  const out: string[] = [];
  if (!i.viewed) {
    out.push(
      i.reminder === 1
        ? "Le devis n'a pas encore été ouvert : il a peut-être été classé parmi les indésirables. Le lien ci-dessous l'affiche directement."
        : "Le devis n'a toujours pas été ouvert. Si l'adresse e-mail n'est pas la bonne, une simple réponse à ce message suffit pour le recevoir ailleurs.",
    );
  } else if (i.hasChoices) {
    out.push("Vous avez consulté le devis : il vous reste à choisir parmi les options proposées, directement en ligne.");
  } else {
    out.push(
      pro
        ? "Vous avez consulté le devis. Si le chiffrage ou le planning doit être ajusté pour votre opération, je peux vous adresser une nouvelle version."
        : "Vous avez consulté le devis. Si une question vous retient, ou si vous souhaitez ajuster une partie des travaux, je peux passer vous en parler.",
    );
  }
  if (i.daysLeft >= 0 && i.daysLeft <= 7) {
    out.push(`Il reste valable jusqu'au ${frDate(i.validUntil)} ; au-delà, les prix devront être revus.`);
  }
  if (i.reminder >= i.maxReminders && i.maxReminders > 1) out.push("C'est mon dernier message à ce sujet, je ne vous relancerai plus.");
  return out.join(" ");
}

/** Insère le paragraphe de suivi dans un modèle qui ne contient pas {suivi} : avant la formule finale. */
export function withFollowUp(body: string, followUp: string): string {
  if (!followUp) return body;
  const paragraphs = body.split(/\n\s*\n/);
  if (paragraphs.length < 3) return `${body}\n\n${followUp}`;
  return [...paragraphs.slice(0, -1), followUp, paragraphs.at(-1)].join("\n\n");
}
