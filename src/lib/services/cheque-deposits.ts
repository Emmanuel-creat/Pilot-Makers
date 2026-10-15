/** Remises de chèques en banque : chèques à remettre, bordereaux numérotés et leur annulation. */

import { num, one } from "@/lib/db";
import { badRequest, isUuid, notFound } from "@/lib/http";
import { depositSlip, formatIban, type PendingCheque } from "@/lib/cheque-deposit";
import type { Ctx } from "./context";
import { audit, requirePermission, requireWritable } from "./context";
import { parisDate } from "./quotes";

const day = (v: unknown) => (v instanceof Date ? v.toISOString() : String(v)).slice(0, 10);
const LINES = `SELECT p.id, p.amount_cents, p.paid_on, p.reference, i.number AS invoice_number,
    coalesce(i.snapshot->'customer'->>'name', '') AS drawer
  FROM invoice_payments p JOIN invoices i ON i.id=p.invoice_id`;
const toCheque = (r: Record<string, unknown>): PendingCheque => ({
  id: String(r.id),
  amountCents: num(r.amount_cents),
  receivedOn: day(r.paid_on),
  reference: String(r.reference ?? ""),
  drawer: String(r.drawer),
  invoiceNumber: String(r.invoice_number ?? ""),
});

/** Chèques encaissés dans l'application et pas encore remis en banque, les plus anciens d'abord. */
export async function pendingCheques(ctx: Ctx): Promise<PendingCheque[]> {
  requirePermission(ctx, "billing");
  const rows = await ctx.db.query<Record<string, unknown>>(
    `${LINES} WHERE p.org_id=$1 AND p.method='cheque' AND p.canceled_at IS NULL AND p.deposit_id IS NULL ORDER BY p.paid_on, p.created_at`,
    [ctx.orgId],
  );
  return rows.map(toCheque);
}

/** Crée le bordereau pour les chèques choisis ; chacun ne peut figurer que sur un seul bordereau. */
export async function createDeposit(ctx: Ctx, paymentIds: string[], depositedOn?: string): Promise<string> {
  requireWritable(ctx);
  requirePermission(ctx, "billing");
  const ids = [...new Set(paymentIds.filter(isUuid))];
  if (!ids.length) throw badRequest("Cochez au moins un chèque à remettre");
  const today = parisDate(new Date());
  const on = depositedOn || today;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(on) || on > today) throw badRequest("Date de remise invalide");
  return ctx.db.transaction(async (tx) => {
    const rows = await tx.query<{ id: string; amount_cents: unknown }>(
      `SELECT id, amount_cents FROM invoice_payments WHERE org_id=$1 AND id = ANY($2::uuid[]) AND method='cheque' AND canceled_at IS NULL AND deposit_id IS NULL FOR UPDATE`,
      [ctx.orgId, ids],
    );
    if (rows.length !== ids.length) throw badRequest("Un des chèques a déjà été remis ou annulé : actualisez la page");
    const total = rows.reduce((s, r) => s + num(r.amount_cents), 0);
    const next = num((await one<{ n: unknown }>(tx, "SELECT coalesce(max(number), 0) + 1 AS n FROM cheque_deposits WHERE org_id=$1", [ctx.orgId]))?.n);
    const d = await one<{ id: string }>(
      tx,
      "INSERT INTO cheque_deposits (org_id, number, deposited_on, total_cents, cheque_count, created_by) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id",
      [ctx.orgId, next, on, total, rows.length, ctx.userId],
    );
    await tx.query("UPDATE invoice_payments SET deposit_id=$2 WHERE id = ANY($1::uuid[])", [ids, d!.id]);
    await audit(tx, { orgId: ctx.orgId, userId: ctx.userId, action: "cheques.deposit", target: d!.id, data: { number: next, totalCents: total }, ip: ctx.ip });
    return d!.id;
  });
}

export async function listDeposits(ctx: Ctx) {
  requirePermission(ctx, "billing");
  const rows = await ctx.db.query<{ id: string; number: unknown; deposited_on: unknown; total_cents: unknown; cheque_count: unknown }>(
    "SELECT id, number, deposited_on, total_cents, cheque_count FROM cheque_deposits WHERE org_id=$1 ORDER BY number DESC LIMIT 100",
    [ctx.orgId],
  );
  return rows.map((r) => ({ id: r.id, number: num(r.number), depositedOn: day(r.deposited_on), totalCents: num(r.total_cents), count: num(r.cheque_count) }));
}

/** Bordereau imprimable : titulaire et IBAN du compte, chèques, total. */
export async function getDeposit(ctx: Ctx, id: string) {
  requirePermission(ctx, "billing");
  const d = isUuid(id)
    ? await one<{ id: string; number: unknown; deposited_on: unknown }>(
        ctx.db,
        "SELECT id, number, deposited_on FROM cheque_deposits WHERE id=$1 AND org_id=$2",
        [id, ctx.orgId],
      )
    : null;
  if (!d) return null;
  const rows = await ctx.db.query<Record<string, unknown>>(`${LINES} WHERE p.deposit_id=$1 AND p.org_id=$2`, [d.id, ctx.orgId]);
  const o = await one<{ holder: string; iban: string; bic: string; name: string }>(
    ctx.db,
    "SELECT coalesce(nullif(bank_holder, ''), nullif(legal_name, ''), trade_name) AS holder, bank_iban AS iban, bank_bic AS bic, coalesce(nullif(trade_name, ''), legal_name) AS name FROM organizations WHERE id=$1",
    [ctx.orgId],
  );
  return {
    id: d.id,
    number: num(d.number),
    depositedOn: day(d.deposited_on),
    holder: o?.holder ?? "",
    company: o?.name ?? "",
    iban: formatIban(o?.iban ?? ""),
    bic: o?.bic ?? "",
    ...depositSlip(rows.map(toCheque)),
  };
}

/** Annule un bordereau établi par erreur : ses chèques redeviennent à remettre. Le numéro n'est pas réutilisé. */
export async function cancelDeposit(ctx: Ctx, id: string) {
  requireWritable(ctx);
  requirePermission(ctx, "billing");
  if (!isUuid(id)) throw notFound("Bordereau introuvable");
  await ctx.db.transaction(async (tx) => {
    const d = await one<{ number: unknown }>(tx, "SELECT number FROM cheque_deposits WHERE id=$1 AND org_id=$2 FOR UPDATE", [id, ctx.orgId]);
    if (!d) throw notFound("Bordereau introuvable");
    await tx.query("UPDATE invoice_payments SET deposit_id=NULL WHERE deposit_id=$1", [id]);
    await tx.query("UPDATE cheque_deposits SET cheque_count=0, total_cents=0 WHERE id=$1", [id]);
    await audit(tx, { orgId: ctx.orgId, userId: ctx.userId, action: "cheques.deposit_cancel", target: id, data: { number: num(d.number) }, ip: ctx.ip });
  });
}
