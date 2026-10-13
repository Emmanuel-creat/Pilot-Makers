/** Budget annuel : saisie par poste et réalisé mois par mois tiré des factures, paiements, achats et frais. */

import { num } from "@/lib/db";
import { badRequest } from "@/lib/http";
import { BUDGET_KEYS, BUDGET_LINES, type Amounts, type BudgetLine } from "@/lib/budget";
import type { Ctx } from "./context";
import { audit, requirePermission, requireWritable } from "./context";
import { eurosToCents } from "./pricing";

function readAmounts(raw: unknown): Amounts {
  const out: Amounts = {};
  const o = (raw ?? {}) as Record<string, unknown>;
  for (const k of BUDGET_KEYS) if (Number.isInteger(o[k]) && (o[k] as number) >= 0) out[k] = o[k] as number;
  return out;
}

export async function getBudget(ctx: Ctx, year: number): Promise<Amounts> {
  requirePermission(ctx, "billing");
  const r = await ctx.db.query<{ amounts: unknown }>("SELECT amounts FROM org_budgets WHERE org_id=$1 AND year=$2", [ctx.orgId, year]);
  return readAmounts(r[0]?.amounts);
}

export async function saveBudget(ctx: Ctx, year: number, input: Partial<Record<BudgetLine, string>>) {
  requirePermission(ctx, "billing");
  requireWritable(ctx);
  if (!Number.isInteger(year) || year < 2000 || year > 2100) throw badRequest("Année invalide");
  const amounts: Amounts = {};
  for (const k of BUDGET_KEYS) {
    const v = String(input[k] ?? "").trim();
    if (!v) continue;
    try {
      amounts[k] = eurosToCents(v, BUDGET_LINES[k].label);
    } catch (e) {
      throw badRequest((e as Error).message);
    }
    if (amounts[k]! < 0) throw badRequest(`${BUDGET_LINES[k].label} : montant positif attendu`);
  }
  await ctx.db.query(
    `INSERT INTO org_budgets (org_id, year, amounts) VALUES ($1,$2,$3)
     ON CONFLICT (org_id, year) DO UPDATE SET amounts=excluded.amounts, updated_at=now()`,
    [ctx.orgId, year, JSON.stringify(amounts)],
  );
  await audit(ctx.db, { orgId: ctx.orgId, userId: ctx.userId, action: "organization.budget", data: { year, ...amounts }, ip: ctx.ip });
  return amounts;
}

/** Réalisé par poste et par mois (index 0 = janvier). */
export async function budgetActuals(ctx: Ctx, year: number): Promise<Record<BudgetLine, number[]>> {
  requirePermission(ctx, "billing");
  const from = `${year}-01-01`;
  const to = `${year}-12-31`;
  const out = Object.fromEntries(BUDGET_KEYS.map((k) => [k, Array(12).fill(0)])) as Record<BudgetLine, number[]>;
  const fill = (k: BudgetLine, rows: { m: unknown; v: unknown }[]) => {
    for (const r of rows) out[k][num(r.m) - 1] = num(r.v);
  };
  const [facture, encaisse, achats, frais] = await Promise.all([
    ctx.db.query<{ m: unknown; v: unknown }>(
      `SELECT extract(month FROM issue_date) AS m, sum(CASE WHEN kind='credit_note' THEN -total_ht_cents ELSE total_ht_cents END) AS v
       FROM invoices WHERE org_id=$1 AND issue_date BETWEEN $2 AND $3 GROUP BY 1`,
      [ctx.orgId, from, to],
    ),
    ctx.db.query<{ m: unknown; v: unknown }>(
      `SELECT extract(month FROM paid_on) AS m, sum(amount_cents) AS v FROM invoice_payments
       WHERE org_id=$1 AND canceled_at IS NULL AND paid_on BETWEEN $2 AND $3 GROUP BY 1`,
      [ctx.orgId, from, to],
    ),
    ctx.db.query<{ m: unknown; v: unknown }>(
      `SELECT extract(month FROM purchase_date) AS m, sum(amount_ht_cents) AS v FROM job_purchases
       WHERE org_id=$1 AND purchase_date BETWEEN $2 AND $3 GROUP BY 1`,
      [ctx.orgId, from, to],
    ),
    ctx.db.query<{ m: unknown; v: unknown }>(
      `SELECT extract(month FROM expense_date) AS m, sum(amount_ttc_cents - vat_cents) AS v FROM expenses
       WHERE org_id=$1 AND status <> 'refuse' AND expense_date BETWEEN $2 AND $3 GROUP BY 1`,
      [ctx.orgId, from, to],
    ),
  ]);
  fill("facture", facture);
  fill("encaisse", encaisse);
  fill("achats", achats);
  fill("frais", frais);
  return out;
}
