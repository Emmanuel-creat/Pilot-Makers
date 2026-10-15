/**
 * Reprise d'entreprises artisanales : un artisan qui part à la retraite publie une annonce anonyme, un repreneur
 * la trouve et prend contact. Fonctions pures.
 *
 * L'annonce ne dit jamais qui est l'entreprise : ni nom, ni adresse, ni téléphone, ni e-mail, ni numéro SIRET. Le
 * chiffre d'affaires et l'effectif sont publiés en tranches, calculées depuis les chiffres tenus dans
 * l'application, jamais saisis à la main. Le texte est vérifié avant publication pour qu'il ne trahisse pas
 * l'identité du cédant.
 */

import { z } from "zod";

export const LISTING_STATUS = { brouillon: "Brouillon", publiee: "Publiée", retiree: "Retirée" } as const;
export type ListingStatus = keyof typeof LISTING_STATUS;

export const REASONS = {
  retraite: "Départ à la retraite",
  reconversion: "Reconversion",
  demenagement: "Déménagement",
  sante: "Raisons de santé",
  autre: "Autre raison",
} as const;
export type Reason = keyof typeof REASONS;

/** Tranches de chiffre d'affaires annuel moyen HT, bornes hautes exclues, en centimes */
export const REVENUE_BANDS = [
  { key: "moins-100k", label: "Moins de 100 000 €", max: 100_000_00 },
  { key: "100k-250k", label: "100 000 à 250 000 €", max: 250_000_00 },
  { key: "250k-500k", label: "250 000 à 500 000 €", max: 500_000_00 },
  { key: "500k-1m", label: "500 000 € à 1 million €", max: 1_000_000_00 },
  { key: "plus-1m", label: "Plus de 1 million €", max: Infinity },
] as const;

export const STAFF_BANDS = [
  { key: "seul", label: "Dirigeant seul", max: 1 },
  { key: "2-5", label: "2 à 5 personnes", max: 5 },
  { key: "6-10", label: "6 à 10 personnes", max: 10 },
  { key: "plus-10", label: "Plus de 10 personnes", max: Infinity },
] as const;

/** Tranche du chiffre d'affaires moyen des exercices renseignés ; vide sans aucun exercice facturé */
export function revenueBand(yearsRevenueCents: readonly number[]): string {
  const filled = yearsRevenueCents.filter((v) => v > 0);
  if (!filled.length) return "";
  const avg = filled.reduce((s, v) => s + v, 0) / filled.length;
  return REVENUE_BANDS.find((b) => avg < b.max)!.key;
}

export function staffBand(people: number): string {
  const n = Math.max(1, Math.floor(people));
  return STAFF_BANDS.find((b) => n <= b.max)!.key;
}

export const bandLabel = (bands: readonly { key: string; label: string }[], key: string) => bands.find((b) => b.key === key)?.label ?? "Non communiqué";

export const listingSchema = z.object({
  headline: z.string().trim().min(10, "Donnez un titre à l'annonce (10 caractères au moins)").max(120, "Titre trop long (120 caractères au plus)"),
  description: z
    .string()
    .trim()
    .min(40, "Décrivez l'activité en quelques phrases (40 caractères au moins)")
    .max(4000, "Description trop longue (4 000 caractères au plus)"),
  reason: z.enum(Object.keys(REASONS) as [Reason, ...Reason[]]).default("retraite"),
  accompanimentMonths: z.coerce.number().int().min(0, "Durée d'accompagnement invalide").max(24, "Accompagnement de 24 mois au plus").default(0),
});
export type ListingInput = z.infer<typeof listingSchema>;

export interface Identity {
  /** Noms de l'entreprise : enseigne, raison sociale */
  names: string[];
  siret: string;
  phone: string;
  email: string;
  /** Rue de l'adresse de l'entreprise */
  street: string;
}

const fold = (v: string) =>
  v
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
const digits = (v: string) => v.replace(/\D/g, "");

/**
 * Éléments du texte qui permettraient d'identifier le cédant : nom de l'entreprise, numéro SIRET ou SIREN,
 * numéro de téléphone, adresse e-mail ou site, rue. Liste vide : le texte peut être publié.
 */
export function identifyingFragments(text: string, id: Identity): string[] {
  const found: string[] = [];
  const t = ` ${fold(text)} `;
  for (const n of id.names) {
    const f = fold(n);
    if (f.length >= 3 && t.includes(` ${f} `)) found.push("le nom de l'entreprise");
  }
  const allDigits = digits(text);
  const siren = digits(id.siret).slice(0, 9);
  if (siren.length === 9 && allDigits.includes(siren)) found.push("le numéro SIRET ou SIREN");
  else if (/\b\d{3}\s?\d{3}\s?\d{3}(\s?\d{5})?\b/.test(text)) found.push("un numéro d'immatriculation");
  if (/(?:\+33\s?|0)[1-9](?:[\s.-]?\d{2}){4}/.test(text) || (digits(id.phone).length >= 9 && allDigits.includes(digits(id.phone).slice(-9)))) {
    found.push("un numéro de téléphone");
  }
  if (/[^\s@]+@[^\s@]+\.[a-z]{2,}/i.test(text) || (id.email && text.toLowerCase().includes(id.email.toLowerCase()))) found.push("une adresse e-mail");
  if (/\b(?:https?:\/\/|www\.)\S+/i.test(text)) found.push("une adresse de site");
  const street = fold(id.street).replace(/^\d+\s*(?:bis |ter )?/, "");
  if (street.length >= 6 && t.includes(` ${street} `)) found.push("l'adresse de l'entreprise");
  return [...new Set(found)];
}

export const contactSchema = z.object({
  name: z.string().trim().min(2, "Indiquez votre nom").max(160),
  email: z.string().trim().max(254).default(""),
  phone: z.string().trim().max(30).default(""),
  message: z.string().trim().min(20, "Présentez votre projet de reprise en quelques phrases (20 caractères au moins)").max(4000),
  /** Champ invisible : rempli seulement par les robots */
  website: z.string().default(""),
});

/** Référence publique courte d'une annonce, sans rien révéler de l'entreprise */
export const listingRef = (id: string) => `R-${id.replace(/-/g, "").slice(0, 6).toUpperCase()}`;
