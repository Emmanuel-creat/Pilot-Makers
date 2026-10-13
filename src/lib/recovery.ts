/**
 * Recouvrement d'une facture impayée : relances amiables, mise en demeure, puis dossier
 * d'injonction de payer prêt à déposer (fonctions pures).
 *
 * Rien n'est envoyé ni déposé automatiquement : l'outil calcule les sommes, rédige la lettre
 * et liste les pièces, l'artisan décide de chaque étape.
 */

export type RecoveryStage = "a_jour" | "relances" | "mise_en_demeure" | "attente_reponse" | "injonction";

export const RECOVERY_STAGES: Record<RecoveryStage, string> = {
  a_jour: "Rien à recouvrer",
  relances: "Relances amiables",
  mise_en_demeure: "Mise en demeure à envoyer",
  attente_reponse: "Mise en demeure envoyée, délai en cours",
  injonction: "Injonction de payer à déposer",
};

/** Retard après lequel une mise en demeure est conseillée, si les relances n'ont rien donné. */
export const NOTICE_AFTER_DAYS = 30;
/** Délai laissé au client dans la mise en demeure. */
export const NOTICE_DELAY_DAYS = 8;
/** Indemnité forfaitaire pour frais de recouvrement entre professionnels (article L441-10 du Code de commerce). */
export const FLAT_FEE_CENTS = 4000;
/** Prescription de l'action en paiement : 5 ans entre professionnels, 2 ans contre un particulier (article L218-2 du Code de la consommation). */
export const PRESCRIPTION_YEARS = { pro: 5, particulier: 2 } as const;

export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(to + "T12:00:00Z") - Date.parse(from + "T12:00:00Z")) / 86400000);
}

export function addDays(iso: string, days: number): string {
  return new Date(Date.parse(iso + "T12:00:00Z") + days * 86400000).toISOString().slice(0, 10);
}

export function addYears(iso: string, years: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const date = new Date(Date.UTC(y + years, m - 1, d, 12));
  if (date.getUTCMonth() !== m - 1) date.setUTCDate(0); // 29 février
  return date.toISOString().slice(0, 10);
}

export function recoveryStage(a: { balanceCents: number; dueDate: string; today: string; reminders: number; noticeSentOn: string | null }): RecoveryStage {
  if (a.balanceCents <= 0 || a.today <= a.dueDate) return "a_jour";
  if (a.noticeSentOn) return daysBetween(a.noticeSentOn, a.today) > NOTICE_DELAY_DAYS ? "injonction" : "attente_reponse";
  if (daysBetween(a.dueDate, a.today) >= NOTICE_AFTER_DAYS && a.reminders >= 1) return "mise_en_demeure";
  return "relances";
}

/** Premier taux annuel en pourcentage trouvé dans la mention de pénalités (« 10 % », « 12,5% »), en points de base. */
export function rateFromText(text: string): number | null {
  const m = /(\d{1,2}(?:[.,]\d{1,2})?)\s*%/.exec(text);
  if (!m) return null;
  const bp = Math.round(Number(m[1].replace(",", ".")) * 100);
  return bp > 0 && bp <= 5000 ? bp : null;
}

/** Pénalités de retard, intérêts simples au taux annuel, du lendemain de l'échéance au jour du calcul. */
export function latePenalty(balanceCents: number, dueDate: string, today: string, rateBp: number): number {
  const days = daysBetween(dueDate, today);
  if (balanceCents <= 0 || days <= 0 || rateBp <= 0) return 0;
  return Math.round((balanceCents * rateBp * days) / (10000 * 365));
}

export interface Claim {
  principalCents: number;
  penaltyCents: number;
  flatFeeCents: number;
  totalCents: number;
  rateBp: number;
  days: number;
}

export function claim(a: { balanceCents: number; dueDate: string; today: string; rateBp: number | null; professional: boolean }): Claim {
  const rateBp = a.rateBp ?? 0;
  const penaltyCents = latePenalty(a.balanceCents, a.dueDate, a.today, rateBp);
  const flatFeeCents = a.professional && a.balanceCents > 0 ? FLAT_FEE_CENTS : 0;
  return {
    principalCents: Math.max(0, a.balanceCents),
    penaltyCents,
    flatFeeCents,
    totalCents: Math.max(0, a.balanceCents) + penaltyCents + flatFeeCents,
    rateBp,
    days: Math.max(0, daysBetween(a.dueDate, a.today)),
  };
}

export interface Party {
  name: string;
  address: string[];
  siren?: string;
}

const eur = (cents: number) => (cents / 100).toLocaleString("fr-FR", { style: "currency", currency: "EUR" }).replace(/ | /g, " ");
const fr = (iso: string) => iso.split("-").reverse().join("/");

/** Lettre de mise en demeure, à envoyer en recommandé avec accusé de réception. */
export function formalNotice(a: {
  creditor: Party;
  debtor: Party;
  city: string;
  today: string;
  invoice: { kind: string; number: string; issueDate: string; dueDate: string; totalCents: number };
  claim: Claim;
  reminders: number;
  professional: boolean;
}): string {
  const c = a.claim;
  const lines = [
    [a.creditor.name, ...a.creditor.address].join("\n"),
    "",
    [a.debtor.name, ...a.debtor.address].join("\n"),
    "",
    `${a.city ? `${a.city}, le` : "Le"} ${fr(a.today)}`,
    "",
    "Lettre recommandée avec accusé de réception",
    `Objet : mise en demeure de payer la ${a.invoice.kind} n° ${a.invoice.number}`,
    "",
    "Madame, Monsieur,",
    "",
    `Par ${a.invoice.kind} n° ${a.invoice.number} du ${fr(a.invoice.issueDate)}, d'un montant de ${eur(a.invoice.totalCents)} TTC, nous vous avons facturé les travaux réalisés à votre demande. ` +
      `Cette facture était payable au plus tard le ${fr(a.invoice.dueDate)}.`,
    "",
    a.reminders
      ? `Malgré ${a.reminders > 1 ? `nos ${a.reminders} relances` : "notre relance"}, la somme de ${eur(c.principalCents)} reste à ce jour impayée.`
      : `La somme de ${eur(c.principalCents)} reste à ce jour impayée.`,
    "",
    `Par la présente, nous vous mettons en demeure de nous régler sous ${NOTICE_DELAY_DAYS} jours à compter de la réception de ce courrier la somme de ${eur(c.totalCents)}, qui se décompose ainsi :`,
    `- principal restant dû : ${eur(c.principalCents)}`,
  ];
  if (c.penaltyCents)
    lines.push(`- pénalités de retard au taux annuel de ${(c.rateBp / 100).toString().replace(".", ",")} % sur ${c.days} jours : ${eur(c.penaltyCents)}`);
  if (c.flatFeeCents) lines.push(`- indemnité forfaitaire pour frais de recouvrement (article L441-10 du Code de commerce) : ${eur(c.flatFeeCents)}`);
  lines.push(
    "",
    c.penaltyCents ? "Les pénalités continuent de courir jusqu'au complet paiement." : "",
    `À défaut de règlement dans ce délai, nous saisirons le tribunal compétent d'une requête en injonction de payer, sans autre avis${a.professional ? "" : " de notre part"}, et les frais de procédure s'ajouteront à votre dette.`,
    "",
    "Si vous rencontrez une difficulté pour régler cette somme, nous restons disposés à convenir avec vous d'un échéancier, à condition que vous nous contactiez avant l'expiration de ce délai.",
    "",
    "Nous vous prions d'agréer, Madame, Monsieur, nos salutations distinguées.",
    "",
    a.creditor.name,
  );
  return lines
    .filter((l, i, arr) => !(l === "" && arr[i - 1] === ""))
    .join("\n")
    .trim();
}

export interface InjunctionFile {
  court: string;
  courtHint: string;
  form: string;
  prescriptionDate: string;
  pieces: { label: string; ok: boolean; hint?: string }[];
  warnings: string[];
}

/** Dossier de requête en injonction de payer : juridiction, formulaire, pièces à joindre. */
export function injunctionFile(a: {
  professional: boolean;
  debtorIsCompany: boolean;
  dueDate: string;
  today: string;
  claim: Claim;
  hasSignedQuote: boolean;
  reminders: number;
  noticeSentOn: string | null;
  debtorAddressComplete: boolean;
}): InjunctionFile {
  const years = a.professional ? PRESCRIPTION_YEARS.pro : PRESCRIPTION_YEARS.particulier;
  const prescriptionDate = addYears(a.dueDate, years);
  const commercial = a.professional && a.debtorIsCompany;
  const warnings: string[] = [];
  if (a.today >= prescriptionDate) warnings.push(`La créance semble prescrite depuis le ${fr(prescriptionDate)} : l'injonction risque d'être rejetée.`);
  else if (daysBetween(a.today, prescriptionDate) <= 90)
    warnings.push(`La prescription tombe le ${fr(prescriptionDate)} : déposez la requête avant cette date.`);
  if (!a.noticeSentOn) warnings.push("Envoyez d'abord la mise en demeure et attendez la fin du délai laissé au client.");
  if (!a.debtorAddressComplete) warnings.push("L'adresse du client est incomplète : le tribunal ne pourra pas lui signifier l'ordonnance.");
  return {
    court: commercial ? "Tribunal de commerce" : "Tribunal judiciaire",
    courtHint: commercial
      ? "Le greffe du tribunal de commerce du siège du client. La requête peut aussi se déposer en ligne sur le site des greffes des tribunaux de commerce."
      : "Le tribunal judiciaire du domicile du client (ou sa chambre de proximité). La requête peut se faire en ligne sur justice.fr ou par courrier.",
    form: commercial
      ? "Requête en injonction de payer devant le tribunal de commerce (formulaire du greffe)"
      : "Formulaire Cerfa n° 12948 (requête en injonction de payer)",
    prescriptionDate,
    pieces: [
      { label: "Copie de la facture impayée", ok: true },
      {
        label: "Devis signé ou bon de commande accepté",
        ok: a.hasSignedQuote,
        hint: a.hasSignedQuote ? undefined : "Joignez tout écrit prouvant la commande.",
      },
      {
        label: "Copies des relances",
        ok: a.reminders > 0,
        hint: a.reminders
          ? `${a.reminders} relance${a.reminders > 1 ? "s" : ""} envoyée${a.reminders > 1 ? "s" : ""} par l'application.`
          : "Aucune relance enregistrée.",
      },
      {
        label: "Mise en demeure et accusé de réception",
        ok: Boolean(a.noticeSentOn),
        hint: a.noticeSentOn ? `Envoyée le ${fr(a.noticeSentOn)}.` : "Pas encore envoyée.",
      },
      { label: "Décompte des sommes réclamées", ok: true, hint: `${eur(a.claim.totalCents)} au ${fr(a.today)}.` },
      { label: "Extrait Kbis ou avis de situation de votre entreprise", ok: false, hint: "Moins de trois mois." },
    ],
    warnings,
  };
}
