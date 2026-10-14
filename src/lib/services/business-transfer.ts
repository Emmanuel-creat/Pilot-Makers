/** Dossier de transmission : historique de l'entreprise rassemblé et valorisé pour un repreneur. */

import { one } from "@/lib/db";
import { intangibleAssets, valueBusiness, type TransferInputs, type TransferYear } from "@/lib/business-transfer";
import type { Ctx } from "./context";
import { requirePermission } from "./context";
import { healthFigures } from "./health-score";

const REV = "sum(CASE WHEN kind='credit_note' THEN -total_ht_cents ELSE total_ht_cents END)";

export async function transferInputs(ctx: Ctx, now = new Date()): Promise<TransferInputs> {
  const current = now.getUTCFullYear();
  const years: TransferYear[] = [];
  for (const year of [current - 3, current - 2, current - 1]) {
    const from = `${year}-01-01`;
    const to = `${year}-12-31`;
    const r = await one<{ revenue: unknown; costs: unknown }>(
      ctx.db,
      `SELECT (SELECT coalesce(${REV}, 0) FROM invoices WHERE org_id=$1 AND issue_date BETWEEN $2 AND $3) AS revenue,
        (SELECT coalesce(sum(amount_ht_cents), 0) FROM job_purchases WHERE org_id=$1 AND purchase_date BETWEEN $2 AND $3)
          + (SELECT coalesce(sum(amount_ttc_cents - vat_cents), 0) FROM expenses WHERE org_id=$1 AND expense_date BETWEEN $2 AND $3) AS costs`,
      [ctx.orgId, from, to],
    );
    years.push({ year, revenueCents: Number(r?.revenue ?? 0), costsCents: Number(r?.costs ?? 0) });
  }
  const health = await healthFigures(ctx.db, ctx.orgId, now);
  const since = `${current - 3}-01-01`;
  const c = await one<Record<string, unknown>>(
    ctx.db,
    `SELECT
      (SELECT count(DISTINCT customer_id) FROM invoices WHERE org_id=$1 AND issue_date >= $2 AND kind <> 'credit_note') AS customers,
      (SELECT count(*) FROM (SELECT customer_id FROM invoices WHERE org_id=$1 AND issue_date >= $2 AND kind <> 'credit_note' AND quote_id IS NOT NULL
         GROUP BY customer_id HAVING count(DISTINCT quote_id) >= 2) x) AS repeat,
      (SELECT count(*) FROM home_record_entries WHERE org_id=$1 AND kind='equipement' AND maintenance_months IS NOT NULL) AS maintained,
      (SELECT avg(rating) FROM customer_reviews WHERE org_id=$1 AND submitted_at IS NOT NULL AND hidden_reason='') AS review_avg,
      (SELECT count(*) FROM customer_reviews WHERE org_id=$1 AND submitted_at IS NOT NULL AND hidden_reason='') AS reviews,
      (SELECT count(*) FROM catalog_items WHERE org_id=$1 AND active) AS catalog,
      (SELECT count(*) FROM memberships WHERE org_id=$1) AS team,
      (SELECT count(*) FROM org_vehicles WHERE org_id=$1) AS vehicles`,
    [ctx.orgId, since],
  );
  const customers = Number(c?.customers ?? 0);
  return {
    years,
    customers,
    repeatShare: customers ? Number(c?.repeat ?? 0) / customers : null,
    topCustomerShare: health.topCustomerShare,
    backlogCents: health.backlogCents,
    maintainedEquipments: Number(c?.maintained ?? 0),
    reviewAverage: c?.review_avg == null ? null : Number(c.review_avg),
    reviewCount: Number(c?.reviews ?? 0),
    catalogItems: Number(c?.catalog ?? 0),
    teamMembers: Number(c?.team ?? 0),
    vehicles: Number(c?.vehicles ?? 0),
  };
}

export async function transferFile(ctx: Ctx, now = new Date()) {
  requirePermission(ctx, "billing");
  const inputs = await transferInputs(ctx, now);
  return { inputs, valuation: valueBusiness(inputs), assets: intangibleAssets(inputs) };
}
