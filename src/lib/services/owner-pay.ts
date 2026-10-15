/** Mon vrai salaire : chiffres des douze derniers mois tenus dans l'application et heures pointées du dirigeant. */

import { num, one } from "@/lib/db";
import type { Ctx } from "./context";
import { requirePermission } from "./context";
import { parisDate } from "./quotes";

const REV = "sum(CASE WHEN kind='credit_note' THEN -total_ht_cents ELSE total_ht_cents END)";

export async function ownerPayFacts(ctx: Ctx, now = new Date()) {
  requirePermission(ctx, "billing");
  const to = parisDate(now);
  const d = new Date(`${to}T12:00:00Z`);
  d.setUTCFullYear(d.getUTCFullYear() - 1);
  d.setUTCDate(d.getUTCDate() + 1);
  const from = d.toISOString().slice(0, 10);
  const r = await one<Record<string, unknown>>(
    ctx.db,
    `SELECT (SELECT coalesce(${REV}, 0) FROM invoices WHERE org_id=$1 AND issue_date BETWEEN $2 AND $3) AS revenue,
       (SELECT coalesce(sum(amount_ht_cents), 0) FROM job_purchases WHERE org_id=$1 AND purchase_date BETWEEN $2 AND $3)
         + (SELECT coalesce(sum(amount_ttc_cents - vat_cents), 0) FROM expenses WHERE org_id=$1 AND expense_date BETWEEN $2 AND $3) AS costs,
       (SELECT coalesce(sum(minutes), 0) FROM time_entries WHERE org_id=$1 AND user_id=$4 AND status <> 'refuse' AND work_date BETWEEN $2 AND $3) AS minutes,
       (SELECT count(DISTINCT date_trunc('week', work_date)) FROM time_entries WHERE org_id=$1 AND user_id=$4 AND status <> 'refuse' AND work_date BETWEEN $2 AND $3) AS weeks`,
    [ctx.orgId, from, to, ctx.userId],
  );
  const minutes = num(r?.minutes);
  const weeks = num(r?.weeks);
  return {
    from,
    to,
    revenueCents: num(r?.revenue),
    costsCents: num(r?.costs),
    /** Moyenne des semaines pointées par le dirigeant, si au moins quatre semaines le sont */
    trackedHoursPerWeek: weeks >= 4 ? Math.round(minutes / 60 / weeks) : null,
  };
}
