/**
 * Stock du dépôt et des véhicules : articles suivis, entrées, sorties vers les chantiers (affectées au
 * coût du chantier quand le prix d'achat est connu), transferts, inventaires et dotation des véhicules.
 */

import { z } from "zod";
import { num, one, type Queryable } from "@/lib/db";
import { badRequest, isUuid, notFound } from "@/lib/http";
import { DEPOT, MOVE_KINDS, qtyAt, refillList, reorderList, round, stockLevels, stockValueCents, type MoveKind, type StockItemRef } from "@/lib/stock";
import type { Ctx } from "./context";
import { audit, can, requireWritable } from "./context";
import { parisDate } from "./quotes";

export interface StockItem extends StockItemRef {
  catalogItemId: string | null;
}

const qtyText = z
  .string()
  .trim()
  .default("")
  .transform((v) => (v === "" ? 0 : Number(v.replace(",", "."))))
  .refine((v) => Number.isFinite(v) && v >= 0 && v < 1_000_000, "Quantité invalide");

function mapItem(r: Record<string, unknown>): StockItem {
  return {
    id: String(r.id),
    label: String(r.label),
    unit: String(r.unit),
    minQty: Number(r.min_qty),
    reorderQty: Number(r.reorder_qty),
    supplier: String(r.supplier),
    unitCost4: r.unit_cost4 == null ? null : num(r.unit_cost4),
    catalogItemId: (r.catalog_item_id as string | null) ?? null,
  };
}

async function loadLevels(q: Queryable, orgId: string) {
  const rows = await q.query<{ item_id: string; location: string; qty: string }>(
    "SELECT item_id, location, sum(qty) AS qty FROM stock_moves WHERE org_id=$1 GROUP BY item_id, location",
    [orgId],
  );
  return stockLevels(rows.map((r) => ({ itemId: r.item_id, location: r.location, qty: Number(r.qty) })));
}

export async function getStock(ctx: Ctx) {
  const [items, vehicles, kits, levels, moves] = await Promise.all([
    ctx.db.query<Record<string, unknown>>("SELECT * FROM stock_items WHERE org_id=$1 AND archived_at IS NULL ORDER BY lower(label)", [ctx.orgId]),
    ctx.db.query<{ id: string; name: string }>("SELECT id, name FROM org_vehicles WHERE org_id=$1 ORDER BY name", [ctx.orgId]),
    ctx.db.query<{ item_id: string; vehicle_id: string; target_qty: string }>(
      "SELECT item_id, vehicle_id, target_qty FROM stock_vehicle_kits WHERE org_id=$1",
      [ctx.orgId],
    ),
    loadLevels(ctx.db, ctx.orgId),
    ctx.db.query<Record<string, unknown>>(
      `SELECT m.*, i.label, i.unit, j.title AS job_title, u.name AS author FROM stock_moves m JOIN stock_items i ON i.id=m.item_id
       LEFT JOIN jobs j ON j.id=m.job_id LEFT JOIN users u ON u.id=m.created_by
       WHERE m.org_id=$1 ORDER BY m.created_at DESC LIMIT 30`,
      [ctx.orgId],
    ),
  ]);
  const list = items.map(mapItem);
  const kitLines = kits.map((k) => ({ itemId: k.item_id, vehicleId: k.vehicle_id, target: Number(k.target_qty) }));
  const showCosts = can(ctx, "costs");
  return {
    items: list,
    vehicles,
    locations: [{ id: DEPOT, name: "Dépôt" }, ...vehicles],
    qty: (itemId: string, location: string) => qtyAt(levels, itemId, location),
    kits: kitLines,
    reorder: reorderList(list, levels).map((r) => ({ ...r, costCents: showCosts ? r.costCents : null })),
    refill: refillList(kitLines, levels),
    valueCents: showCosts ? stockValueCents(list, levels) : null,
    moves: moves.map((m) => ({
      id: String(m.id),
      at: new Date(m.created_at as string).toISOString(),
      label: String(m.label),
      unit: String(m.unit),
      location: String(m.location),
      qty: Number(m.qty),
      kind: m.kind as MoveKind,
      jobTitle: (m.job_title as string | null) ?? null,
      note: String(m.note),
      author: String(m.author ?? ""),
    })),
  };
}

const itemSchema = z.object({
  catalogItemId: z.string().default(""),
  label: z.string().trim().max(200).default(""),
  unit: z.string().trim().max(20).default(""),
  supplier: z.string().trim().max(120).default(""),
  minQty: qtyText,
  reorderQty: qtyText,
});

export async function createStockItem(ctx: Ctx, raw: unknown) {
  requireWritable(ctx);
  const p = itemSchema.safeParse(raw);
  if (!p.success) throw badRequest(p.error.issues[0].message);
  const v = p.data;
  let catalog: { id: string; name: string; unit: string; unit_cost4: unknown; supplier: string } | null = null;
  if (v.catalogItemId) {
    if (!isUuid(v.catalogItemId)) throw badRequest("Article du catalogue inconnu");
    catalog = await one(ctx.db, "SELECT id, name, unit, unit_cost4, supplier FROM catalog_items WHERE id=$1 AND org_id=$2", [v.catalogItemId, ctx.orgId]);
    if (!catalog) throw badRequest("Article du catalogue inconnu");
    if (await one(ctx.db, "SELECT 1 FROM stock_items WHERE org_id=$1 AND catalog_item_id=$2 AND archived_at IS NULL", [ctx.orgId, catalog.id]))
      throw badRequest("Cet article est déjà suivi en stock");
  }
  const label = v.label || catalog?.name || "";
  if (label.length < 2) throw badRequest("Indiquez l'article à suivre");
  const n = await one<{ n: string }>(ctx.db, "SELECT count(*) AS n FROM stock_items WHERE org_id=$1 AND archived_at IS NULL", [ctx.orgId]);
  if (Number(n?.n) >= 500) throw badRequest("500 articles suivis au plus");
  const r = await one<{ id: string }>(
    ctx.db,
    `INSERT INTO stock_items (org_id, catalog_item_id, label, unit, unit_cost4, supplier, min_qty, reorder_qty) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
    [
      ctx.orgId,
      catalog?.id ?? null,
      label,
      v.unit || catalog?.unit || "u",
      catalog?.unit_cost4 == null ? null : num(catalog.unit_cost4),
      v.supplier || catalog?.supplier || "",
      v.minQty,
      v.reorderQty,
    ],
  );
  await audit(ctx.db, { orgId: ctx.orgId, userId: ctx.userId, action: "stock.item_add", target: r!.id, ip: ctx.ip });
  return r!.id;
}

async function requireItem(ctx: Ctx, id: string) {
  if (!isUuid(id)) throw notFound("Article introuvable");
  const r = await one<Record<string, unknown>>(ctx.db, "SELECT * FROM stock_items WHERE id=$1 AND org_id=$2 AND archived_at IS NULL", [id, ctx.orgId]);
  if (!r) throw notFound("Article introuvable");
  return mapItem(r);
}

export async function setThresholds(ctx: Ctx, id: string, raw: unknown) {
  requireWritable(ctx);
  await requireItem(ctx, id);
  const p = itemSchema.pick({ minQty: true, reorderQty: true }).safeParse(raw);
  if (!p.success) throw badRequest(p.error.issues[0].message);
  await ctx.db.query("UPDATE stock_items SET min_qty=$3, reorder_qty=$4 WHERE id=$1 AND org_id=$2", [id, ctx.orgId, p.data.minQty, p.data.reorderQty]);
}

export async function archiveStockItem(ctx: Ctx, id: string) {
  requireWritable(ctx);
  await requireItem(ctx, id);
  await ctx.db.query("UPDATE stock_items SET archived_at=now() WHERE id=$1 AND org_id=$2", [id, ctx.orgId]);
}

async function requireLocation(ctx: Ctx, loc: string) {
  if (loc === DEPOT) return;
  if (!isUuid(loc) || !(await one(ctx.db, "SELECT 1 FROM org_vehicles WHERE id=$1 AND org_id=$2", [loc, ctx.orgId]))) throw badRequest("Emplacement inconnu");
}

const moveSchema = z.object({
  itemId: z.string(),
  kind: z.enum(Object.keys(MOVE_KINDS) as [MoveKind, ...MoveKind[]]),
  qty: qtyText,
  from: z.string().default(DEPOT),
  to: z.string().default(DEPOT),
  jobId: z.string().default(""),
  note: z.string().trim().max(200).default(""),
});

/** Enregistre un mouvement ; une sortie vers un chantier y ajoute son coût d'achat quand il est connu. */
export async function moveStock(ctx: Ctx, raw: unknown, now = new Date()) {
  requireWritable(ctx);
  const p = moveSchema.safeParse(raw);
  if (!p.success) throw badRequest(p.error.issues[0].message);
  const v = p.data;
  const item = await requireItem(ctx, v.itemId);
  if (v.kind !== "inventaire" && v.qty <= 0) throw badRequest("Indiquez une quantité");
  const levels = await loadLevels(ctx.db, ctx.orgId);
  const available = (loc: string) => qtyAt(levels, item.id, loc);
  const rows: { location: string; qty: number }[] = [];
  let jobId: string | null = null;
  if (v.kind === "entree") {
    await requireLocation(ctx, v.to);
    rows.push({ location: v.to, qty: v.qty });
  } else if (v.kind === "sortie") {
    await requireLocation(ctx, v.from);
    if (!isUuid(v.jobId) || !(await one(ctx.db, "SELECT 1 FROM jobs WHERE id=$1 AND org_id=$2", [v.jobId, ctx.orgId])))
      throw badRequest("Choisissez le chantier");
    if (v.qty > available(v.from)) throw badRequest(`Stock insuffisant : ${available(v.from).toLocaleString("fr-FR")} ${item.unit} disponibles`);
    jobId = v.jobId;
    rows.push({ location: v.from, qty: -v.qty });
  } else if (v.kind === "transfert") {
    await requireLocation(ctx, v.from);
    await requireLocation(ctx, v.to);
    if (v.from === v.to) throw badRequest("Choisissez deux emplacements différents");
    if (v.qty > available(v.from)) throw badRequest(`Stock insuffisant : ${available(v.from).toLocaleString("fr-FR")} ${item.unit} disponibles`);
    rows.push({ location: v.from, qty: -v.qty }, { location: v.to, qty: v.qty });
  } else {
    await requireLocation(ctx, v.to);
    const delta = round(v.qty - available(v.to));
    if (delta === 0) return { delta: 0 };
    rows.push({ location: v.to, qty: delta });
  }
  await ctx.db.transaction(async (tx) => {
    for (const r of rows) {
      await tx.query("INSERT INTO stock_moves (org_id, item_id, location, qty, kind, job_id, note, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)", [
        ctx.orgId,
        item.id,
        r.location,
        r.qty,
        v.kind,
        jobId,
        v.note,
        ctx.userId,
      ]);
    }
    if (jobId && item.unitCost4 != null) {
      const cents = Math.round((item.unitCost4 * v.qty) / 100);
      if (cents > 0) {
        await tx.query(
          `INSERT INTO job_purchases (org_id, job_id, purchase_date, supplier, label, category, amount_ht_cents, reference, created_by)
           VALUES ($1,$2,$3,'Stock',$4,'materiau',$5,'',$6)`,
          [ctx.orgId, jobId, parisDate(now), `Sortie de stock : ${item.label} (${v.qty.toLocaleString("fr-FR")} ${item.unit})`, cents, ctx.userId],
        );
      }
    }
  });
  await audit(ctx.db, { orgId: ctx.orgId, userId: ctx.userId, action: `stock.${v.kind}`, target: item.id, data: { qty: v.qty }, ip: ctx.ip });
  return { delta: rows.reduce((s, r) => s + r.qty, 0) };
}

/** Dotation d'un véhicule : quantité à garder à bord ; zéro la retire. */
export async function setVehicleKit(ctx: Ctx, itemId: string, vehicleId: string, target: string) {
  requireWritable(ctx);
  await requireItem(ctx, itemId);
  if (vehicleId === DEPOT) throw badRequest("Choisissez un véhicule");
  await requireLocation(ctx, vehicleId);
  const q = qtyText.safeParse(target);
  if (!q.success) throw badRequest(q.error.issues[0].message);
  if (q.data === 0) {
    await ctx.db.query("DELETE FROM stock_vehicle_kits WHERE item_id=$1 AND vehicle_id=$2 AND org_id=$3", [itemId, vehicleId, ctx.orgId]);
    return;
  }
  await ctx.db.query(
    `INSERT INTO stock_vehicle_kits (item_id, vehicle_id, org_id, target_qty) VALUES ($1,$2,$3,$4)
     ON CONFLICT (item_id, vehicle_id) DO UPDATE SET target_qty=$4`,
    [itemId, vehicleId, ctx.orgId, q.data],
  );
}
