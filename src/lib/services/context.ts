import type { Database, Queryable } from "@/lib/db";
import { forbidden } from "@/lib/http";

export type Role = "owner" | "admin" | "member";

export interface PlanInfo {
  code: string;
  name: string;
  maxUsers: number;
  maxQuotesPerMonth: number | null;
  aiQuotaMonth: number;
  features: { watermark?: boolean; margin?: boolean; reminders?: boolean; templates?: boolean };
}

export interface Entitlements {
  /** Offre réellement appliquée (après essai expiré ou impayé, retour à Découverte) */
  plan: PlanInfo;
  subscriptionStatus: string;
  /** Lecture seule : compte suspendu. L'export reste toujours possible. */
  readOnly: boolean;
  notice: string | null;
}

/** Contexte d'une requête authentifiée : tout accès aux données passe par lui. */
export interface Ctx {
  db: Database;
  userId: string;
  orgId: string;
  role: Role;
  email: string;
  userName: string;
  isPlatformAdmin: boolean;
  /** Double authentification activée sur le compte */
  twoFactor?: boolean;
  sessionId: string | null;
  ip: string;
  userAgent: string;
  entitlements: Entitlements;
  /** Accès support en cours (administrateur de la plateforme dans l'espace d'un client) */
  supportAccess?: { reason: string; expiresAt: Date };
}

/** En production, l'administration exige la double authentification (désactivable par REQUIRE_ADMIN_2FA=0). */
export function adminTwoFactorRequired() {
  const flag = process.env.REQUIRE_ADMIN_2FA;
  return flag ? flag === "1" : process.env.NODE_ENV === "production";
}

const ROLE_RANK: Record<Role, number> = { member: 1, admin: 2, owner: 3 };

export function requireRole(ctx: Ctx, min: Role) {
  if (ROLE_RANK[ctx.role] < ROLE_RANK[min]) throw forbidden("Votre rôle ne permet pas cette action");
}

export function requireWritable(ctx: Ctx) {
  if (ctx.entitlements.readOnly) {
    throw forbidden("Compte en lecture seule : " + (ctx.entitlements.notice ?? "action impossible"));
  }
  if (ctx.supportAccess) throw forbidden("L'accès support est en lecture seule");
}

export async function audit(
  q: Queryable,
  entry: { orgId?: string | null; userId?: string | null; action: string; target?: string; data?: unknown; ip?: string },
) {
  await q.query("INSERT INTO audit_logs (org_id, user_id, action, target, data, ip) VALUES ($1,$2,$3,$4,$5,$6)", [
    entry.orgId ?? null,
    entry.userId ?? null,
    entry.action,
    entry.target ?? "",
    JSON.stringify(entry.data ?? {}),
    entry.ip ?? "",
  ]);
}

export async function logError(q: Queryable, kind: string, message: string, orgId?: string | null, data?: unknown) {
  try {
    await q.query("INSERT INTO error_events (kind, message, org_id, data) VALUES ($1,$2,$3,$4)", [
      kind,
      message.slice(0, 2000),
      orgId ?? null,
      JSON.stringify(data ?? {}),
    ]);
  } catch {
    // La journalisation ne doit jamais masquer l'erreur d'origine.
  }
}

export async function recordUsage(q: Queryable, orgId: string, userId: string | null, kind: string, units = 1, costMicroEur = 0) {
  await q.query("INSERT INTO usage_events (org_id, user_id, kind, units, cost_micro_eur) VALUES ($1,$2,$3,$4,$5)", [
    orgId,
    userId,
    kind,
    units,
    costMicroEur,
  ]);
}
