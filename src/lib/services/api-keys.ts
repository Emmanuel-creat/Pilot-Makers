/**
 * Clés d'accès à l'API publique.
 *
 * Une clé agit au nom de l'administrateur qui l'a créée, dans son entreprise : si cette personne
 * quitte l'entreprise ou perd son rôle, la clé cesse de fonctionner. Seule l'empreinte SHA-256
 * est enregistrée ; la clé complète n'est affichée qu'une fois, à la création.
 */

import { z } from "zod";
import type { Database } from "@/lib/db";
import { one } from "@/lib/db";
import { badRequest, forbidden, isUuid, notFound, unauthorized } from "@/lib/http";
import { hitRate } from "@/lib/rate-limit";
import { randomToken, sha256 } from "@/lib/security";
import { buildContext, type RequestMeta } from "./accounts";
import type { Ctx } from "./context";
import { audit, requireRole, requireWritable } from "./context";
import { hasFeature, requireFeature } from "./features";

export const API_SCOPES = { read: "Lecture", write: "Lecture et écriture" } as const;
export type ApiScope = keyof typeof API_SCOPES;

const KEY_PREFIX = "pm_";
const MAX_KEYS = 20;

export interface ApiKeyRow {
  id: string;
  name: string;
  prefix: string;
  scopes: string[];
  created_at: Date;
  last_used_at: Date | null;
  revoked_at: Date | null;
  created_by_name: string;
}

const createSchema = z.object({
  name: z.string().trim().min(1, "Donnez un nom à la clé").max(80),
  scope: z.enum(["read", "write"]).default("read"),
});

export async function createApiKey(ctx: Ctx, raw: unknown) {
  requireWritable(ctx);
  requireRole(ctx, "admin");
  await requireFeature(ctx, "api_publique");
  if (ctx.apiKey) throw forbidden("Une clé d'API ne peut pas créer d'autre clé");
  const p = createSchema.safeParse(raw);
  if (!p.success) throw badRequest(p.error.issues[0].message);
  const active = await one<{ n: unknown }>(ctx.db, "SELECT count(*) AS n FROM api_keys WHERE org_id=$1 AND revoked_at IS NULL", [ctx.orgId]);
  if (Number(active?.n ?? 0) >= MAX_KEYS) throw badRequest(`${MAX_KEYS} clés actives au plus : révoquez celles qui ne servent plus`);
  const key = KEY_PREFIX + randomToken(32);
  const scopes = p.data.scope === "write" ? ["read", "write"] : ["read"];
  const row = await ctx.db.transaction(async (tx) => {
    const r = await one<{ id: string }>(
      tx,
      "INSERT INTO api_keys (org_id, created_by, name, prefix, key_hash, scopes) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id",
      [ctx.orgId, ctx.userId, p.data.name, key.slice(0, 10), sha256(key), scopes],
    );
    await audit(tx, { orgId: ctx.orgId, userId: ctx.userId, action: "api_key.create", data: { name: p.data.name, scopes }, ip: ctx.ip });
    return r!;
  });
  return { id: row.id, key, scopes };
}

export async function listApiKeys(ctx: Ctx): Promise<ApiKeyRow[]> {
  requireRole(ctx, "admin");
  return ctx.db.query<ApiKeyRow>(
    `SELECT k.id, k.name, k.prefix, k.scopes, k.created_at, k.last_used_at, k.revoked_at, coalesce(u.name, '') AS created_by_name
     FROM api_keys k LEFT JOIN users u ON u.id=k.created_by WHERE k.org_id=$1 ORDER BY k.revoked_at IS NOT NULL, k.created_at DESC`,
    [ctx.orgId],
  );
}

export async function revokeApiKey(ctx: Ctx, id: string) {
  requireRole(ctx, "admin");
  if (!isUuid(id)) throw notFound("Clé introuvable");
  const r = await ctx.db.query("UPDATE api_keys SET revoked_at=now() WHERE id=$1 AND org_id=$2 AND revoked_at IS NULL RETURNING id", [id, ctx.orgId]);
  if (!r.length) throw notFound("Clé introuvable");
  // Les abonnements créés par les outils d'automatisation avec cette clé disparaissent avec elle.
  await ctx.db.query("DELETE FROM webhook_endpoints WHERE api_key_id=$1 AND org_id=$2", [id, ctx.orgId]);
  await audit(ctx.db, { orgId: ctx.orgId, userId: ctx.userId, action: "api_key.revoke", data: { id }, ip: ctx.ip });
}

/** Clé lue dans « Authorization: Bearer ... » ou « X-Api-Key ». */
export function keyFromHeaders(h: Headers): string {
  const auth = h.get("authorization") ?? "";
  const m = /^Bearer\s+(\S+)$/i.exec(auth.trim());
  return (m?.[1] ?? h.get("x-api-key") ?? "").trim();
}

/**
 * Contexte d'une requête de l'API publique. Refuse une clé inconnue, révoquée, dont l'auteur
 * n'est plus administrateur, ou dont l'entreprise n'a pas l'API ouverte.
 */
export async function authenticateApiKey(db: Database, key: string, meta: RequestMeta): Promise<Ctx> {
  if (!key.startsWith(KEY_PREFIX) || key.length > 200) throw unauthorized("Clé d'API manquante ou invalide");
  const k = await one<{ id: string; org_id: string; created_by: string; scopes: string[]; revoked_at: Date | null; last_used_at: Date | null }>(
    db,
    "SELECT id, org_id, created_by, scopes, revoked_at, last_used_at FROM api_keys WHERE key_hash=$1",
    [sha256(key)],
  );
  if (!k || k.revoked_at) throw unauthorized("Clé d'API manquante ou invalide");
  await hitRate(db, "api.key", k.id);
  const user = await one<{ status: string }>(db, "SELECT status FROM users WHERE id=$1", [k.created_by]);
  const base = user && user.status === "active" ? await buildContext(db, k.created_by, k.org_id, null, meta) : null;
  if (!base || base.orgId !== k.org_id || base.role === "member")
    throw unauthorized("Clé d'API inactive : son auteur n'administre plus l'entreprise");
  const ctx: Ctx = { ...base, apiKey: { id: k.id, scopes: k.scopes } };
  if (!(await hasFeature(ctx, "api_publique"))) throw forbidden("L'API publique n'est pas ouverte pour cette entreprise");
  // Date de dernière utilisation, mise à jour au plus une fois par minute.
  if (!k.last_used_at || Date.now() - new Date(k.last_used_at).getTime() > 60_000) {
    await db.query("UPDATE api_keys SET last_used_at=now() WHERE id=$1", [k.id]);
  }
  return ctx;
}

export function requireScope(ctx: Ctx, scope: ApiScope) {
  if (ctx.apiKey && !ctx.apiKey.scopes.includes(scope)) throw forbidden("Cette clé d'API est en lecture seule");
}
