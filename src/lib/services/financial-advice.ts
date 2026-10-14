/** Conseil financier personnalisé : chiffres de l'entreprise sur douze mois, puis recommandations chiffrées. */

import { one } from "@/lib/db";
import { adviseFinance, type FinanceInputs } from "@/lib/financial-advice";
import type { Ctx } from "./context";
import { requirePermission } from "./context";
import { readTreasury } from "./finance";
import { healthFigures } from "./health-score";

export async function financeInputs(ctx: Ctx, now = new Date()): Promise<FinanceInputs> {
  const base = await healthFigures(ctx.db, ctx.orgId, now);
  const since = new Date(now.getTime() - 365 * 86400000).toISOString().slice(0, 10);
  const org = await one<{ treasury: unknown }>(ctx.db, "SELECT treasury FROM organizations WHERE id=$1", [ctx.orgId]);
  const t = readTreasury(org?.treasury);
  const q = await one<{ accepted: number; with_deposit: number }>(
    ctx.db,
    `SELECT count(*)::int AS accepted,
       count(*) FILTER (WHERE EXISTS (SELECT 1 FROM invoices i WHERE i.quote_id=q.id AND i.kind='deposit'))::int AS with_deposit
     FROM quotes q WHERE q.org_id=$1 AND q.status='accepted' AND q.responded_at > $2`,
    [ctx.orgId, since],
  );
  const months = await ctx.db.query<{ m: string; v: unknown }>(
    `SELECT to_char(issue_date, 'YYYY-MM') AS m, sum(CASE WHEN kind='credit_note' THEN -total_ht_cents ELSE total_ht_cents END) AS v
     FROM invoices WHERE org_id=$1 AND issue_date > $2 GROUP BY 1`,
    [ctx.orgId, since],
  );
  const byMonth = new Map(months.map((r) => [r.m, Number(r.v)]));
  const series: number[] = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    series.push(byMonth.get(d.toISOString().slice(0, 7)) ?? 0);
  }
  return {
    ...base,
    balanceCents: t.balanceDate ? t.balanceCents : null,
    monthlyChargesCents: t.monthlyChargesCents,
    acceptedCount: q?.accepted ?? 0,
    withDepositCount: q?.with_deposit ?? 0,
    monthlyRevenueCents: series,
  };
}

export async function financialAdvice(ctx: Ctx, now = new Date()) {
  requirePermission(ctx, "billing");
  const inputs = await financeInputs(ctx, now);
  return { inputs, ...adviseFinance(inputs) };
}
