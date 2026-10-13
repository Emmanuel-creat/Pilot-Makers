/**
 * Administration de la plateforme et assistance (module M).
 *
 * L'administrateur voit l'état des comptes, jamais les mots de passe ni des
 * données bancaires complètes. L'accès aux données métier d'un client exige un
 * motif, est limité dans le temps, en lecture seule, et journalisé.
 */

import { z } from "zod";
import type { Database } from "@/lib/db";
import { num, one } from "@/lib/db";
import { badRequest, forbidden, notFound } from "@/lib/http";
import { requestPasswordReset } from "./accounts";
import { computeEntitlements } from "./billing";
import type { Ctx } from "./context";
import { adminTwoFactorRequired, audit } from "./context";

export function requirePlatformAdmin(ctx: Ctx) {
  if (!ctx.isPlatformAdmin || ctx.supportAccess) throw forbidden("Réservé à l'administration de la plateforme");
  if (adminTwoFactorRequired() && !ctx.twoFactor) throw forbidden("Activez la double authentification pour administrer la plateforme");
}

export async function searchAccounts(ctx: Ctx, q = "") {
  requirePlatformAdmin(ctx);
  const rows = await ctx.db.query<Record<string, unknown>>(
    `SELECT o.id, o.trade_name, o.status, o.created_at, s.plan_code, s.status AS sub_status, s.trial_end,
       (SELECT u.email FROM memberships m JOIN users u ON u.id=m.user_id WHERE m.org_id=o.id AND m.role='owner' LIMIT 1) AS owner_email,
       (SELECT count(*) FROM memberships m WHERE m.org_id=o.id) AS members,
       (SELECT count(*) FROM quotes q WHERE q.org_id=o.id) AS quotes
     FROM organizations o LEFT JOIN subscriptions s ON s.org_id=o.id
     WHERE $1 = '' OR lower(o.trade_name) LIKE $2 OR EXISTS (
       SELECT 1 FROM memberships m JOIN users u ON u.id=m.user_id WHERE m.org_id=o.id AND lower(u.email) LIKE $2)
     ORDER BY o.created_at DESC LIMIT 100`,
    [q.trim(), `%${q.trim().toLowerCase()}%`],
  );
  await audit(ctx.db, { userId: ctx.userId, action: "admin.search", data: { q }, ip: ctx.ip });
  return rows.map((r) => ({
    id: String(r.id),
    tradeName: String(r.trade_name),
    status: String(r.status),
    createdAt: r.created_at as Date,
    plan: String(r.plan_code ?? ""),
    subStatus: String(r.sub_status ?? ""),
    ownerEmail: String(r.owner_email ?? ""),
    members: num(r.members),
    quotes: num(r.quotes),
  }));
}

export async function accountDetail(ctx: Ctx, orgId: string) {
  requirePlatformAdmin(ctx);
  const org = await one<Record<string, unknown>>(ctx.db, "SELECT id, trade_name, status, suspended_reason, created_at, feature_flags FROM organizations WHERE id=$1", [orgId]);
  if (!org) throw notFound();
  const members = await ctx.db.query<{ id: string; email: string; name: string; role: string; status: string; email_verified_at: Date | null; created_at: Date }>(
    `SELECT u.id, u.email, u.name, m.role, u.status, u.email_verified_at, u.created_at FROM memberships m JOIN users u ON u.id=m.user_id WHERE m.org_id=$1`,
    [orgId],
  );
  const sub = await one<Record<string, unknown>>(ctx.db, "SELECT * FROM subscriptions WHERE org_id=$1", [orgId]);
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  const usage = await ctx.db.query<{ kind: string; units: unknown; cost: unknown }>(
    "SELECT kind, sum(units) AS units, sum(cost_micro_eur) AS cost FROM usage_events WHERE org_id=$1 AND created_at >= $2 GROUP BY kind",
    [orgId, monthStart],
  );
  const events = await ctx.db.query<{ action: string; created_at: Date; ip: string }>(
    "SELECT action, created_at, ip FROM audit_logs WHERE org_id=$1 ORDER BY created_at DESC LIMIT 30",
    [orgId],
  );
  const errors = await ctx.db.query<{ kind: string; message: string; created_at: Date }>(
    "SELECT kind, message, created_at FROM error_events WHERE org_id=$1 ORDER BY created_at DESC LIMIT 20",
    [orgId],
  );
  const invoices = await ctx.db.query<Record<string, unknown>>(
    "SELECT number, plan_code, amount_ttc_cents, status, created_at FROM billing_invoices WHERE org_id=$1 ORDER BY created_at DESC",
    [orgId],
  );
  const ent = await computeEntitlements(ctx.db, orgId, String(org.status));
  await audit(ctx.db, { orgId, userId: ctx.userId, action: "admin.view_account", ip: ctx.ip });
  return {
    org,
    members,
    subscription: sub,
    entitlements: ent,
    usage: usage.map((u) => ({ kind: u.kind, units: num(u.units), costMicroEur: num(u.cost) })),
    events,
    errors,
    invoices,
  };
}

export async function setOrgSuspended(ctx: Ctx, orgId: string, suspended: boolean, reason: string) {
  requirePlatformAdmin(ctx);
  if (suspended && reason.trim().length < 10) throw badRequest("Motif de suspension obligatoire (10 caractères minimum)");
  await ctx.db.query("UPDATE organizations SET status=$2, suspended_reason=$3, updated_at=now() WHERE id=$1", [
    orgId,
    suspended ? "suspended" : "active",
    suspended ? reason.trim() : null,
  ]);
  // La suspension ne supprime aucune donnée : le compte reste consultable et exportable.
  await audit(ctx.db, { orgId, userId: ctx.userId, action: suspended ? "admin.suspend" : "admin.reactivate", data: { reason }, ip: ctx.ip });
}

export async function adminTriggerReset(ctx: Ctx, userId: string) {
  requirePlatformAdmin(ctx);
  const u = await one<{ email: string }>(ctx.db, "SELECT email FROM users WHERE id=$1", [userId]);
  if (!u) throw notFound();
  await requestPasswordReset(ctx.db, u.email);
  await audit(ctx.db, { userId: ctx.userId, action: "admin.trigger_reset", target: userId, ip: ctx.ip });
}

export async function grantSupportAccess(ctx: Ctx, orgId: string, reason: string, minutes: number) {
  requirePlatformAdmin(ctx);
  if (reason.trim().length < 10) throw badRequest("Justifiez l'accès (10 caractères minimum)");
  const m = Math.min(Math.max(Math.round(minutes), 5), 60);
  const row = await one<{ id: string }>(
    ctx.db,
    "INSERT INTO support_access (admin_user_id, org_id, reason, expires_at) VALUES ($1,$2,$3,$4) RETURNING id",
    [ctx.userId, orgId, reason.trim(), new Date(Date.now() + m * 60_000)],
  );
  await audit(ctx.db, { orgId, userId: ctx.userId, action: "admin.support_access", data: { reason, minutes: m }, ip: ctx.ip });
  return row!.id;
}

export async function resolveSupportAccess(db: Database, adminUserId: string, accessId: string) {
  return one<{ org_id: string; reason: string; expires_at: Date }>(
    db,
    "SELECT org_id, reason, expires_at FROM support_access WHERE id=$1 AND admin_user_id=$2 AND expires_at > now()",
    [accessId, adminUserId],
  );
}

export const planUpdateSchema = z.object({
  name: z.string().trim().min(1).max(60),
  description: z.string().trim().max(200).default(""),
  price_month_cents: z.coerce.number().int().min(0),
  price_year_cents: z.coerce.number().int().min(0),
  max_users: z.coerce.number().int().min(1).max(1000),
  max_quotes_per_month: z.coerce.number().int().min(1).nullable(),
  ai_quota_month: z.coerce.number().int().min(0),
  trial_days: z.coerce.number().int().min(0).max(90),
  active: z.boolean(),
  features: z.object({ watermark: z.boolean(), margin: z.boolean(), reminders: z.boolean(), templates: z.boolean() }),
});

export async function updatePlan(ctx: Ctx, code: string, raw: unknown) {
  requirePlatformAdmin(ctx);
  const parsed = planUpdateSchema.safeParse(raw);
  if (!parsed.success) throw badRequest(parsed.error.issues[0].message);
  const p = parsed.data;
  const r = await ctx.db.query(
    `UPDATE plans SET name=$2, description=$3, price_month_cents=$4, price_year_cents=$5, max_users=$6, max_quotes_per_month=$7,
       ai_quota_month=$8, trial_days=$9, active=$10, features=$11 WHERE code=$1 RETURNING code`,
    [code, p.name, p.description, p.price_month_cents, p.price_year_cents, p.max_users, p.max_quotes_per_month, p.ai_quota_month, p.trial_days, p.active, JSON.stringify(p.features)],
  );
  if (!r.length) throw notFound("Offre inconnue");
  await audit(ctx.db, { userId: ctx.userId, action: "admin.plan_update", target: code, data: p, ip: ctx.ip });
}

export async function platformStats(ctx: Ctx) {
  requirePlatformAdmin(ctx);
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  const r = (
    await ctx.db.query<Record<string, unknown>>(
      `SELECT
        (SELECT count(*) FROM organizations) AS orgs,
        (SELECT count(*) FROM users WHERE status='active') AS users,
        (SELECT count(*) FROM quotes) AS quotes,
        (SELECT count(*) FROM quote_versions WHERE issued_at >= $1) AS issued_month,
        (SELECT count(*) FROM emails WHERE created_at >= $1) AS emails_month,
        (SELECT count(*) FROM emails WHERE created_at >= $1 AND status IN ('failed','bounced')) AS emails_failed,
        (SELECT coalesce(sum(cost_micro_eur),0) FROM usage_events WHERE created_at >= $1 AND kind='ai') AS ai_cost,
        (SELECT coalesce(sum(cost_micro_eur),0) FROM usage_events WHERE created_at >= $1 AND kind='email') AS email_cost,
        (SELECT count(*) FROM usage_events WHERE created_at >= $1 AND kind='ai') AS ai_calls,
        (SELECT count(*) FROM error_events WHERE created_at >= $1) AS errors,
        (SELECT count(*) FROM error_events WHERE created_at >= $1 AND kind LIKE 'pdf%') AS pdf_errors`,
      [monthStart],
    )
  )[0];
  const bySub = await ctx.db.query<{ plan_code: string; status: string; n: unknown }>(
    "SELECT plan_code, status, count(*) AS n FROM subscriptions GROUP BY plan_code, status ORDER BY plan_code",
  );
  return {
    orgs: num(r.orgs),
    users: num(r.users),
    quotes: num(r.quotes),
    issuedMonth: num(r.issued_month),
    emailsMonth: num(r.emails_month),
    emailsFailed: num(r.emails_failed),
    aiCalls: num(r.ai_calls),
    aiCostMicroEur: num(r.ai_cost),
    emailCostMicroEur: num(r.email_cost),
    errors: num(r.errors),
    pdfErrors: num(r.pdf_errors),
    subscriptions: bySub.map((s) => ({ plan: s.plan_code, status: s.status, count: num(s.n) })),
  };
}

export async function recentErrors(ctx: Ctx) {
  requirePlatformAdmin(ctx);
  return ctx.db.query<{ id: unknown; kind: string; message: string; org_id: string | null; created_at: Date }>(
    "SELECT id, kind, message, org_id, created_at FROM error_events ORDER BY created_at DESC LIMIT 100",
  );
}

export async function auditTrail(ctx: Ctx) {
  requirePlatformAdmin(ctx);
  return ctx.db.query<{ id: unknown; action: string; org_id: string | null; user_id: string | null; target: string; ip: string; created_at: Date }>(
    "SELECT id, action, org_id, user_id, target, ip, created_at FROM audit_logs WHERE action LIKE 'admin.%' OR action LIKE 'billing.%' OR action LIKE 'account.%' OR action LIKE 'file.%' ORDER BY created_at DESC LIMIT 200",
  );
}

/* Assistance */

export async function createTicket(ctx: Ctx, subject: string, body: string) {
  if (subject.trim().length < 3 || body.trim().length < 10) throw badRequest("Décrivez votre demande (sujet et message)");
  await ctx.db.query("INSERT INTO support_tickets (org_id, user_id, subject, body) VALUES ($1,$2,$3,$4)", [
    ctx.orgId,
    ctx.userId,
    subject.trim().slice(0, 200),
    body.trim().slice(0, 5000),
  ]);
}

export async function listTickets(ctx: Ctx, all = false) {
  if (all) requirePlatformAdmin(ctx);
  return ctx.db.query<{ id: string; subject: string; body: string; status: string; answer: string; created_at: Date; org_name: string; user_email: string }>(
    `SELECT t.id, t.subject, t.body, t.status, t.answer, t.created_at, o.trade_name AS org_name, u.email AS user_email
     FROM support_tickets t LEFT JOIN organizations o ON o.id=t.org_id LEFT JOIN users u ON u.id=t.user_id
     WHERE $1 OR t.org_id=$2 ORDER BY t.created_at DESC LIMIT 200`,
    [all, ctx.orgId],
  );
}

export async function answerTicket(ctx: Ctx, id: string, answer: string, close: boolean) {
  requirePlatformAdmin(ctx);
  await ctx.db.query("UPDATE support_tickets SET answer=$2, status=$3, updated_at=now() WHERE id=$1", [id, answer.trim(), close ? "closed" : "answered"]);
  await audit(ctx.db, { userId: ctx.userId, action: "admin.ticket_answer", target: id, ip: ctx.ip });
}

export async function listReleases(db: Database) {
  return db.query<{ id: string; version: string; notes: string; created_at: Date }>("SELECT * FROM app_releases ORDER BY created_at DESC LIMIT 50");
}

export async function addRelease(ctx: Ctx, version: string, notes: string) {
  requirePlatformAdmin(ctx);
  if (!version.trim()) throw badRequest("Numéro de version requis");
  await ctx.db.query("INSERT INTO app_releases (version, notes) VALUES ($1,$2)", [version.trim(), notes.trim()]);
  await audit(ctx.db, { userId: ctx.userId, action: "admin.release", target: version, ip: ctx.ip });
}
