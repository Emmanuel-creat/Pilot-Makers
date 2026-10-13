/**
 * Rapprochement bancaire : le relevé importé est comparé aux factures en attente de paiement.
 *
 * Un virement dont le libellé cite le numéro d'une facture est rapproché tout seul et le paiement est
 * enregistré à la date de l'opération. Les autres encaissements reçoivent des propositions (même montant,
 * nom du client dans le libellé) à confirmer d'un geste. Les dépenses sont listées sans être rapprochées.
 */

import { one } from "@/lib/db";
import { badRequest, conflict, isUuid, notFound } from "@/lib/http";
import { parseStatement, StatementError } from "@/lib/bank-statements";
import { formatEuros } from "@/lib/calc/format";
import type { Ctx } from "./context";
import { audit, requirePermission, requireWritable } from "./context";
import { cancelPayment, mapInvoice, recordPayment } from "./invoices";

export interface BankTransaction {
  id: string;
  bookedOn: string;
  amountCents: number;
  label: string;
  reference: string;
  counterparty: string;
  status: "a_rapprocher" | "rapproche" | "ignore" | "depense";
  invoiceId: string | null;
  invoiceNumber: string | null;
  matchedBy: "auto" | "manuel" | null;
}

export interface MatchCandidate {
  invoiceId: string;
  number: string;
  customer: string;
  balanceCents: number;
  score: number;
  reasons: string[];
}

interface OpenInvoice {
  id: string;
  number: string;
  customer: string;
  balance: number;
}

const compact = (s: string) =>
  s
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");

/** Propositions de factures pour un encaissement, de la plus probable à la moins probable. */
export function candidatesFor(tx: { amountCents: number; label: string; reference: string; counterparty: string }, open: OpenInvoice[]): MatchCandidate[] {
  if (tx.amountCents <= 0) return [];
  const text = compact(`${tx.label} ${tx.reference} ${tx.counterparty}`);
  const out: MatchCandidate[] = [];
  for (const inv of open) {
    if (inv.balance < tx.amountCents) continue;
    const reasons: string[] = [];
    let score = 0;
    const num = compact(inv.number);
    if (num.length >= 4 && text.includes(num)) {
      score += 100;
      reasons.push("numéro de facture dans le libellé");
    }
    if (inv.balance === tx.amountCents) {
      score += 40;
      reasons.push("même montant que le reste à payer");
    }
    const names = inv.customer
      .split(/\s+/)
      .map(compact)
      .filter((w) => w.length >= 4);
    if (names.some((n) => text.includes(n))) {
      score += 30;
      reasons.push("nom du client dans le libellé");
    }
    if (score >= 30) out.push({ invoiceId: inv.id, number: inv.number, customer: inv.customer, balanceCents: inv.balance, score, reasons });
  }
  return out.sort((a, b) => b.score - a.score).slice(0, 3);
}

async function openInvoices(ctx: Ctx): Promise<OpenInvoice[]> {
  const rows = await ctx.db.query<Record<string, unknown>>("SELECT * FROM invoices WHERE org_id=$1 AND kind <> 'credit_note'", [ctx.orgId]);
  return rows
    .map(mapInvoice)
    .filter((i) => i.balance_cents > 0 && i.status !== "canceled")
    .map((i) => ({ id: i.id, number: i.number, customer: "", balance: i.balance_cents }));
}

async function withCustomers(ctx: Ctx, list: OpenInvoice[]) {
  if (!list.length) return list;
  const rows = await ctx.db.query<{ id: string; name: string }>(
    "SELECT id, snapshot->'customer'->>'name' AS name FROM invoices WHERE org_id=$1 AND id = ANY($2::uuid[])",
    [ctx.orgId, list.map((l) => l.id)],
  );
  const names = new Map(rows.map((r) => [r.id, r.name ?? ""]));
  return list.map((l) => ({ ...l, customer: names.get(l.id) ?? "" }));
}

async function link(ctx: Ctx, txId: string, invoiceId: string, by: "auto" | "manuel") {
  const tx = await one<{ booked_on: Date | string; amount_cents: string; label: string; status: string }>(
    ctx.db,
    "SELECT booked_on, amount_cents, label, status FROM bank_transactions WHERE id=$1 AND org_id=$2",
    [txId, ctx.orgId],
  );
  if (!tx) throw notFound("Opération introuvable");
  if (tx.status === "rapproche") throw conflict("Cette opération est déjà rapprochée");
  const amount = Number(tx.amount_cents);
  if (amount <= 0) throw badRequest("Seul un encaissement se rapproche d'une facture");
  const day = tx.booked_on instanceof Date ? tx.booked_on.toISOString().slice(0, 10) : String(tx.booked_on).slice(0, 10);
  const paymentId = await recordPayment(ctx, invoiceId, {
    amount: (amount / 100).toFixed(2),
    paidOn: day,
    method: "virement",
    reference: `Relevé bancaire : ${tx.label}`.slice(0, 200),
  });
  await ctx.db.query("UPDATE bank_transactions SET status='rapproche', invoice_id=$3, payment_id=$4, matched_by=$5 WHERE id=$1 AND org_id=$2", [
    txId,
    ctx.orgId,
    invoiceId,
    paymentId,
    by,
  ]);
}

/** Importe un relevé : opérations déjà connues ignorées, rapprochement automatique des virements explicites. */
export async function importStatement(ctx: Ctx, bytes: Uint8Array, name = "") {
  requireWritable(ctx);
  requirePermission(ctx, "billing");
  let lines;
  try {
    lines = parseStatement(bytes, name);
  } catch (e) {
    if (e instanceof StatementError) throw badRequest(e.message);
    throw e;
  }
  let added = 0;
  const fresh: { id: string; amountCents: number; label: string; reference: string; counterparty: string }[] = [];
  for (const l of lines) {
    const r = await one<{ id: string }>(
      ctx.db,
      `INSERT INTO bank_transactions (org_id, booked_on, amount_cents, label, reference, counterparty, fingerprint, status, imported_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT (org_id, fingerprint) DO NOTHING RETURNING id`,
      [ctx.orgId, l.bookedOn, l.amountCents, l.label, l.reference, l.counterparty, l.fingerprint, l.amountCents > 0 ? "a_rapprocher" : "depense", ctx.userId],
    );
    if (!r) continue;
    added++;
    if (l.amountCents > 0) fresh.push({ id: r.id, ...l });
  }
  let matched = 0;
  let open = await withCustomers(ctx, await openInvoices(ctx));
  for (const t of fresh) {
    const [best, second] = candidatesFor(t, open);
    // Rapprochement automatique seulement si le numéro de facture est cité et qu'aucune autre facture ne l'est.
    if (best && best.score >= 100 && !(second && second.score >= 100)) {
      try {
        await link(ctx, t.id, best.invoiceId, "auto");
        matched++;
        open = open.map((o) => (o.id === best.invoiceId ? { ...o, balance: o.balance - t.amountCents } : o));
      } catch {
        // Paiement refusé (montant, date) : l'opération reste à rapprocher à la main.
      }
    }
  }
  await audit(ctx.db, { orgId: ctx.orgId, userId: ctx.userId, action: "bank.import", data: { lines: lines.length, added, matched }, ip: ctx.ip });
  return { read: lines.length, added, duplicates: lines.length - added, matched };
}

export async function listBankTransactions(ctx: Ctx, opts: { status?: string; limit?: number } = {}) {
  requirePermission(ctx, "billing");
  const rows = await ctx.db.query<Record<string, unknown>>(
    `SELECT t.*, i.number AS invoice_number FROM bank_transactions t LEFT JOIN invoices i ON i.id=t.invoice_id
     WHERE t.org_id=$1 ${opts.status ? "AND t.status=$3" : ""} ORDER BY t.booked_on DESC, t.imported_at DESC LIMIT $2`,
    opts.status ? [ctx.orgId, opts.limit ?? 200, opts.status] : [ctx.orgId, opts.limit ?? 200],
  );
  return rows.map(
    (r): BankTransaction => ({
      id: String(r.id),
      bookedOn: r.booked_on instanceof Date ? r.booked_on.toISOString().slice(0, 10) : String(r.booked_on).slice(0, 10),
      amountCents: Number(r.amount_cents),
      label: String(r.label),
      reference: String(r.reference),
      counterparty: String(r.counterparty),
      status: r.status as BankTransaction["status"],
      invoiceId: r.invoice_id ? String(r.invoice_id) : null,
      invoiceNumber: r.invoice_number ? String(r.invoice_number) : null,
      matchedBy: (r.matched_by as BankTransaction["matchedBy"]) ?? null,
    }),
  );
}

/** Encaissements à rapprocher, chacun avec ses propositions. */
export async function reconciliationQueue(ctx: Ctx) {
  const pending = await listBankTransactions(ctx, { status: "a_rapprocher" });
  const open = await withCustomers(ctx, await openInvoices(ctx));
  return pending.map((t) => ({ ...t, candidates: candidatesFor(t, open) }));
}

export async function confirmMatch(ctx: Ctx, txId: string, invoiceId: string) {
  requireWritable(ctx);
  requirePermission(ctx, "billing");
  if (!isUuid(txId) || !isUuid(invoiceId)) throw notFound("Opération ou facture introuvable");
  await link(ctx, txId, invoiceId, "manuel");
}

export async function setIgnored(ctx: Ctx, txId: string, ignored: boolean) {
  requireWritable(ctx);
  requirePermission(ctx, "billing");
  if (!isUuid(txId)) throw notFound("Opération introuvable");
  const r = await one(
    ctx.db,
    `UPDATE bank_transactions SET status=$3 WHERE id=$1 AND org_id=$2 AND status IN ('a_rapprocher', 'ignore') AND amount_cents > 0 RETURNING id`,
    [txId, ctx.orgId, ignored ? "ignore" : "a_rapprocher"],
  );
  if (!r) throw notFound("Opération introuvable");
}

/** Défait un rapprochement : le paiement enregistré est annulé. */
export async function unmatch(ctx: Ctx, txId: string) {
  requireWritable(ctx);
  requirePermission(ctx, "billing");
  if (!isUuid(txId)) throw notFound("Opération introuvable");
  const t = await one<{ payment_id: string | null }>(ctx.db, "SELECT payment_id FROM bank_transactions WHERE id=$1 AND org_id=$2 AND status='rapproche'", [
    txId,
    ctx.orgId,
  ]);
  if (!t) throw notFound("Opération introuvable");
  if (t.payment_id) await cancelPayment(ctx, t.payment_id);
  await ctx.db.query("UPDATE bank_transactions SET status='a_rapprocher', invoice_id=NULL, payment_id=NULL, matched_by=NULL WHERE id=$1", [txId]);
}

export const describeAmount = (c: number) => (c < 0 ? "-" : "") + formatEuros(Math.abs(c));
