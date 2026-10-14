/**
 * Communauté d'entraide entre artisans : questions de métier, de gestion ou de normes, réponses
 * des confrères, votes et réponse retenue par l'auteur. Les messages sont signés par le métier et
 * le département, jamais par le nom : on échange entre pairs sans exposer son entreprise.
 */

import { z } from "zod";

export const TOPICS = {
  technique: "Technique et mise en œuvre",
  normes: "Normes et DTU",
  gestion: "Gestion et devis",
  juridique: "Assurances et juridique",
  outillage: "Outillage et matériaux",
  equipe: "Équipe et apprentis",
} as const;
export type Topic = keyof typeof TOPICS;
export const isTopic = (v: unknown): v is Topic => typeof v === "string" && v in TOPICS;

/** Nombre de signalements distincts qui masque un message en attendant la modération. */
export const REPORT_THRESHOLD = 3;

const CONTACT = /(?:\b0[1-9](?:[\s.-]?\d{2}){4}\b|\+33\s?[1-9](?:[\s.-]?\d{2}){4}|[\w.+-]+@[\w-]+\.[\w.]+)/;

const noContact = (v: string) => !CONTACT.test(v);
const CONTACT_MESSAGE = "Pas de téléphone ni d'adresse e-mail dans les messages publics : la communauté sert à s'entraider, pas à démarcher";

export const questionSchema = z.object({
  topic: z.enum(Object.keys(TOPICS) as [Topic, ...Topic[]], { message: "Choisissez un thème" }),
  title: z.string().trim().min(10, "Formulez la question en une phrase d'au moins 10 caractères").max(160).refine(noContact, CONTACT_MESSAGE),
  body: z.string().trim().max(4000).default("").refine(noContact, CONTACT_MESSAGE),
});

export const answerSchema = z.object({
  body: z.string().trim().min(10, "Réponse trop courte").max(4000).refine(noContact, CONTACT_MESSAGE),
});

export const reportSchema = z.object({
  reason: z.enum(["hors_sujet", "publicite", "irrespectueux", "dangereux"], { message: "Choisissez un motif" }),
});
export const REPORT_REASONS = {
  hors_sujet: "Hors sujet",
  publicite: "Publicité ou démarchage",
  irrespectueux: "Propos irrespectueux",
  dangereux: "Conseil dangereux",
} as const;

/** Signature publique : métier et département, sans nom. */
export function authorLabel(trade: string, postalCode: string, country = "France"): string {
  const t = trade.trim() || "Artisan";
  const pc = postalCode.trim();
  if (!pc || (country && country !== "France")) return country && country !== "France" ? `${t}, ${country}` : t;
  const dep = pc.startsWith("97") || pc.startsWith("98") ? pc.slice(0, 3) : pc.startsWith("20") ? (Number(pc) < 20200 ? "2A" : "2B") : pc.slice(0, 2);
  return `${t}, ${dep}`;
}

/** Réponse retenue d'abord, puis les plus utiles, puis les plus anciennes. */
export function rankAnswers<T extends { id: string; votes: number; createdAt: Date }>(answers: T[], acceptedId: string | null): T[] {
  return [...answers].sort(
    (a, b) => Number(b.id === acceptedId) - Number(a.id === acceptedId) || b.votes - a.votes || a.createdAt.getTime() - b.createdAt.getTime(),
  );
}
