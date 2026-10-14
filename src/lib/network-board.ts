/**
 * Bourse du réseau d'artisans : un membre surchargé propose une mission de renfort, un autre propose
 * les matériaux qui lui restent d'un chantier (réemploi). Les intéressés répondent, l'auteur choisit.
 */

import { z } from "zod";

export const POST_KINDS = { mission: "Mission de renfort", materiau: "Matériaux à céder" } as const;
export type PostKind = keyof typeof POST_KINDS;
export const POST_STATUSES = { ouverte: "Ouverte", pourvue: "Pourvue", retiree: "Retirée" } as const;
export type PostStatus = keyof typeof POST_STATUSES;

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const optDate = z.union([z.literal(""), z.string().regex(DATE, "Date invalide")]).default("");

export const postSchema = z
  .object({
    kind: z.enum(["mission", "materiau"]),
    title: z.string().trim().min(3, "Titre trop court").max(140),
    detail: z.string().trim().max(2000).default(""),
    trade: z.string().trim().max(60).default(""),
    city: z.string().trim().max(80).default(""),
    start: optDate,
    end: optDate,
    quantity: z.string().trim().max(20).default(""),
    unit: z.string().trim().max(20).default(""),
    price: z.string().trim().max(20).default(""),
  })
  .superRefine((p, c) => {
    if (p.kind === "mission" && (!p.start || !p.end)) c.addIssue({ code: "custom", message: "Indiquez les dates de la mission" });
    if (p.start && p.end && p.end < p.start) c.addIssue({ code: "custom", message: "La fin précède le début" });
    if (p.kind === "materiau" && !p.quantity) c.addIssue({ code: "custom", message: "Indiquez la quantité disponible" });
  });

/** Prix demandé en centimes : vide pour gratuit ou à débattre, null si illisible. */
export function priceCents(raw: string): number | null | "" {
  const t = raw.replace(/[\s€]/g, "").replace(",", ".");
  if (!t) return "";
  return /^\d+(\.\d{1,2})?$/.test(t) ? Math.round(Number(t) * 100) : null;
}

/** Une mission dont la date de fin est passée n'est plus montrée aux autres membres. */
export function isVisible(p: { status: PostStatus; kind: PostKind; end: string | null }, today: string): boolean {
  return p.status === "ouverte" && !(p.kind === "mission" && p.end && p.end < today);
}
