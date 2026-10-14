/**
 * Score de santé calculé sur les 12 derniers mois, et liens de partage en lecture seule pour une banque
 * ou un assureur : limités dans le temps, révocables, consultations comptées.
 */

import { z } from "zod";
import { one, type Queryable } from "@/lib/db";
import { healthScore, type HealthFigures } from "@/lib/health-score";
import { badRequest, isUuid, notFound } from "@/lib/http";
import { randomToken, sha256 } from "@/lib/security";
import type { Ctx } from "./context";
import { audit, requirePermission, requireWritable } from "./context";
import { parisDate } from "./quotes";

const day = (now: Date, back: number) => parisDate(new Date(now.getTime() - back * 86_400_000));

export async function healthFigures(db: Queryable, orgId: string, now = new Date()): Promise<HealthFigures> {
  const today = day(now, 0);
  const y1 = day(now, 365);
  const y2 = day(now, 730);
  const REV = "sum(CASE WHEN kind='credit_note' THEN -total_ht_cents ELSE total_ht_cents END)";
  const r = await one<Record<string, unknown>>(
    db,
    `SELECT
      (SELECT coalesce(${REV}, 0) FROM invoices WHERE org_id=$1 AND issue_date > $2 AND issue_date <= $3) AS revenue,
      (SELECT coalesce(${REV}, 0) FROM invoices WHERE org_id=$1 AND issue_date > $4 AND issue_date <= $2) AS previous,
      (SELECT coalesce(sum(amount_ht_cents), 0) FROM job_purchases WHERE org_id=$1 AND purchase_date > $2 AND purchase_date <= $3)
        + (SELECT coalesce(sum(amount_ttc_cents - vat_cents), 0) FROM expenses WHERE org_id=$1 AND expense_date > $2 AND expense_date <= $3) AS costs,
      (SELECT avg(d) FROM (SELECT max(p.paid_on) - i.issue_date AS d FROM invoices i JOIN invoice_payments p ON p.invoice_id=i.id AND p.canceled_at IS NULL
         WHERE i.org_id=$1 AND i.kind <> 'credit_note' AND i.issue_date > $2 GROUP BY i.id, i.issue_date, i.total_ttc_cents
         HAVING sum(p.amount_cents) >= i.total_ttc_cents) x) AS pay_days,
      (SELECT coalesce(sum(due), 0) FROM (SELECT i.total_ttc_cents - coalesce((SELECT sum(amount_cents) FROM invoice_payments p WHERE p.invoice_id=i.id AND p.canceled_at IS NULL), 0) AS due
         FROM invoices i WHERE i.org_id=$1 AND i.kind <> 'credit_note') x WHERE due > 0) AS outstanding,
      (SELECT coalesce(sum(due), 0) FROM (SELECT i.total_ttc_cents - coalesce((SELECT sum(amount_cents) FROM invoice_payments p WHERE p.invoice_id=i.id AND p.canceled_at IS NULL), 0) AS due
         FROM invoices i WHERE i.org_id=$1 AND i.kind <> 'credit_note' AND i.due_date < $3) x WHERE due > 0) AS overdue,
      (SELECT max(v) FROM (SELECT ${REV} AS v FROM invoices WHERE org_id=$1 AND issue_date > $2 AND issue_date <= $3 GROUP BY customer_id) x) AS top_customer,
      (SELECT coalesce(sum(greatest(q.total_ht_cents - coalesce((SELECT ${REV} FROM invoices i WHERE i.quote_id=q.id), 0), 0)), 0)
         FROM quotes q WHERE q.org_id=$1 AND q.status='accepted' AND q.archived_at IS NULL) AS backlog,
      (SELECT count(*) FILTER (WHERE status='accepted') FROM quotes WHERE org_id=$1 AND issued_at > $2 AND status IN ('accepted','refused','expired')) AS won,
      (SELECT count(*) FROM quotes WHERE org_id=$1 AND issued_at > $2 AND status IN ('accepted','refused','expired')) AS decided`,
    [orgId, y1, today, y2],
  );
  const revenue = Number(r?.revenue ?? 0);
  const decided = Number(r?.decided ?? 0);
  return {
    revenueCents: revenue,
    previousRevenueCents: Number(r?.previous ?? 0),
    costsCents: Number(r?.costs ?? 0),
    paymentDays: r?.pay_days == null ? null : Number(r.pay_days),
    outstandingCents: Number(r?.outstanding ?? 0),
    overdueCents: Number(r?.overdue ?? 0),
    topCustomerShare: revenue > 0 && r?.top_customer != null ? Math.min(1, Number(r.top_customer) / revenue) : null,
    backlogCents: Number(r?.backlog ?? 0),
    acceptance: decided >= 3 ? Number(r?.won ?? 0) / decided : null,
  };
}

export async function myHealthScore(ctx: Ctx, now = new Date()) {
  requirePermission(ctx, "billing");
  const figures = await healthFigures(ctx.db, ctx.orgId, now);
  return { ...healthScore(figures), figures };
}

const shareSchema = z.object({ label: z.string().trim().max(120).default(""), days: z.coerce.number().int().min(1).max(90).default(30) });

export async function createHealthShare(ctx: Ctx, raw: unknown, now = new Date()) {
  requireWritable(ctx);
  requirePermission(ctx, "settings");
  const p = shareSchema.safeParse(raw);
  if (!p.success) throw badRequest("Durée de 1 à 90 jours");
  const token = randomToken(24);
  const r = await one<{ id: string }>(
    ctx.db,
    "INSERT INTO health_score_shares (org_id, token_hash, label, expires_at, created_by) VALUES ($1,$2,$3,$4,$5) RETURNING id",
    [ctx.orgId, sha256(token), p.data.label, new Date(now.getTime() + p.data.days * 86_400_000), ctx.userId],
  );
  await audit(ctx.db, { orgId: ctx.orgId, userId: ctx.userId, action: "health_score.share", target: r!.id, data: { days: p.data.days }, ip: ctx.ip });
  return { id: r!.id, token };
}

export async function listHealthShares(ctx: Ctx) {
  requirePermission(ctx, "billing");
  const rows = await ctx.db.query<{
    id: string;
    label: string;
    expires_at: Date;
    revoked_at: Date | null;
    views: number;
    last_viewed_at: Date | null;
    created_at: Date;
  }>("SELECT id, label, expires_at, revoked_at, views, last_viewed_at, created_at FROM health_score_shares WHERE org_id=$1 ORDER BY created_at DESC LIMIT 50", [
    ctx.orgId,
  ]);
  const now = Date.now();
  return rows.map((r) => ({
    id: r.id,
    label: r.label,
    expiresAt: new Date(r.expires_at).toISOString(),
    active: !r.revoked_at && new Date(r.expires_at).getTime() > now,
    revoked: !!r.revoked_at,
    views: Number(r.views),
    lastViewedAt: r.last_viewed_at ? new Date(r.last_viewed_at).toISOString() : null,
  }));
}

export async function revokeHealthShare(ctx: Ctx, id: string) {
  requireWritable(ctx);
  requirePermission(ctx, "settings");
  if (!isUuid(id)) throw notFound("Lien introuvable");
  const r = await one(ctx.db, "UPDATE health_score_shares SET revoked_at=coalesce(revoked_at, now()) WHERE id=$1 AND org_id=$2 RETURNING id", [id, ctx.orgId]);
  if (!r) throw notFound("Lien introuvable");
}

/** Lecture publique d'un lien de partage valide ; null si inconnu, expiré ou révoqué. */
export async function sharedHealthScore(db: Queryable, token: string, now = new Date()) {
  if (!/^[A-Za-z0-9_-]{20,80}$/.test(token)) return null;
  const s = await one<{ id: string; org_id: string; expires_at: Date; label: string }>(
    db,
    "SELECT id, org_id, expires_at, label FROM health_score_shares WHERE token_hash=$1 AND revoked_at IS NULL AND expires_at > $2",
    [sha256(token), now],
  );
  if (!s) return null;
  await db.query("UPDATE health_score_shares SET views = views + 1, last_viewed_at = now() WHERE id=$1", [s.id]);
  const org = await one<{ name: string; siret: string; legal_form: string; city: string; trade: string }>(
    db,
    "SELECT coalesce(nullif(legal_name, ''), trade_name) AS name, siret, legal_form, city, trade FROM organizations WHERE id=$1",
    [s.org_id],
  );
  const figures = await healthFigures(db, s.org_id, now);
  return { org, expiresAt: new Date(s.expires_at).toISOString(), date: parisDate(now), ...healthScore(figures), figures };
}
