import type { Database, Queryable } from "@/lib/db";
import { forbidden } from "@/lib/http";
import { appendSealed } from "./sealed-journal";

export type Role = "owner" | "admin" | "member";

/** Fonction dans l'entreprise : affine les droits du rôle. */
export type JobFunction = "gerant" | "conducteur" | "secretariat" | "ouvrier" | "comptable";
/**
 * Droits par domaine :
 * - settings : réglages de l'entreprise, équipe, abonnement, API, webhooks, export complet ;
 * - billing : factures, paiements, relances, chiffre d'affaires ;
 * - costs : coûts et marges des chantiers, achats, commandes fournisseurs, sous-traitants ;
 * - staff : validation des heures et des notes de frais, paie.
 */
export type Permission = "settings" | "billing" | "costs" | "staff";

export const JOB_FUNCTIONS: Record<JobFunction, { label: string; role: "admin" | "member"; permissions: Permission[]; description: string }> = {
  gerant: {
    label: "Gérant",
    role: "admin",
    permissions: ["settings", "billing", "costs", "staff"],
    description: "Tous les droits.",
  },
  conducteur: {
    label: "Conducteur de travaux",
    role: "admin",
    permissions: ["costs", "staff"],
    description: "Devis, chantiers, planning, coûts, commandes, sous-traitants, validation des heures et des frais. Ni factures ni réglages.",
  },
  secretariat: {
    label: "Secrétariat",
    role: "admin",
    permissions: ["billing", "staff"],
    description: "Devis, clients, factures, paiements, relances, heures et frais pour la paie. Ni coûts ni marges, ni réglages.",
  },
  ouvrier: {
    label: "Ouvrier ou compagnon",
    role: "member",
    permissions: [],
    description: "Ses chantiers, le journal, son pointage et ses notes de frais.",
  },
  comptable: {
    label: "Expert-comptable",
    role: "member",
    permissions: ["billing"],
    description: "Consultation des factures, règlements, TVA, trésorerie et exports comptables. Aucune modification possible ; ne compte pas dans les utilisateurs de l'offre.",
  },
};

/** Fonctions qui consultent sans jamais modifier. */
export function isReadOnlyMember(ctx: Pick<Ctx, "jobFunction">) {
  return ctx.jobFunction === "comptable";
}

const PERMISSION_MESSAGES: Record<Permission, string> = {
  settings: "Réservé au gérant : réglages de l'entreprise",
  billing: "Votre fonction ne donne pas accès à la facturation",
  costs: "Votre fonction ne donne pas accès aux coûts et aux marges",
  staff: "Votre fonction ne permet pas de valider les heures ni les frais",
};

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
  /** Fonction dans l'entreprise ; sans fonction, seuls les rôles s'appliquent */
  jobFunction?: JobFunction | null;
  email: string;
  userName: string;
  isPlatformAdmin: boolean;
  /** Double authentification activée sur le compte */
  twoFactor?: boolean;
  sessionId: string | null;
  ip: string;
  userAgent: string;
  entitlements: Entitlements;
  /** Requête de l'API publique : clé utilisée et droits accordés */
  apiKey?: { id: string; scopes: string[] };
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

/** Le titulaire du compte a tous les droits ; sinon la fonction décide, ou à défaut le rôle (comportement historique). */
export function can(ctx: Pick<Ctx, "role" | "jobFunction">, permission: Permission): boolean {
  if (ctx.role === "owner") return true;
  if (ctx.jobFunction) {
    if (!JOB_FUNCTIONS[ctx.jobFunction].permissions.includes(permission)) return false;
    return permission === "billing" || ROLE_RANK[ctx.role] >= ROLE_RANK.admin;
  }
  return permission === "billing" ? true : ROLE_RANK[ctx.role] >= ROLE_RANK.admin;
}

export function requirePermission(ctx: Ctx, permission: Permission) {
  if (!can(ctx, permission)) throw forbidden(PERMISSION_MESSAGES[permission]);
}

export function requireWritable(ctx: Ctx) {
  if (ctx.entitlements.readOnly) {
    throw forbidden("Compte en lecture seule : " + (ctx.entitlements.notice ?? "action impossible"));
  }
  if (ctx.supportAccess) throw forbidden("L'accès support est en lecture seule");
  if (isReadOnlyMember(ctx)) throw forbidden("L'accès expert-comptable est en lecture seule");
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
  // Les actions d'administration de la plateforme vont aussi dans le journal scellé.
  if (entry.action.startsWith("admin.")) {
    await appendSealed(q, { actor: entry.userId ?? null, org: entry.orgId ?? null, action: entry.action, target: entry.target ?? "", data: entry.data, ip: entry.ip ?? "" });
  }
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
