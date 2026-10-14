/**
 * Résumé du jour : chantiers où l'équipe intervient aujourd'hui et devis envoyés en attente de réponse.
 * Sert la page « Aujourd'hui », le raccourci de l'application installée et les widgets d'écran d'accueil (API v1).
 */

import type { Ctx } from "./context";
import { can } from "./context";
import { parisDate } from "./quotes";

const CUSTOMER = "coalesce(nullif(c.company_name, ''), nullif(trim(c.first_name || ' ' || c.last_name), ''), '')";

export async function todaySummary(ctx: Ctx, now = new Date()) {
  const today = parisDate(now);
  const showAmounts = can(ctx, "billing");
  const [slots, quotes] = await Promise.all([
    ctx.db.query<{ job_id: string; title: string; site_city: string; site_line1: string; customer: string; resource_type: string; who: string | null }>(
      `SELECT j.id AS job_id, j.title, j.site_city, j.site_line1, ${CUSTOMER} AS customer, a.resource_type,
         CASE WHEN a.resource_type='user' THEN (SELECT coalesce(nullif(u.name, ''), u.email) FROM users u WHERE u.id=a.resource_id)
              ELSE (SELECT v.name FROM org_vehicles v WHERE v.id=a.resource_id) END AS who
       FROM job_assignments a JOIN jobs j ON j.id=a.job_id LEFT JOIN customers c ON c.id=j.customer_id
       WHERE a.org_id=$1 AND a.start_date <= $2 AND a.end_date >= $2 ORDER BY lower(j.title)`,
      [ctx.orgId, today],
    ),
    ctx.db.query<{
      id: string;
      number: string | null;
      title: string;
      customer: string;
      status: string;
      total_ttc_cents: unknown;
      sent_at: Date | null;
      valid_until: unknown;
    }>(
      `SELECT q.id, q.number, q.title, ${CUSTOMER} AS customer, q.status, q.total_ttc_cents, q.sent_at, q.valid_until
       FROM quotes q LEFT JOIN customers c ON c.id=q.customer_id
       WHERE q.org_id=$1 AND q.status IN ('sent', 'viewed') AND q.archived_at IS NULL ORDER BY q.valid_until NULLS LAST, q.sent_at`,
      [ctx.orgId],
    ),
  ]);
  const jobs = new Map<string, { id: string; title: string; city: string; address: string; customer: string; team: string[]; vehicles: string[] }>();
  for (const s of slots) {
    const j = jobs.get(s.job_id) ?? { id: s.job_id, title: s.title, city: s.site_city, address: s.site_line1, customer: s.customer, team: [], vehicles: [] };
    if (s.who) (s.resource_type === "user" ? j.team : j.vehicles).push(s.who);
    jobs.set(s.job_id, j);
  }
  const iso = (v: unknown) => (v == null ? null : v instanceof Date ? v.toISOString().slice(0, 10) : String(v).slice(0, 10));
  const pending = quotes.map((q) => ({
    id: q.id,
    number: q.number ?? "",
    title: q.title,
    customer: q.customer,
    viewed: q.status === "viewed",
    totalTtcCents: showAmounts ? Number(q.total_ttc_cents) : null,
    validUntil: iso(q.valid_until),
    expiresSoon: (iso(q.valid_until) ?? "9999") <= parisDate(new Date(now.getTime() + 7 * 86_400_000)),
  }));
  return {
    date: today,
    jobs: [...jobs.values()],
    quotes: {
      count: pending.length,
      totalTtcCents: showAmounts ? pending.reduce((s, q) => s + (q.totalTtcCents ?? 0), 0) : null,
      items: pending.slice(0, 20),
    },
  };
}
