/**
 * Livraisons et retours fournisseurs : historique des bons de livraison d'une commande, retours de
 * marchandise (casse, erreur, défaut, surplus) suivis jusqu'à l'avoir, qui vient en déduction des achats du chantier.
 */

import { z } from "zod";
import { formatScaled } from "@/lib/calc/decimal";
import { num, one } from "@/lib/db";
import { badRequest, conflict, isUuid, notFound } from "@/lib/http";
import {
  creditGap,
  expectedCreditCents,
  RETURN_REASONS,
  restockingApplies,
  returnableMilli,
  type DeliveredLine,
  type ReturnReason,
  type ReturnStatus,
} from "@/lib/supplier-returns";
import type { Ctx } from "./context";
import { audit, requirePermission, requireWritable } from "./context";
import { eurosToCents } from "./pricing";
import { parseQuantity } from "./purchase-orders";
import { parisDate } from "./quotes";

const day = (v: unknown) => (v == null ? null : (v instanceof Date ? v.toISOString() : String(v)).slice(0, 10));
const dateText = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date invalide");

export interface Delivery {
  id: string;
  deliveredOn: string;
  noteNumber: string;
  issues: string;
  lines: DeliveredLine[];
}

export async function listDeliveries(ctx: Ctx, orderId: string): Promise<Delivery[]> {
  requirePermission(ctx, "costs");
  if (!isUuid(orderId)) return [];
  const rows = await ctx.db.query<Record<string, unknown>>("SELECT * FROM order_deliveries WHERE order_id=$1 AND org_id=$2 ORDER BY delivered_on, created_at", [
    orderId,
    ctx.orgId,
  ]);
  return rows.map((r) => ({
    id: String(r.id),
    deliveredOn: day(r.delivered_on)!,
    noteNumber: String(r.note_number),
    issues: String(r.issues),
    lines: (typeof r.lines === "string" ? JSON.parse(r.lines) : r.lines) as DeliveredLine[],
  }));
}

export interface SupplierReturn {
  id: string;
  orderId: string;
  orderNumber: string;
  supplier: string;
  jobId: string;
  jobTitle: string;
  lineId: string;
  label: string;
  unit: string;
  quantity: string;
  quantityMilli: number;
  reason: ReturnReason;
  notes: string;
  restockingBp: number;
  status: ReturnStatus;
  collectedOn: string | null;
  expectedCents: number;
  creditCents: number | null;
  creditReference: string;
  createdAt: string;
}

const SELECT = `SELECT r.*, l.label, l.unit, l.unit_cost_cents, o.number AS order_number, o.supplier, o.job_id, j.title AS job_title
  FROM supplier_returns r
  JOIN purchase_order_lines l ON l.id=r.line_id
  JOIN purchase_orders o ON o.id=r.order_id
  JOIN jobs j ON j.id=o.job_id`;

function mapReturn(r: Record<string, unknown>): SupplierReturn {
  const q = num(r.quantity_milli);
  return {
    id: String(r.id),
    orderId: String(r.order_id),
    orderNumber: String(r.order_number),
    supplier: String(r.supplier),
    jobId: String(r.job_id),
    jobTitle: String(r.job_title),
    lineId: String(r.line_id),
    label: String(r.label),
    unit: String(r.unit),
    quantity: formatScaled(BigInt(q), 3),
    quantityMilli: q,
    reason: r.reason as ReturnReason,
    notes: String(r.notes),
    restockingBp: Number(r.restocking_bp),
    status: r.status as ReturnStatus,
    collectedOn: day(r.collected_on),
    expectedCents: expectedCreditCents(q, num(r.unit_cost_cents), Number(r.restocking_bp)),
    creditCents: r.credit_cents == null ? null : num(r.credit_cents),
    creditReference: String(r.credit_reference),
    createdAt: day(r.created_at)!,
  };
}

export async function listReturns(ctx: Ctx, orderId: string): Promise<SupplierReturn[]> {
  requirePermission(ctx, "costs");
  if (!isUuid(orderId)) return [];
  const rows = await ctx.db.query<Record<string, unknown>>(`${SELECT} WHERE r.order_id=$1 AND r.org_id=$2 ORDER BY r.created_at`, [orderId, ctx.orgId]);
  return rows.map(mapReturn);
}

/** Retours dont l'avoir n'est pas encore arrivé, tous chantiers confondus, les plus anciens en premier. */
export async function openReturns(ctx: Ctx) {
  requirePermission(ctx, "costs");
  const rows = await ctx.db.query<Record<string, unknown>>(`${SELECT} WHERE r.org_id=$1 AND r.status <> 'avoir_recu' ORDER BY r.created_at`, [ctx.orgId]);
  const list = rows.map(mapReturn);
  return { list, expectedCents: list.reduce((a, r) => a + r.expectedCents, 0) };
}

const returnSchema = z.object({
  lineId: z.string().refine(isUuid, "Choisissez l'article à retourner"),
  quantity: z.string().trim().min(1, "Indiquez la quantité retournée"),
  reason: z.enum(Object.keys(RETURN_REASONS) as [ReturnReason, ...ReturnReason[]], { message: "Choisissez le motif du retour" }),
  notes: z.string().trim().max(500).default(""),
  restocking: z
    .string()
    .trim()
    .default("")
    .transform((v) => (v === "" ? 0 : Number(v.replace(",", "."))))
    .refine((v) => Number.isFinite(v) && v >= 0 && v <= 50, "Frais de reprise : 50 % au plus"),
});

export async function createReturn(ctx: Ctx, orderId: string, raw: unknown) {
  requireWritable(ctx);
  requirePermission(ctx, "costs");
  const p = returnSchema.safeParse(raw);
  if (!p.success) throw badRequest(p.error.issues[0].message);
  const v = p.data;
  const q = parseQuantity(v.quantity, "Quantité retournée");
  if (q <= 0) throw badRequest("Indiquez la quantité retournée");
  if (!isUuid(orderId)) throw notFound("Commande introuvable");
  return ctx.db.transaction(async (tx) => {
    const line = await one<{ received_milli: unknown; label: string; status: string }>(
      tx,
      `SELECT l.received_milli, l.label, o.status FROM purchase_order_lines l JOIN purchase_orders o ON o.id=l.order_id
       WHERE l.id=$1 AND l.order_id=$2 AND o.org_id=$3 FOR UPDATE OF l`,
      [v.lineId, orderId, ctx.orgId],
    );
    if (!line) throw notFound("Article introuvable sur cette commande");
    const done = await one<{ q: unknown }>(tx, "SELECT coalesce(sum(quantity_milli),0) AS q FROM supplier_returns WHERE line_id=$1", [v.lineId]);
    const max = returnableMilli(num(line.received_milli), num(done?.q));
    if (q > max)
      throw badRequest(
        max
          ? `Retour limité à la quantité reçue et pas encore retournée (${formatScaled(BigInt(max), 3).replace(".", ",")})`
          : `Rien à retourner pour ${line.label} : marchandise pas encore reçue`,
      );
    const bp = restockingApplies(v.reason) ? Math.round(v.restocking * 100) : 0;
    const r = await one<{ id: string }>(
      tx,
      `INSERT INTO supplier_returns (org_id, order_id, line_id, quantity_milli, reason, notes, restocking_bp, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
      [ctx.orgId, orderId, v.lineId, q, v.reason, v.notes, bp, ctx.userId],
    );
    await audit(tx, { orgId: ctx.orgId, userId: ctx.userId, action: "order.return", target: r!.id, data: { reason: v.reason }, ip: ctx.ip });
    return r!.id;
  });
}

async function loadReturn(ctx: Ctx, id: string) {
  if (!isUuid(id)) throw notFound("Retour introuvable");
  const r = await one<Record<string, unknown>>(ctx.db, `${SELECT} WHERE r.id=$1 AND r.org_id=$2`, [id, ctx.orgId]);
  if (!r) throw notFound("Retour introuvable");
  return mapReturn(r);
}

/** Le fournisseur a repris la marchandise : l'avoir est maintenant attendu. */
export async function collectReturn(ctx: Ctx, id: string, date: string, now = new Date()) {
  requireWritable(ctx);
  requirePermission(ctx, "costs");
  if (!dateText.safeParse(date).success) throw badRequest("Date de reprise invalide");
  if (date > parisDate(now)) throw badRequest("La date de reprise ne peut pas être dans le futur");
  const r = await loadReturn(ctx, id);
  if (r.status !== "a_reprendre") throw conflict("Retour déjà repris par le fournisseur");
  await ctx.db.query("UPDATE supplier_returns SET status='repris', collected_on=$2 WHERE id=$1", [id, date]);
  return r;
}

const creditSchema = z.object({
  amount: z.string().trim().min(1, "Montant de l'avoir requis"),
  reference: z.string().trim().max(80).default(""),
  date: dateText,
});

/**
 * Avoir reçu : il entre dans les achats du chantier en négatif, rattaché à la commande pour le rapprochement.
 * Un avoir à zéro solde un retour déjà déduit de la facture par le fournisseur.
 */
export async function creditReturn(ctx: Ctx, id: string, raw: unknown, now = new Date()) {
  requireWritable(ctx);
  requirePermission(ctx, "costs");
  const p = creditSchema.safeParse(raw);
  if (!p.success) throw badRequest(p.error.issues[0].message);
  if (p.data.date > parisDate(now)) throw badRequest("La date de l'avoir ne peut pas être dans le futur");
  let cents: number;
  try {
    cents = eurosToCents(p.data.amount.replace(/[\s€]/g, ""), "Montant");
  } catch (e) {
    throw badRequest((e as Error).message);
  }
  if (cents < 0) throw badRequest("Saisissez le montant de l'avoir sans signe moins");
  const r = await loadReturn(ctx, id);
  if (r.status === "avoir_recu") throw conflict("Avoir déjà enregistré pour ce retour");
  await ctx.db.transaction(async (tx) => {
    let purchaseId: string | null = null;
    if (cents > 0) {
      const pu = await one<{ id: string }>(
        tx,
        `INSERT INTO job_purchases (org_id, job_id, purchase_order_id, purchase_date, supplier, label, category, amount_ht_cents, reference, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,'materiau',$7,$8,$9) RETURNING id`,
        [
          ctx.orgId,
          r.jobId,
          r.orderId,
          p.data.date,
          r.supplier,
          `Avoir ${r.supplier} : retour ${r.label} (commande ${r.orderNumber})`,
          -cents,
          p.data.reference,
          ctx.userId,
        ],
      );
      purchaseId = pu!.id;
    }
    await tx.query(
      "UPDATE supplier_returns SET status='avoir_recu', collected_on=coalesce(collected_on, $2), credit_cents=$3, credit_reference=$4, purchase_id=$5 WHERE id=$1",
      [id, p.data.date, cents, p.data.reference, purchaseId],
    );
  });
  await audit(ctx.db, { orgId: ctx.orgId, userId: ctx.userId, action: "order.return_credit", target: id, data: { cents }, ip: ctx.ip });
  return { ...r, gapCents: creditGap(cents, r.expectedCents) };
}

export async function deleteReturn(ctx: Ctx, id: string) {
  requireWritable(ctx);
  requirePermission(ctx, "costs");
  const r = await loadReturn(ctx, id);
  if (r.status !== "a_reprendre") throw conflict("Retour déjà repris : il ne se supprime plus");
  await ctx.db.query("DELETE FROM supplier_returns WHERE id=$1 AND org_id=$2", [id, ctx.orgId]);
  return r;
}
