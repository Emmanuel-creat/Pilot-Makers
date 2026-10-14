/**
 * Empreinte carbone des articles du catalogue et bilan carbone des devis.
 */

import { z } from "zod";
import { parseScaled } from "@/lib/calc/decimal";
import { CARBON_SOURCES, defaultFactor, quoteCarbonBalance, type CarbonSource } from "@/lib/carbon";
import { num, one } from "@/lib/db";
import { badRequest, isUuid, notFound } from "@/lib/http";
import type { Ctx } from "./context";
import { audit, requireWritable } from "./context";

export async function getItemCarbon(ctx: Ctx, itemId: string) {
  if (!isUuid(itemId)) throw notFound("Article introuvable");
  const it = await one<{ name: string; unit: string; carbon_g: unknown; carbon_source: string }>(
    ctx.db,
    "SELECT name, unit, carbon_g, carbon_source FROM catalog_items WHERE id=$1 AND org_id=$2",
    [itemId, ctx.orgId],
  );
  if (!it) throw notFound("Article introuvable");
  const f = defaultFactor(it.name, it.unit);
  return {
    grams: it.carbon_g == null ? null : num(it.carbon_g),
    source: (it.carbon_source || null) as CarbonSource | null,
    suggestion: f ? { grams: f.grams, label: f.label } : null,
  };
}

const schema = z.object({
  kg: z.string().trim().max(20).default(""),
  source: z.enum(Object.keys(CARBON_SOURCES) as [CarbonSource, ...CarbonSource[]]).default("fdes"),
});

/** Facteur saisi en kilogrammes de CO2e par unité ; vide pour l'effacer. */
export async function setItemCarbon(ctx: Ctx, itemId: string, raw: unknown) {
  requireWritable(ctx);
  const p = schema.safeParse(raw);
  if (!p.success) throw badRequest("Source de la donnée invalide");
  let grams: number | null = null;
  if (p.data.kg) {
    try {
      grams = Number(parseScaled(p.data.kg.replace(/\s/g, ""), 3));
    } catch {
      throw badRequest("Empreinte invalide : indiquez des kilogrammes, par exemple 12,5");
    }
    if (grams < 0 || grams > 100_000_000) throw badRequest("Empreinte hors limites");
  }
  if (!isUuid(itemId)) throw notFound("Article introuvable");
  const r = await ctx.db.query("UPDATE catalog_items SET carbon_g=$3, carbon_source=$4, updated_at=now() WHERE id=$1 AND org_id=$2 RETURNING id", [
    itemId,
    ctx.orgId,
    grams,
    grams == null ? "" : p.data.source,
  ]);
  if (!r.length) throw notFound("Article introuvable");
  await audit(ctx.db, { orgId: ctx.orgId, userId: ctx.userId, action: "catalog.carbon", target: itemId, data: { grams }, ip: ctx.ip });
  return grams;
}

/** Bilan carbone des produits du devis (options exclues), d'après le catalogue ou un ordre de grandeur. */
export async function quoteCarbon(ctx: Ctx, quoteId: string) {
  if (!isUuid(quoteId)) throw notFound("Devis introuvable");
  const q = await one(ctx.db, "SELECT 1 FROM quotes WHERE id=$1 AND org_id=$2", [quoteId, ctx.orgId]);
  if (!q) throw notFound("Devis introuvable");
  const rows = await ctx.db.query<{ label: string; unit: string; quantity: string; nature: string; carbon_g: unknown }>(
    `SELECT l.label, l.unit, l.quantity, l.nature, c.carbon_g FROM quote_lines l LEFT JOIN catalog_items c ON c.id=l.catalog_item_id
     WHERE l.quote_id=$1 AND l.org_id=$2 AND l.kind='item' AND NOT l.optional ORDER BY l.position`,
    [quoteId, ctx.orgId],
  );
  return quoteCarbonBalance(
    rows.map((r) => {
      let qty = 0;
      try {
        qty = Math.max(0, Number(parseScaled(r.quantity.replace(/\s/g, "") || "0", 3)));
      } catch {
        qty = 0;
      }
      return { label: r.label, unit: r.unit, quantityMilli: qty, nature: r.nature, itemGrams: r.carbon_g == null ? null : num(r.carbon_g) };
    }),
  );
}
