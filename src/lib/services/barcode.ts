/** Recherche d'un code-barres scanné dans le catalogue, le stock et les tarifs fournisseurs, et association d'un code à un article. */

import { z } from "zod";
import { num, one } from "@/lib/db";
import { canonical, codeKind, isGtin, normalizeCode, variants } from "@/lib/barcode";
import { badRequest, isUuid, notFound } from "@/lib/http";
import { DEPOT } from "@/lib/stock";
import type { Ctx } from "./context";
import { audit, can, requireWritable } from "./context";

const NORM = (col: string) => `regexp_replace(upper(${col}), '[^0-9A-Z]', '', 'g')`;

export async function lookupCode(ctx: Ctx, raw: string) {
  const code = normalizeCode(raw);
  if (!code) return null;
  const keys = variants(code).map((k) => k.toUpperCase());
  const showCosts = can(ctx, "costs");
  const [catalog, prices] = await Promise.all([
    ctx.db.query<Record<string, unknown>>(
      `SELECT id, reference, name, unit, unit_price4, unit_cost4, supplier, ean FROM catalog_items
       WHERE org_id=$1 AND (${NORM("ean")} = ANY($2) OR ${NORM("reference")} = ANY($2) OR ${NORM("supplier_ref")} = ANY($2))
       ORDER BY active DESC, lower(name) LIMIT 20`,
      [ctx.orgId, keys],
    ),
    ctx.db.query<Record<string, unknown>>(
      `SELECT supplier, reference, label, unit, net_price4, imported_at FROM supplier_prices
       WHERE org_id=$1 AND (${NORM("ean")} = ANY($2) OR ${NORM("reference")} = ANY($2)) ORDER BY net_price4 LIMIT 20`,
      [ctx.orgId, keys],
    ),
  ]);
  const catalogIds = catalog.map((c) => String(c.id));
  const stock = await ctx.db.query<Record<string, unknown>>(
    `SELECT i.id, i.label, i.unit, i.ean, coalesce((SELECT sum(qty) FROM stock_moves m WHERE m.item_id=i.id AND m.location=$3), 0) AS depot
     FROM stock_items i WHERE i.org_id=$1 AND i.archived_at IS NULL AND (${NORM("i.ean")} = ANY($2) OR i.catalog_item_id = ANY($4::uuid[]))
     ORDER BY lower(i.label) LIMIT 20`,
    [ctx.orgId, keys, DEPOT, catalogIds],
  );
  return {
    code,
    canonical: canonical(code),
    kind: codeKind(code),
    valid: isGtin(code),
    catalog: catalog.map((c) => ({
      id: String(c.id),
      reference: String(c.reference),
      name: String(c.name),
      unit: String(c.unit),
      priceCents: Math.round(num(c.unit_price4) / 100),
      costCents: showCosts && c.unit_cost4 != null ? Math.round(num(c.unit_cost4) / 100) : null,
      supplier: String(c.supplier),
    })),
    stock: stock.map((r) => ({ id: String(r.id), label: String(r.label), unit: String(r.unit), depot: Number(r.depot) })),
    prices: showCosts
      ? prices.map((p) => ({
          supplier: String(p.supplier),
          reference: String(p.reference),
          label: String(p.label),
          unit: String(p.unit),
          netCents: Math.round(num(p.net_price4) / 100),
        }))
      : [],
  };
}

const assignSchema = z.object({
  target: z.enum(["catalog", "stock"]),
  id: z.string(),
  code: z.string().trim().max(60),
});

/** Associe le code lu à un article du catalogue ou du stock, pour le retrouver au prochain scan. */
export async function assignCode(ctx: Ctx, raw: unknown) {
  requireWritable(ctx);
  const p = assignSchema.safeParse(raw);
  if (!p.success) throw badRequest("Choisissez l'article");
  const code = canonical(p.data.code);
  if (code.length < 4) throw badRequest("Code trop court");
  if (/^\d+$/.test(code) && !isGtin(code)) throw badRequest("Code-barres invalide : la clé de contrôle ne correspond pas");
  if (!isUuid(p.data.id)) throw notFound("Article introuvable");
  const table = p.data.target === "catalog" ? "catalog_items" : "stock_items";
  const r = await one(ctx.db, `UPDATE ${table} SET ean=$3 WHERE id=$1 AND org_id=$2 RETURNING id`, [p.data.id, ctx.orgId, code]);
  if (!r) throw notFound("Article introuvable");
  await audit(ctx.db, { orgId: ctx.orgId, userId: ctx.userId, action: "barcode.assign", target: p.data.id, data: { table, code }, ip: ctx.ip });
  return code;
}
