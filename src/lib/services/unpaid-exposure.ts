/** Zéro impayé : avance de trésorerie consentie au client sur chaque chantier en cours. */

import { num } from "@/lib/db";
import { portfolio } from "@/lib/unpaid-exposure";
import type { Ctx } from "./context";
import { requirePermission } from "./context";

const CUSTOMER = "coalesce(nullif(c.company_name, ''), nullif(trim(c.first_name || ' ' || c.last_name), ''), '')";

export async function unpaidExposure(ctx: Ctx) {
  requirePermission(ctx, "billing");
  const rows = await ctx.db.query<Record<string, unknown>>(
    `SELECT j.id, j.title, ${CUSTOMER} AS customer, q.id AS quote_id, q.total_ttc_cents,
       (SELECT CASE WHEN coalesce(sum(t.weight_cents), 0) > 0 THEN sum(t.weight_cents * t.progress_bp) / sum(t.weight_cents)
                    ELSE coalesce(avg(t.progress_bp), 0) END FROM job_tasks t WHERE t.job_id=j.id) AS progress_bp,
       (SELECT coalesce(sum(CASE WHEN i.kind='credit_note' THEN -i.total_ttc_cents ELSE i.total_ttc_cents END), 0) FROM invoices i
          WHERE i.quote_id=q.id AND i.org_id=j.org_id) AS invoiced,
       (SELECT coalesce(sum(p.amount_cents), 0) FROM invoice_payments p JOIN invoices i ON i.id=p.invoice_id
          WHERE i.quote_id=q.id AND p.org_id=j.org_id AND p.canceled_at IS NULL) AS paid,
       EXISTS (SELECT 1 FROM payment_stages s WHERE s.quote_id=q.id) AS has_stages,
       (SELECT count(*) FROM payment_stages s WHERE s.quote_id=q.id AND s.status='soumise') AS stages_waiting
     FROM jobs j JOIN quotes q ON q.id=j.quote_id LEFT JOIN customers c ON c.id=j.customer_id
     WHERE j.org_id=$1 AND j.status IN ('en_cours', 'termine') AND q.status='accepted'
     ORDER BY j.created_at DESC LIMIT 300`,
    [ctx.orgId],
  );
  return portfolio(
    rows.map((r) => ({
      jobId: String(r.id),
      title: String(r.title),
      customer: String(r.customer ?? ""),
      quoteId: String(r.quote_id),
      totalTtcCents: num(r.total_ttc_cents),
      progressBp: Math.round(num(r.progress_bp)),
      invoicedTtcCents: num(r.invoiced),
      paidTtcCents: num(r.paid),
      hasStages: !!r.has_stages,
      stagesWaiting: num(r.stages_waiting),
    })),
  );
}
