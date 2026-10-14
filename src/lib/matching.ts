/**
 * Mise en relation avec les particuliers qui cherchent un artisan.
 *
 * L'artisan choisit ses métiers, ses départements et le nombre de demandes qu'il accepte par semaine.
 * Une demande est transmise à trois artisans au plus, en priorité à ceux qui en ont reçu le moins
 * récemment : la répartition reste équitable, sans enchères ni achat de contacts.
 */

import { z } from "zod";
import { TRADES } from "@/lib/coordination";

export const MATCH_TRADES = TRADES.filter((t) => t.key !== "autre");
export const MAX_ARTISANS = 3;

export const TIMEFRAMES = {
  urgent: "Urgent (sous une semaine)",
  mois: "Dans le mois",
  trimestre: "Dans les trois mois",
  projet: "Projet sans date",
} as const;
export type Timeframe = keyof typeof TIMEFRAMES;

/** Département d'un code postal français (2A et 2B pour la Corse, trois chiffres outre-mer). */
export function departmentOf(postalCode: string): string | null {
  const pc = postalCode.replace(/\s/g, "");
  if (!/^\d{5}$/.test(pc)) return null;
  if (pc.startsWith("97") || pc.startsWith("98")) return pc.slice(0, 3);
  if (pc.startsWith("20")) return Number(pc) < 20200 ? "2A" : "2B";
  return pc.slice(0, 2);
}

const DEPARTMENT = /^(0[1-9]|[1-8]\d|9[0-5]|2A|2B|97[1-6])$/;

/** Liste saisie librement (« 69, 01 38 ») vers des départements valides, sans doublon. */
export function parseDepartments(raw: string): { departments: string[]; invalid: string[] } {
  const parts = raw
    .toUpperCase()
    .split(/[\s,;]+/)
    .map((p) => (/^\d$/.test(p) ? `0${p}` : p))
    .filter(Boolean);
  const departments = [...new Set(parts.filter((p) => DEPARTMENT.test(p)))].sort();
  return { departments, invalid: parts.filter((p) => !DEPARTMENT.test(p)) };
}

const tradeKeys = MATCH_TRADES.map((t) => t.key) as [string, ...string[]];

export const matchingProfileSchema = z.object({
  enabled: z.boolean(),
  trades: z.array(z.enum(tradeKeys)).max(MATCH_TRADES.length),
  departments: z.string().max(400),
  weeklyCap: z.coerce.number().int().min(1, "Au moins une demande par semaine").max(50, "Cinquante demandes par semaine au plus"),
});

export const matchRequestSchema = z.object({
  trade: z.enum(tradeKeys, { message: "Choisissez le type de travaux" }),
  postalCode: z
    .string()
    .trim()
    .refine((v) => departmentOf(v) !== null, "Code postal à 5 chiffres attendu"),
  city: z.string().trim().max(120).default(""),
  description: z.string().trim().min(20, "Décrivez vos travaux en quelques phrases").max(4000),
  timeframe: z.enum(Object.keys(TIMEFRAMES) as [Timeframe, ...Timeframe[]], { message: "Indiquez quand commencer" }),
  name: z.string().trim().min(2, "Indiquez votre nom").max(160),
  email: z.string().trim().max(254).default(""),
  phone: z.string().trim().max(30).default(""),
  consent: z.literal(true, { message: "Acceptez que les artisans choisis vous recontactent" }),
  /** Champ invisible : rempli seulement par les robots */
  website: z.string().default(""),
});
export type MatchRequest = z.infer<typeof matchRequestSchema>;

export interface Candidate {
  orgId: string;
  weeklyCap: number;
  /** Demandes transmises ces 7 derniers jours */
  lastWeek: number;
  /** Dernière demande transmise, ou null */
  lastAt: Date | null;
}

/** Artisans retenus : sous leur plafond, ceux qui ont le moins reçu d'abord, puis le plus anciennement servi. */
export function pickArtisans(candidates: Candidate[], max = MAX_ARTISANS): string[] {
  return candidates
    .filter((c) => c.lastWeek < c.weeklyCap)
    .sort((a, b) => a.lastWeek - b.lastWeek || (a.lastAt?.getTime() ?? 0) - (b.lastAt?.getTime() ?? 0) || a.orgId.localeCompare(b.orgId))
    .slice(0, max)
    .map((c) => c.orgId);
}
