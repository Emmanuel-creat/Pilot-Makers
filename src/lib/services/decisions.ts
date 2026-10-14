/** Chiffres de départ du simulateur de décisions : 12 derniers mois facturés, achats et frais, taux horaire. */

import { one } from "@/lib/db";
import type { Baseline } from "@/lib/decisions";
import type { Ctx } from "./context";
import { requirePermission } from "./context";
import { parisDate } from "./quotes";

/** Premier nombre d'un texte libre (« 45 €/h », « 52,50 »), en centimes. */
export function parseRate(text: string): number {
  const m = text.replace(/\s/g, "").match(/\d+(?:[.,]\d+)?/);
  return m ? Math.round(Number(m[0].replace(",", ".")) * 100) : 0;
}

export async function decisionBaseline(ctx: Ctx, now = new Date()): Promise<Baseline & { hasData: boolean; from: string; to: string }> {
  requirePermission(ctx, "billing");
  const to = parisDate(now);
  const from = parisDate(new Date(now.getTime() - 365 * 86_400_000));
  const r = await one<{ revenue: unknown; purchases: unknown; expenses: unknown; hourly_rate: string }>(
    ctx.db,
    `SELECT
       (SELECT coalesce(sum(CASE WHEN kind='credit_note' THEN -total_ht_cents ELSE total_ht_cents END), 0) FROM invoices WHERE org_id=$1 AND issue_date > $2 AND issue_date <= $3) AS revenue,
       (SELECT coalesce(sum(amount_ht_cents), 0) FROM job_purchases WHERE org_id=$1 AND purchase_date > $2 AND purchase_date <= $3) AS purchases,
       (SELECT coalesce(sum(amount_ttc_cents - vat_cents), 0) FROM expenses WHERE org_id=$1 AND expense_date > $2 AND expense_date <= $3) AS expenses,
       (SELECT hourly_rate FROM organizations WHERE id=$1) AS hourly_rate`,
    [ctx.orgId, from, to],
  );
  const revenueCents = Number(r?.revenue ?? 0);
  return {
    revenueCents,
    costsCents: Number(r?.purchases ?? 0) + Number(r?.expenses ?? 0),
    hourlyRateCents: parseRate(r?.hourly_rate ?? ""),
    hasData: revenueCents > 0,
    from,
    to,
  };
}
