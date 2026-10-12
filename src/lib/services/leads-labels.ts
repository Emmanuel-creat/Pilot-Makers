/** Libellés des demandes entrantes, partagés entre le serveur et le navigateur. */

export const LEAD_STATUSES = {
  nouvelle: "Nouvelle",
  contactee: "Recontactée",
  visite: "Visite prévue",
  devis: "Devis en cours",
  gagnee: "Gagnée",
  perdue: "Perdue",
} as const;
export type LeadStatus = keyof typeof LEAD_STATUSES;
export const STATUS_CODES = Object.keys(LEAD_STATUSES) as [LeadStatus, ...LeadStatus[]];
/** Statuts encore à suivre */
export const OPEN_LEAD_STATUSES: LeadStatus[] = ["nouvelle", "contactee", "visite", "devis"];

export const LEAD_SOURCES = {
  telephone: "Appel téléphonique",
  site: "Site internet ou formulaire",
  recommandation: "Recommandation",
  plateforme: "Plateforme de mise en relation",
  salon: "Salon ou chantier vu",
  autre: "Autre",
} as const;
export const SOURCE_CODES = Object.keys(LEAD_SOURCES) as [keyof typeof LEAD_SOURCES, ...(keyof typeof LEAD_SOURCES)[]];
