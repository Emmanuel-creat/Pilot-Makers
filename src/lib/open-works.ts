/**
 * Base ouverte et collaborative des ouvrages du bâtiment : chaque artisan peut publier la fiche
 * technique d'un ouvrage (unité, mode opératoire, composition par unité, temps de pose, normes),
 * jamais ses prix. Les fiches sont sous Licence Ouverte 2.0 : tout le monde peut les lire, les
 * reprendre dans son catalogue et en publier une version dérivée.
 */

import { z } from "zod";
import { TRADES } from "@/lib/coordination";

export const LICENSE = { name: "Licence Ouverte 2.0", url: "https://www.etalab.gouv.fr/licence-ouverte-open-licence/" };
export const WORK_TRADES = TRADES.filter((t) => t.key !== "autre");
export const HIDE_AFTER_REPORTS = 3;

const tradeKeys = WORK_TRADES.map((t) => t.key) as [string, ...string[]];
const PRICE = /\d\s*(?:€|eur\b|euros?\b)/i;
const noPrice = (v: string) => !PRICE.test(v);
const NO_PRICE = "Pas de prix dans la base ouverte : elle décrit les ouvrages, chacun garde ses tarifs";

export const componentSchema = z.object({
  label: z.string().trim().min(2).max(120).refine(noPrice, NO_PRICE),
  quantity: z
    .string()
    .trim()
    .regex(/^\d+(?:[.,]\d{1,3})?$/, "Quantité par unité attendue (ex. 1,05)"),
  unit: z.string().trim().min(1).max(20),
});

export const workSchema = z.object({
  trade: z.enum(tradeKeys, { message: "Choisissez le corps d'état" }),
  title: z.string().trim().min(5, "Intitulé trop court").max(160).refine(noPrice, NO_PRICE),
  unit: z.string().trim().min(1, "Indiquez l'unité").max(20),
  description: z.string().trim().min(20, "Décrivez le mode opératoire en quelques phrases").max(4000).refine(noPrice, NO_PRICE),
  composition: z.array(componentSchema).max(20).default([]),
  labourMinutes: z.coerce.number().int().min(0).max(100000).nullable().default(null),
  refs: z.string().trim().max(300).default(""),
});
export type WorkInput = z.infer<typeof workSchema>;

/** Composition saisie une ligne par composant : « 1,05 ; m² ; Carreau grès cérame ». */
export function parseComposition(text: string): { components: { label: string; quantity: string; unit: string }[]; errors: number[] } {
  const components: { label: string; quantity: string; unit: string }[] = [];
  const errors: number[] = [];
  text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .forEach((l, i) => {
      if (!l) return;
      const [q, u, ...rest] = l.split(/\s*;\s*/);
      const c = componentSchema.safeParse({ quantity: q ?? "", unit: u ?? "", label: rest.join(" ; ") });
      if (c.success) components.push(c.data);
      else errors.push(i + 1);
    });
  return { components, errors };
}

/** Texte de composition, pour la description d'un article importé. */
export function compositionText(components: { label: string; quantity: string; unit: string }[], unit: string): string {
  return components.length ? `Composition par ${unit} : ${components.map((c) => `${c.label} ${c.quantity} ${c.unit}`).join(", ")}.` : "";
}
