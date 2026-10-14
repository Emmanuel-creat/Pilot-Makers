/**
 * Écarts de coût analysés sur les chantiers terminés : pour chaque article du catalogue, coût prévu au devis
 * et coût réel (achats affectés à la tâche, marchandise reçue sur les commandes), puis correction proposée.
 */

import { parseScaled } from "@/lib/calc/decimal";
import { num, one } from "@/lib/db";
import { badRequest, conflict, isUuid, notFound } from "@/lib/http";
import { keepMarginPrice4, laborReview, reviewItem, type CostSample, type ItemReview } from "@/lib/price-review";
import type { Ctx } from "./context";
import { audit, requirePermission, requireWritable } from "./context";
import { recomputeParentsOf } from "./ouvrages";
import { jobHours } from "./timesheets";

const DONE = "('termine', 'receptionne')";

function quantityMilli(text: string) {
  try {
    const v = Number(parseScaled(text.trim() || "0", 3));
    return v > 0 ? v : 0;
  } catch {
    return 0;
  }
}

export interface ItemGap extends ItemReview {
  itemId: string;
  reference: string;
  name: string;
  unit: string;
  costCents: number | null;
  priceCents: number;
  jobTitles: string[];
}

async function samplesByItem(ctx: Ctx, itemId?: string) {
  const rows = await ctx.db.query<{ item_id: string; job_id: string; job_title: string; quantity: string; planned: unknown; real: unknown }>(
    `SELECT t.catalog_item_id AS item_id, t.job_id, j.title AS job_title, t.quantity, t.cost_cents AS planned,
       coalesce((SELECT sum(p.amount_ht_cents) FROM job_purchases p WHERE p.task_id=t.id), 0)
       + coalesce((SELECT sum(round(least(l.received_milli, l.quantity_milli) * l.unit_cost_cents / 1000.0))
                   FROM purchase_order_lines l JOIN purchase_orders o ON o.id=l.order_id
                   WHERE l.task_id=t.id AND o.status IN ('recu_partiel', 'recu')), 0) AS real
     FROM job_tasks t JOIN jobs j ON j.id=t.job_id
     WHERE t.org_id=$1 AND j.status IN ${DONE} AND t.catalog_item_id IS NOT NULL AND t.nature <> 'main_oeuvre'
       AND t.cost_cents > 0 ${itemId ? "AND t.catalog_item_id=$2" : ""}`,
    itemId ? [ctx.orgId, itemId] : [ctx.orgId],
  );
  const by = new Map<string, { samples: CostSample[]; titles: Set<string> }>();
  for (const r of rows) {
    const real = num(r.real);
    // Une tâche sans aucun achat rattaché ne dit rien du coût réel : elle est écartée.
    if (real <= 0) continue;
    const e = by.get(r.item_id) ?? { samples: [], titles: new Set<string>() };
    e.samples.push({ jobId: r.job_id, plannedCents: num(r.planned), realCents: real, quantityMilli: quantityMilli(r.quantity) });
    e.titles.add(r.job_title);
    by.set(r.item_id, e);
  }
  return by;
}

/** Articles du catalogue comparés au réel des chantiers terminés, les plus gros écarts en premier. */
export async function priceReview(ctx: Ctx) {
  requirePermission(ctx, "costs");
  const by = await samplesByItem(ctx);
  const ids = [...by.keys()];
  const items = ids.length
    ? await ctx.db.query<{ id: string; reference: string; name: string; unit: string; unit_cost4: unknown; unit_price4: unknown }>(
        "SELECT id, reference, name, unit, unit_cost4, unit_price4 FROM catalog_items WHERE org_id=$1 AND id = ANY($2::uuid[])",
        [ctx.orgId, ids],
      )
    : [];
  const gaps: ItemGap[] = [];
  for (const it of items) {
    const e = by.get(it.id)!;
    const cost4 = it.unit_cost4 == null ? null : num(it.unit_cost4);
    const r = reviewItem(e.samples, cost4);
    if (!r) continue;
    gaps.push({
      ...r,
      itemId: it.id,
      reference: it.reference,
      name: it.name,
      unit: it.unit,
      costCents: cost4 == null ? null : Math.round(cost4 / 100),
      priceCents: Math.round(num(it.unit_price4) / 100),
      jobTitles: [...e.titles],
    });
  }
  gaps.sort((a, b) => Math.abs(b.realCents - b.plannedCents) - Math.abs(a.realCents - a.plannedCents));

  // Main-d'oeuvre : heures pointées valorisées au coût de chaque membre, contre la main-d'oeuvre prévue au devis.
  const jobs = await ctx.db.query<{ id: string; planned: unknown }>(
    `SELECT j.id, sum(t.cost_cents) AS planned FROM jobs j JOIN job_tasks t ON t.job_id=j.id
     WHERE j.org_id=$1 AND j.status IN ${DONE} AND t.nature='main_oeuvre' AND t.cost_cents > 0 GROUP BY j.id`,
    [ctx.orgId],
  );
  const labor: CostSample[] = [];
  for (const j of jobs) {
    const h = await jobHours(ctx, j.id);
    if (h.costCents > 0) labor.push({ jobId: j.id, plannedCents: num(j.planned), realCents: h.costCents });
  }
  const done = await one<{ n: unknown }>(ctx.db, `SELECT count(*) AS n FROM jobs WHERE org_id=$1 AND status IN ${DONE}`, [ctx.orgId]);
  return { items: gaps, labor: laborReview(labor), finishedJobs: num(done?.n) };
}

/** Applique le coût proposé à l'article, et au besoin le prix de vente dans la même proportion. */
export async function applyCostCorrection(ctx: Ctx, itemId: string, opts: { keepMargin?: boolean } = {}) {
  requireWritable(ctx);
  requirePermission(ctx, "costs");
  if (!isUuid(itemId)) throw notFound("Article introuvable");
  const it = await one<{ id: string; name: string; kind: string; unit_cost4: unknown; unit_price4: unknown }>(
    ctx.db,
    "SELECT id, name, kind, unit_cost4, unit_price4 FROM catalog_items WHERE id=$1 AND org_id=$2",
    [itemId, ctx.orgId],
  );
  if (!it) throw notFound("Article introuvable");
  if (it.kind === "ouvrage") throw badRequest("Un ouvrage se corrige par ses composants");
  const cost4 = it.unit_cost4 == null ? null : num(it.unit_cost4);
  const e = (await samplesByItem(ctx, itemId)).get(itemId);
  const r = e ? reviewItem(e.samples, cost4) : null;
  if (!r || r.suggestedCost4 == null || cost4 == null) throw conflict("Aucune correction à appliquer pour cet article");
  const price4 = num(it.unit_price4);
  const newPrice4 = opts.keepMargin ? keepMarginPrice4(price4, cost4, r.suggestedCost4) : price4;
  await ctx.db.transaction(async (tx) => {
    await tx.query("UPDATE catalog_items SET unit_cost4=$3, unit_price4=$4, updated_by=$5, updated_at=now() WHERE id=$1 AND org_id=$2", [
      itemId,
      ctx.orgId,
      r.suggestedCost4,
      newPrice4,
      ctx.userId,
    ]);
    await tx.query("INSERT INTO catalog_price_history (org_id, item_id, old_price4, new_price4, old_cost4, new_cost4, user_id) VALUES ($1,$2,$3,$4,$5,$6,$7)", [
      ctx.orgId,
      itemId,
      price4,
      newPrice4,
      cost4,
      r.suggestedCost4,
      ctx.userId,
    ]);
    await recomputeParentsOf(tx, ctx.orgId, [itemId], ctx.userId);
    await audit(tx, { orgId: ctx.orgId, userId: ctx.userId, action: "catalog.cost_review", target: itemId, data: { gapBp: r.gapBp }, ip: ctx.ip });
  });
  return { name: it.name, oldCost4: cost4, newCost4: r.suggestedCost4, newPrice4, priceChanged: newPrice4 !== price4 };
}
