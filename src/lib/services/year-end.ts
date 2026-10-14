/**
 * Dossier de clôture pour l'expert-comptable : montants arrêtés au dernier jour de l'exercice
 * (créances, acomptes, travaux restant à facturer, retenues, frais), points de contrôle et commentaires.
 */

import { num, one } from "@/lib/db";
import { toCsv } from "@/lib/csv";
import { YEAR_END_CHECKS, fiscalYear, isCheckId } from "@/lib/year-end";
import { badRequest } from "@/lib/http";
import type { Ctx } from "./context";
import { audit, can, requirePermission, requireWritable } from "./context";
import { getStock } from "./stock";

export interface Receivable {
  number: string;
  customer: string;
  issueDate: string;
  balanceCents: number;
}

function checkYear(year: number) {
  if (!Number.isInteger(year) || year < 2000 || year > 2100) throw badRequest("Exercice invalide");
}

export async function yearEndPack(ctx: Ctx, year: number) {
  requirePermission(ctx, "billing");
  checkYear(year);
  const { from, to } = fiscalYear(year);
  const [receivables, deposits, backlog, retention, expenses, purchases, saved] = await Promise.all([
    // Reste dû au dernier jour : net à payer, moins les règlements et avoirs datés de l'exercice au plus tard.
    ctx.db.query<{ number: string; customer: string | null; issue_date: string; balance: unknown }>(
      `SELECT i.number, i.snapshot->'customer'->>'name' AS customer, to_char(i.issue_date, 'YYYY-MM-DD') AS issue_date,
         i.amount_due_cents
           - COALESCE((SELECT sum(p.amount_cents) FROM invoice_payments p WHERE p.invoice_id=i.id AND p.canceled_at IS NULL AND p.paid_on <= $2), 0)
           - COALESCE((SELECT sum(a.total_ttc_cents) FROM invoices a WHERE a.credited_invoice_id=i.id AND a.kind='credit_note' AND a.issue_date <= $2), 0) AS balance
       FROM invoices i WHERE i.org_id=$1 AND i.kind <> 'credit_note' AND i.issue_date <= $2
       ORDER BY i.issue_date`,
      [ctx.orgId, to],
    ),
    one<{ n: number; cents: unknown }>(
      ctx.db,
      `SELECT count(*)::int AS n, COALESCE(sum(d.total_ttc_cents), 0) AS cents FROM invoices d
       WHERE d.org_id=$1 AND d.kind='deposit' AND d.issue_date <= $2 AND d.quote_id IS NOT NULL
         AND NOT EXISTS (SELECT 1 FROM invoices f WHERE f.quote_id=d.quote_id AND f.kind='final' AND f.issue_date <= $2)`,
      [ctx.orgId, to],
    ),
    // Marchés signés au plus tard le dernier jour, moins ce qui en a été facturé à cette date.
    ctx.db.query<{ number: string | null; title: string; contract: unknown; invoiced: unknown }>(
      `SELECT q.number, q.title, q.total_ttc_cents AS contract,
         COALESCE((SELECT sum(CASE WHEN i.kind='credit_note' THEN -i.total_ttc_cents ELSE i.amount_due_cents + COALESCE((i.snapshot->'invoice'->'retention'->>'cents')::bigint, 0) END)
           FROM invoices i WHERE i.quote_id=q.id AND i.issue_date <= $2), 0) AS invoiced
       FROM quotes q WHERE q.org_id=$1 AND q.status='accepted' AND q.responded_at::date <= $2
         AND NOT EXISTS (SELECT 1 FROM invoices f WHERE f.quote_id=q.id AND f.kind='final' AND f.issue_date <= $2)`,
      [ctx.orgId, to],
    ),
    one<{ cents: unknown }>(
      ctx.db,
      `SELECT COALESCE(sum(CASE WHEN i.kind='credit_note' THEN -1 ELSE 1 END * COALESCE((i.snapshot->'invoice'->'retention'->>'cents')::bigint, 0)), 0) AS cents
       FROM invoices i WHERE i.org_id=$1 AND i.issue_date <= $2
         AND NOT EXISTS (SELECT 1 FROM jobs j JOIN job_receptions r ON r.job_id=j.id
                         WHERE j.quote_id=i.quote_id AND r.retention_released_at::date <= $2)`,
      [ctx.orgId, to],
    ),
    one<{ n: number; cents: unknown }>(
      ctx.db,
      "SELECT count(*)::int AS n, COALESCE(sum(amount_ttc_cents), 0) AS cents FROM expenses WHERE org_id=$1 AND status='valide' AND expense_date <= $2",
      [ctx.orgId, to],
    ),
    one<{ cents: unknown }>(
      ctx.db,
      "SELECT COALESCE(sum(amount_ht_cents), 0) AS cents FROM job_purchases WHERE org_id=$1 AND purchase_date BETWEEN $2 AND $3",
      [ctx.orgId, from, to],
    ),
    one<{ checks: Record<string, boolean>; notes: Record<string, string>; updated_at: Date }>(
      ctx.db,
      "SELECT checks, notes, updated_at FROM year_end_closings WHERE org_id=$1 AND year=$2",
      [ctx.orgId, year],
    ),
  ]);
  const open: Receivable[] = receivables
    .map((r) => ({ number: r.number, customer: r.customer ?? "", issueDate: r.issue_date, balanceCents: num(r.balance) }))
    .filter((r) => r.balanceCents > 0);
  const works = backlog
    .map((b) => ({ number: b.number ?? "", title: b.title, remainingCents: num(b.contract) - num(b.invoiced) }))
    .filter((b) => b.remainingCents > 0);
  const stockValueCents = can(ctx, "costs") ? (await getStock(ctx)).valueCents : null;
  return {
    year,
    from,
    to,
    receivables: open,
    receivablesCents: open.reduce((t, r) => t + r.balanceCents, 0),
    deposits: { count: deposits?.n ?? 0, cents: num(deposits?.cents ?? 0) },
    backlog: works,
    backlogCents: works.reduce((t, b) => t + b.remainingCents, 0),
    retentionCents: Math.max(0, num(retention?.cents ?? 0)),
    expenses: { count: expenses?.n ?? 0, cents: num(expenses?.cents ?? 0) },
    purchasesHtCents: num(purchases?.cents ?? 0),
    stockValueCents,
    checks: saved?.checks ?? {},
    notes: saved?.notes ?? {},
    updatedAt: saved?.updated_at ?? null,
  };
}

export async function saveYearEnd(ctx: Ctx, year: number, checks: string[], notes: Record<string, string>) {
  requireWritable(ctx);
  requirePermission(ctx, "billing");
  checkYear(year);
  const c: Record<string, boolean> = {};
  for (const id of checks) if (isCheckId(id)) c[id] = true;
  const n: Record<string, string> = {};
  for (const [k, v] of Object.entries(notes)) if (isCheckId(k) && v.trim()) n[k] = v.trim().slice(0, 500);
  await ctx.db.query(
    `INSERT INTO year_end_closings (org_id, year, checks, notes, updated_by) VALUES ($1,$2,$3,$4,$5)
     ON CONFLICT (org_id, year) DO UPDATE SET checks=EXCLUDED.checks, notes=EXCLUDED.notes, updated_by=EXCLUDED.updated_by, updated_at=now()`,
    [ctx.orgId, year, JSON.stringify(c), JSON.stringify(n), ctx.userId],
  );
  await audit(ctx.db, { orgId: ctx.orgId, userId: ctx.userId, action: "year_end.save", target: String(year), ip: ctx.ip });
}

const euros = (c: number | null) => (c == null ? "" : (c / 100).toFixed(2).replace(".", ","));

/** Dossier au format tableur : une ligne par point de clôture, puis le détail des créances et des travaux à facturer. */
export async function yearEndCsv(ctx: Ctx, year: number) {
  const p = await yearEndPack(ctx, year);
  const amounts: Record<string, number | null> = {
    creances: p.receivablesCents,
    acomptes: p.deposits.cents,
    en_cours: p.backlogCents,
    retenues: p.retentionCents,
    stock: p.stockValueCents,
    frais: p.expenses.cents,
    immobilisations: null,
    banque: null,
    emprunts: null,
    caisse: null,
  };
  const rows: string[][] = YEAR_END_CHECKS.map((c) => [
    "Point de clôture",
    c.label,
    euros(amounts[c.id] ?? null),
    p.checks[c.id] ? "fait" : "à faire",
    p.notes[c.id] ?? "",
  ]);
  rows.push(["Achats de chantier de l'exercice (HT)", `${p.from} au ${p.to}`, euros(p.purchasesHtCents), "", ""]);
  for (const r of p.receivables) rows.push(["Créance client", `${r.number} ${r.customer} du ${r.issueDate}`, euros(r.balanceCents), "", ""]);
  for (const b of p.backlog) rows.push(["Reste à facturer", `${b.number} ${b.title}`, euros(b.remainingCents), "", ""]);
  return toCsv(["Rubrique", "Libellé", "Montant TTC (euros)", "État", "Commentaire"], rows);
}
