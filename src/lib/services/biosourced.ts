/** Alternatives biosourcées des lignes d'un devis, et ajout d'une variante en option. */

import { randomUUID } from "node:crypto";
import { alternativesFor, findAlternative, type LineAlternatives } from "@/lib/biosourced";
import { num } from "@/lib/db";
import { badRequest, notFound } from "@/lib/http";
import type { Ctx } from "./context";
import { audit } from "./context";
import { getDraft, saveDraft } from "./quotes";
import { EDITABLE_STATUSES } from "./quote-types";

const quantityOf = (q: string) => {
  const n = Number(q.replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(n) && n > 0 ? n : 0;
};

export const VARIANT_PREFIX = "Variante biosourcée : ";

/** Lignes du devis pour lesquelles une alternative biosourcée existe (hors options). */
export async function quoteAlternatives(ctx: Ctx, quoteId: string): Promise<(LineAlternatives & { lineId: string; hasVariant: boolean })[]> {
  const draft = await getDraft(ctx, quoteId);
  const lines = draft.sections.flatMap((s) => s.lines);
  const ids = [...new Set(lines.map((l) => l.catalogItemId).filter((x): x is string => !!x))];
  const carbon = new Map<string, number>();
  if (ids.length) {
    const rows = await ctx.db.query<{ id: string; carbon_g: unknown }>(
      "SELECT id, carbon_g FROM catalog_items WHERE org_id=$1 AND id = ANY($2::uuid[]) AND carbon_g IS NOT NULL",
      [ctx.orgId, ids],
    );
    for (const r of rows) carbon.set(r.id, num(r.carbon_g));
  }
  const variants = new Set(lines.filter((l) => l.label.startsWith(VARIANT_PREFIX)).map((l) => l.label));
  return lines.flatMap((l) => {
    if (l.kind !== "item" || l.optional || l.nature === "main_oeuvre" || l.nature === "deplacement") return [];
    const a = alternativesFor(l.label, l.unit, quantityOf(l.quantity), l.catalogItemId ? (carbon.get(l.catalogItemId) ?? null) : null);
    if (!a) return [];
    return [{ ...a, lineId: l.id, hasVariant: a.alternatives.some((x) => variants.has(VARIANT_PREFIX + x.label)) }];
  });
}

/**
 * Ajoute l'alternative choisie juste après la ligne d'origine, en option : le client compare
 * et choisit ; le prix est à compléter par l'artisan.
 */
export async function addBiosourcedVariant(ctx: Ctx, quoteId: string, lineId: string, alternativeId: string) {
  const alt = findAlternative(alternativeId);
  if (!alt) throw badRequest("Alternative inconnue");
  const draft = await getDraft(ctx, quoteId);
  if (!EDITABLE_STATUSES.includes(draft.status)) throw badRequest("Le devis n'est plus modifiable : dupliquez-le pour proposer une variante");
  const section = draft.sections.find((s) => s.lines.some((l) => l.id === lineId));
  if (!section) throw notFound("Ligne introuvable");
  const index = section.lines.findIndex((l) => l.id === lineId);
  const origin = section.lines[index];
  const label = VARIANT_PREFIX + alt.label;
  if (section.lines.some((l) => l.label === label)) throw badRequest("Cette variante figure déjà dans le devis");
  const variant = {
    ...origin,
    id: randomUUID(),
    catalogItemId: null,
    label,
    description: `${alt.note} Durée de vie indicative : ${alt.lifespanYears} ans. Fin de vie : ${alt.endOfLife.toLowerCase()}.`,
    unitPrice: "",
    unitCost: "",
    discountPercent: "",
    estimated: true,
    estimateNote: "Prix à compléter",
    internalNote: `Écart de prix indicatif sur la fourniture : ${alt.costDeltaPercent > 0 ? "+" : ""}${alt.costDeltaPercent} %`,
    optional: true,
    measure: undefined,
  };
  const sections = draft.sections.map((s) => (s === section ? { ...s, lines: [...s.lines.slice(0, index + 1), variant, ...s.lines.slice(index + 1)] } : s));
  await saveDraft(ctx, quoteId, { ...draft, sections }, draft.draftRevision);
  await audit(ctx.db, { orgId: ctx.orgId, userId: ctx.userId, action: "quote.biosourced_variant", target: quoteId, data: { alternativeId } });
}
