/** Indice national de l'activité artisanale : agrégats mensuels des entreprises contributrices. */

import type { Queryable } from "@/lib/db";
import { num } from "@/lib/db";
import { activityIndex, lastMonths, type OrgMonth } from "@/lib/activity-index";

export async function orgMonths(db: Queryable, months: readonly string[]): Promise<OrgMonth[]> {
  const from = `${months[0]}-01`;
  const rows = await db.query<Record<string, unknown>>(
    `WITH q AS (
       SELECT q.org_id, to_char(q.issued_at AT TIME ZONE 'Europe/Paris', 'YYYY-MM') AS month, count(*) AS issued,
              count(*) FILTER (WHERE q.status='accepted') AS accepted,
              coalesce(sum(q.total_ht_cents) FILTER (WHERE q.status='accepted'), 0) AS accepted_ht
       FROM quotes q JOIN organizations o ON o.id=q.org_id
       WHERE o.benchmark_optin_at IS NOT NULL AND q.issued_at >= $1::date GROUP BY 1, 2),
     i AS (
       SELECT i.org_id, to_char(i.issue_date, 'YYYY-MM') AS month,
              sum(CASE WHEN i.kind='credit_note' THEN -abs(i.total_ht_cents) ELSE i.total_ht_cents END) AS invoiced
       FROM invoices i JOIN organizations o ON o.id=i.org_id
       WHERE o.benchmark_optin_at IS NOT NULL AND i.issue_date >= $1::date GROUP BY 1, 2)
     SELECT coalesce(q.org_id, i.org_id) AS org_id, coalesce(q.month, i.month) AS month,
            coalesce(q.issued, 0) AS issued, coalesce(q.accepted, 0) AS accepted, coalesce(q.accepted_ht, 0) AS accepted_ht, coalesce(i.invoiced, 0) AS invoiced
     FROM q FULL JOIN i ON i.org_id=q.org_id AND i.month=q.month`,
    [from],
  );
  return rows.map((r) => ({
    orgId: String(r.org_id),
    month: String(r.month),
    quotesIssued: num(r.issued),
    quotesAccepted: num(r.accepted),
    acceptedHtCents: num(r.accepted_ht),
    invoicedHtCents: num(r.invoiced),
  }));
}

export async function publicActivityIndex(db: Queryable, now = new Date()) {
  const months = lastMonths(now);
  return activityIndex(await orgMonths(db, months), months);
}
