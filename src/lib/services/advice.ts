/** Conseils proactifs : signaux calculés à la demande, masquables pour 30 jours par l'entreprise. */

import { z } from "zod";
import { buildAdvice, STALE_QUOTE_DAYS, UNBILLED_DAYS, type Advice } from "@/lib/advice";
import { one } from "@/lib/db";
import { healthScore } from "@/lib/health-score";
import { badRequest } from "@/lib/http";
import { teamBalance } from "./balance";
import type { Ctx } from "./context";
import { can, requirePermission, requireWritable } from "./context";
import { healthFigures } from "./health-score";
import { invoiceSummary } from "./invoices";
import { maintenanceDueCount } from "./maintenance";
import { parisDate } from "./quotes";

export async function proactiveAdvice(ctx: Ctx, now = new Date()): Promise<Advice[]> {
  requirePermission(ctx, "billing");
  const today = parisDate(now);
  const in7 = parisDate(new Date(now.getTime() + 7 * 86_400_000));
  const [inv, q, figures, balance, dismissed, maintenanceDue] = await Promise.all([
    invoiceSummary(ctx),
    one<Record<string, unknown>>(
      ctx.db,
      `SELECT
        (SELECT count(*) FROM quotes WHERE org_id=$1 AND status IN ('sent','viewed') AND archived_at IS NULL AND sent_at < $2) AS stale,
        (SELECT coalesce(sum(total_ht_cents), 0) FROM quotes WHERE org_id=$1 AND status IN ('sent','viewed') AND archived_at IS NULL AND sent_at < $2) AS stale_cents,
        (SELECT count(*) FROM quotes WHERE org_id=$1 AND status IN ('sent','viewed') AND archived_at IS NULL AND valid_until BETWEEN $4 AND $5) AS expiring,
        (SELECT count(*) FROM quotes q WHERE q.org_id=$1 AND q.status='accepted' AND q.archived_at IS NULL AND q.responded_at < $3
           AND NOT EXISTS (SELECT 1 FROM invoices i WHERE i.quote_id=q.id)) AS unbilled,
        (SELECT coalesce(sum(total_ht_cents), 0) FROM quotes q WHERE q.org_id=$1 AND q.status='accepted' AND q.archived_at IS NULL AND q.responded_at < $3
           AND NOT EXISTS (SELECT 1 FROM invoices i WHERE i.quote_id=q.id)) AS unbilled_cents,
        (SELECT count(*) FROM jobs WHERE org_id=$1 AND status='termine' AND updated_at < $6) AS unreceived`,
      [
        ctx.orgId,
        new Date(now.getTime() - STALE_QUOTE_DAYS * 86_400_000),
        new Date(now.getTime() - UNBILLED_DAYS * 86_400_000),
        today,
        in7,
        new Date(now.getTime() - 7 * 86_400_000),
      ],
    ),
    healthFigures(ctx.db, ctx.orgId, now),
    can(ctx, "staff") ? teamBalance(ctx, now) : Promise.resolve(null),
    ctx.db.query<{ key: string }>("SELECT key FROM advice_dismissals WHERE org_id=$1 AND until >= $2", [ctx.orgId, today]),
    maintenanceDueCount(ctx, now),
  ]);
  const hidden = new Set(dismissed.map((d) => d.key));
  return buildAdvice({
    overdue: { count: inv.overdueCount, cents: inv.overdueCents },
    staleQuotes: { count: Number(q?.stale ?? 0), cents: Number(q?.stale_cents ?? 0) },
    expiringQuotes: Number(q?.expiring ?? 0),
    unbilled: { count: Number(q?.unbilled ?? 0), cents: Number(q?.unbilled_cents ?? 0) },
    unreceivedJobs: Number(q?.unreceived ?? 0),
    overloaded: balance ? balance.overloaded : null,
    maintenanceDue,
    weakIndicators: healthScore(figures).indicators,
  }).filter((a) => !hidden.has(a.key));
}

const dismissSchema = z.object({ key: z.string().regex(/^[a-z-]{3,40}$/), days: z.coerce.number().int().min(1).max(90).default(30) });

export async function dismissAdvice(ctx: Ctx, raw: unknown, now = new Date()) {
  requireWritable(ctx);
  requirePermission(ctx, "billing");
  const p = dismissSchema.safeParse(raw);
  if (!p.success) throw badRequest("Conseil invalide");
  const until = parisDate(new Date(now.getTime() + p.data.days * 86_400_000));
  await ctx.db.query(
    `INSERT INTO advice_dismissals (org_id, key, until, created_by) VALUES ($1,$2,$3,$4)
     ON CONFLICT (org_id, key) DO UPDATE SET until=excluded.until, created_by=excluded.created_by, created_at=now()`,
    [ctx.orgId, p.data.key, until, ctx.userId],
  );
}
