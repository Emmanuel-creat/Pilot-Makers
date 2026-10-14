/** Fiches produits enrichies du catalogue, et délais d'approvisionnement des articles d'un devis. */

import { one } from "@/lib/db";
import { badRequest, isUuid, notFound } from "@/lib/http";
import { isEmpty, longestLead, productSummary, readProductInfo, type ProductInfo } from "@/lib/product-info";
import type { Ctx } from "./context";
import { requireWritable } from "./context";

export async function getProductInfo(ctx: Ctx, itemId: string): Promise<ProductInfo> {
  if (!isUuid(itemId)) throw notFound("Article introuvable");
  const r = await one<{ product_info: unknown }>(ctx.db, "SELECT product_info FROM catalog_items WHERE id=$1 AND org_id=$2", [itemId, ctx.orgId]);
  if (!r) throw notFound("Article introuvable");
  return readProductInfo(r.product_info);
}

export async function saveProductInfo(ctx: Ctx, itemId: string, raw: Record<string, unknown>) {
  requireWritable(ctx);
  await getProductInfo(ctx, itemId);
  for (const [k, max, label] of [
    ["warrantyYears", 50, "La garantie s'exprime en années, de 0 à 50"],
    ["leadDays", 365, "Le délai s'exprime en jours, de 0 à 365"],
  ] as const) {
    const v = String(raw[k] ?? "").trim();
    if (v && !(Number.isInteger(Number(v)) && Number(v) >= 0 && Number(v) <= max)) throw badRequest(label);
  }
  const info = readProductInfo(raw);
  await ctx.db.query("UPDATE catalog_items SET product_info=$3 WHERE id=$1 AND org_id=$2", [itemId, ctx.orgId, JSON.stringify(isEmpty(info) ? {} : info)]);
  return info;
}

/** Fiches des articles du catalogue utilisés sur le devis, et le délai qui conditionne le démarrage. */
export async function quoteProducts(ctx: Ctx, quoteId: string) {
  if (!isUuid(quoteId)) throw notFound("Devis introuvable");
  const rows = await ctx.db.query<{ label: string; product_info: unknown }>(
    `SELECT DISTINCT ON (c.id) l.label, c.product_info FROM quote_lines l JOIN catalog_items c ON c.id=l.catalog_item_id
     WHERE l.quote_id=$1 AND l.org_id=$2 AND l.kind='item' AND NOT l.optional AND c.product_info <> '{}'::jsonb`,
    [quoteId, ctx.orgId],
  );
  const items = rows.map((r) => ({ label: r.label, info: readProductInfo(r.product_info) })).filter((i) => !isEmpty(i.info));
  return {
    items: items.map((i) => ({ label: i.label, summary: productSummary(i.info), warrantyYears: i.info.warrantyYears })),
    lead: longestLead(items),
  };
}
