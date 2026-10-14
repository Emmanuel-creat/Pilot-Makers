/**
 * Veille réglementaire : évolutions des règles qui touchent les devis et factures des artisans,
 * avec leur date d'effet et ce qu'il faut faire. Chaque entrée est datée et identifiée : une entrée
 * nouvelle, ou dont l'échéance approche, est signalée jusqu'à ce que l'entreprise l'ait lue.
 * Ces informations aident à s'organiser ; elles ne remplacent pas le conseil d'un professionnel.
 */

export type WatchArea = "factures" | "devis" | "tva" | "social";

export interface WatchEntry {
  id: string;
  /** Date de publication dans la veille */
  published: string;
  /** Date d'entrée en vigueur */
  effective: string;
  area: WatchArea;
  title: string;
  summary: string;
  action: string;
  source: string;
  href?: string;
}

export const WATCH_AREAS: Record<WatchArea, string> = {
  factures: "Factures",
  devis: "Devis",
  tva: "TVA",
  social: "Équipe",
};

export const WATCH: WatchEntry[] = [
  {
    id: "facture-electronique-reception-2026",
    published: "2026-10-14",
    effective: "2026-09-01",
    area: "factures",
    title: "Réception des factures électroniques obligatoire",
    summary: "Depuis le 1er septembre 2026, toutes les entreprises doivent pouvoir recevoir les factures de leurs fournisseurs au format électronique.",
    action: "Choisissez une plateforme agréée pour recevoir vos factures d'achat et indiquez-la à vos fournisseurs.",
    source: "Loi de finances pour 2024, calendrier de la facturation électronique",
    href: "/aide/factures-electroniques",
  },
  {
    id: "mentions-factures-2026",
    published: "2026-10-14",
    effective: "2026-09-01",
    area: "factures",
    title: "Nouvelles mentions sur les factures",
    summary:
      "Les factures portent le numéro SIREN du client professionnel, l'adresse de réalisation si elle diffère de l'adresse de facturation, la nature des opérations (biens, services ou les deux) et, le cas échéant, l'option pour le paiement de la TVA d'après les débits.",
    action: "Renseignez le SIREN de vos clients professionnels et l'adresse du chantier sur vos devis.",
    source: "Réforme de la facturation électronique, mentions obligatoires",
    href: "/app/clients",
  },
  {
    id: "facture-electronique-emission-2027",
    published: "2026-10-14",
    effective: "2027-09-01",
    area: "factures",
    title: "Émission des factures électroniques pour les PME et micro-entreprises",
    summary:
      "À partir du 1er septembre 2027, les PME et micro-entreprises émettent leurs factures entre professionnels au format électronique, et transmettent les données de leurs ventes aux particuliers (e-reporting).",
    action: "Préparez le raccordement de Pilot-Makers à votre plateforme agréée avant l'échéance.",
    source: "Loi de finances pour 2024, calendrier de la facturation électronique",
    href: "/aide/factures-electroniques",
  },
];

/** Entrées à signaler : non lues, et publiées récemment ou dont l'entrée en vigueur est passée ou proche. */
export function pendingAlerts(entries: WatchEntry[], seen: string[], today: string, horizonDays = 120): WatchEntry[] {
  const limit = new Date(`${today}T12:00:00Z`);
  limit.setUTCDate(limit.getUTCDate() + horizonDays);
  const until = limit.toISOString().slice(0, 10);
  return entries.filter((e) => !seen.includes(e.id) && e.published <= today && e.effective <= until);
}

export function daysUntil(date: string, today: string): number {
  return Math.round((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86400000);
}
