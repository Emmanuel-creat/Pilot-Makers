/** Bilan matière : commandé, rendu, restes et leur devenir, par chantier et sur douze mois. */

import { z } from "zod";
import { num, one } from "@/lib/db";
import { badRequest, isUuid, notFound } from "@/lib/http";
import { FATES, type Fate, type Leftover, materialBalance, type OrderedLine, parseQuantity } from "@/lib/material-balance";
import type { Ctx } from "./context";
import { audit, requirePermission, requireWritable } from "./context";

async function jobLines(ctx: Ctx, jobIds: string[]) {
  const lines = await ctx.db.query<{ id: string; label: string; unit: string; quantity_milli: unknown; received_milli: unknown; unit_cost_cents: unknown }>(
    `SELECT l.id, l.label, l.unit, l.quantity_milli, l.received_milli, l.unit_cost_cents FROM purchase_order_lines l
     JOIN purchase_orders o ON o.id=l.order_id WHERE o.org_id=$1 AND o.job_id = ANY($2::uuid[]) AND o.status <> 'annule'`,
    [ctx.orgId, jobIds],
  );
  const returns = await ctx.db.query<{ line_id: string; q: unknown }>(
    `SELECT r.line_id, sum(r.quantity_milli) AS q FROM supplier_returns r JOIN purchase_orders o ON o.id=r.order_id
     WHERE o.org_id=$1 AND o.job_id = ANY($2::uuid[]) AND r.reason='surplus' GROUP BY r.line_id`,
    [ctx.orgId, jobIds],
  );
  const leftovers = await ctx.db.query<Record<string, unknown>>(
    "SELECT id, order_line_id, label, unit, quantity_milli, unit_cost_cents, fate FROM job_leftovers WHERE org_id=$1 AND job_id = ANY($2::uuid[]) ORDER BY created_at",
    [ctx.orgId, jobIds],
  );
  const ordered: OrderedLine[] = lines.map((l) => ({
    id: l.id,
    label: l.label,
    unit: l.unit,
    orderedMilli: num(l.quantity_milli),
    receivedMilli: num(l.received_milli),
    unitCostCents: num(l.unit_cost_cents),
  }));
  const left: Leftover[] = leftovers.map((o) => ({
    id: String(o.id),
    orderLineId: (o.order_line_id as string | null) ?? null,
    label: String(o.label),
    unit: String(o.unit),
    quantityMilli: num(o.quantity_milli),
    unitCostCents: num(o.unit_cost_cents),
    fate: o.fate as Fate,
  }));
  return { ordered, left, balance: materialBalance(ordered, new Map(returns.map((r) => [r.line_id, num(r.q)])), left) };
}

export async function jobMaterialBalance(ctx: Ctx, jobId: string) {
  requirePermission(ctx, "costs");
  const j = isUuid(jobId) ? await one<{ id: string; title: string }>(ctx.db, "SELECT id, title FROM jobs WHERE id=$1 AND org_id=$2", [jobId, ctx.orgId]) : null;
  if (!j) throw notFound("Chantier introuvable");
  const { ordered, left, balance } = await jobLines(ctx, [j.id]);
  return { job: j, lines: ordered, leftovers: left, ...balance };
}

const leftoverSchema = z.object({
  orderLineId: z.string().default(""),
  label: z.string().trim().max(200).default(""),
  unit: z.string().trim().max(20).default(""),
  quantity: z.string().trim().min(1, "Indiquez la quantité restante"),
  fate: z.enum(Object.keys(FATES) as [Fate, ...Fate[]], { message: "Choisissez le devenir du reste" }),
});

/** Note un reste de matériau ; rattaché à une ligne de commande, il en reprend la désignation, l'unité et le coût. */
export async function addLeftover(ctx: Ctx, jobId: string, raw: unknown) {
  requireWritable(ctx);
  requirePermission(ctx, "costs");
  const p = leftoverSchema.safeParse(raw);
  if (!p.success) throw badRequest(p.error.issues[0].message);
  let quantity: number;
  try {
    quantity = parseQuantity(p.data.quantity);
  } catch (e) {
    throw badRequest((e as Error).message);
  }
  const j = isUuid(jobId) ? await one(ctx.db, "SELECT 1 FROM jobs WHERE id=$1 AND org_id=$2", [jobId, ctx.orgId]) : null;
  if (!j) throw notFound("Chantier introuvable");
  let label = p.data.label;
  let unit = p.data.unit || "u";
  let cost = 0;
  let lineId: string | null = null;
  if (p.data.orderLineId) {
    const l = isUuid(p.data.orderLineId)
      ? await one<{ id: string; label: string; unit: string; unit_cost_cents: unknown }>(
          ctx.db,
          `SELECT l.id, l.label, l.unit, l.unit_cost_cents FROM purchase_order_lines l JOIN purchase_orders o ON o.id=l.order_id
           WHERE l.id=$1 AND o.job_id=$2 AND o.org_id=$3`,
          [p.data.orderLineId, jobId, ctx.orgId],
        )
      : null;
    if (!l) throw badRequest("Ligne de commande introuvable sur ce chantier");
    ({ label, unit } = l);
    cost = num(l.unit_cost_cents);
    lineId = l.id;
  }
  if (label.length < 2) throw badRequest("Indiquez le matériau");
  const r = await one<{ id: string }>(
    ctx.db,
    `INSERT INTO job_leftovers (org_id, job_id, order_line_id, label, unit, quantity_milli, unit_cost_cents, fate, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
    [ctx.orgId, jobId, lineId, label, unit, quantity, cost, p.data.fate, ctx.userId],
  );
  await audit(ctx.db, { orgId: ctx.orgId, userId: ctx.userId, action: "job.leftover", target: jobId, data: { label, fate: p.data.fate }, ip: ctx.ip });
  return r!.id;
}

export async function deleteLeftover(ctx: Ctx, id: string) {
  requireWritable(ctx);
  requirePermission(ctx, "costs");
  const r = isUuid(id) ? await ctx.db.query<{ job_id: string }>("DELETE FROM job_leftovers WHERE id=$1 AND org_id=$2 RETURNING job_id", [id, ctx.orgId]) : [];
  if (!r.length) throw notFound("Reste introuvable");
  return r[0].job_id;
}

/** Douze derniers mois : surplus de matière, matériaux le plus souvent commandés en trop, devenir des restes. */
export async function materialSummary(ctx: Ctx) {
  requirePermission(ctx, "costs");
  const jobs = await ctx.db.query<{ id: string }>(
    `SELECT DISTINCT o.job_id AS id FROM purchase_orders o WHERE o.org_id=$1 AND o.status <> 'annule' AND o.created_at > now() - interval '12 months'`,
    [ctx.orgId],
  );
  const { balance } = await jobLines(
    ctx,
    jobs.map((j) => j.id),
  );
  const received = balance.rows.reduce((s, r) => s + r.surplusCents, 0);
  return { jobs: jobs.length, surplusCents: received, top: balance.rows.filter((r) => r.surplusCents > 0).slice(0, 8), fates: balance.fates };
}
