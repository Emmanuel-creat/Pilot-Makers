/**
 * Campagnes e-mail vers les anciens clients (entretien, saison) : modèles, champs de fusion,
 * ciblage et mention de désinscription obligatoire.
 */

export const CAMPAIGN_TEMPLATES = {
  entretien: {
    label: "Entretien annuel",
    subject: "Votre entretien annuel avec {entreprise}",
    body: "Bonjour {prenom},\n\nIl y a environ un an, nous avons réalisé chez vous : {derniers_travaux}. Un entretien régulier prolonge la durée de vie de vos installations.\n\nRépondez simplement à ce message pour convenir d'un rendez-vous.\n\nBien cordialement,\n{entreprise}",
  },
  saison: {
    label: "Travaux de saison",
    subject: "Préparez la saison avec {entreprise}",
    body: "Bonjour {prenom},\n\nLa saison approche : c'est le bon moment pour vérifier vos installations et prévoir vos travaux avant l'affluence.\n\nNous restons à votre disposition pour un devis gratuit.\n\nBien cordialement,\n{entreprise}",
  },
  libre: { label: "Message libre", subject: "", body: "Bonjour {prenom},\n\n\n\nBien cordialement,\n{entreprise}" },
} as const;
export type CampaignTemplate = keyof typeof CAMPAIGN_TEMPLATES;

export const MERGE_FIELDS = ["prenom", "nom", "entreprise", "derniers_travaux"] as const;
export type MergeVars = Record<(typeof MERGE_FIELDS)[number], string>;

/** Remplace les champs {prenom}, {nom}... ; un champ vide disparaît proprement. */
export function render(text: string, vars: MergeVars): string {
  return text
    .replace(/\{(prenom|nom|entreprise|derniers_travaux)\}/g, (_, k: keyof MergeVars) => vars[k] ?? "")
    .replace(/Bonjour ,/g, "Bonjour,")
    .replace(/[ \t]+\n/g, "\n");
}

/** Champs inconnus laissés dans le texte, signalés avant l'envoi. */
export function unknownFields(text: string): string[] {
  return [...new Set([...text.matchAll(/\{([^{}\s]+)\}/g)].map((m) => m[1]).filter((f) => !(MERGE_FIELDS as readonly string[]).includes(f)))];
}

export function unsubscribeFooter(url: string, orgName: string): string {
  return `\n\n--\nVous recevez ce message car vous êtes client de ${orgName}. Pour ne plus recevoir ses offres : ${url}`;
}

export interface CampaignFilters {
  /** Dernière facture il y a au moins / au plus ce nombre de mois */
  monthsMin: number | null;
  monthsMax: number | null;
  type: "" | "particulier" | "entreprise" | "copropriete" | "autre";
  tag: string;
  postalPrefix: string;
}

export function readFilters(raw: Record<string, unknown>): CampaignFilters {
  const n = (v: unknown) => {
    const x = Number(String(v ?? "").trim());
    return String(v ?? "").trim() !== "" && Number.isInteger(x) && x >= 0 && x <= 240 ? x : null;
  };
  const type = String(raw.type ?? "");
  return {
    monthsMin: n(raw.monthsMin),
    monthsMax: n(raw.monthsMax),
    type: (["particulier", "entreprise", "copropriete", "autre"].includes(type) ? type : "") as CampaignFilters["type"],
    tag: String(raw.tag ?? "")
      .trim()
      .slice(0, 40),
    postalPrefix: String(raw.postalPrefix ?? "")
      .replace(/\D/g, "")
      .slice(0, 5),
  };
}

export const MAX_RECIPIENTS = 500;
