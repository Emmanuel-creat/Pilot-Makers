import { one } from "@/lib/db";
import { badRequest, forbidden, notFound } from "@/lib/http";
import { featureEnabled, isFeatureKey, type FeatureKey } from "@/lib/features";
import type { Ctx } from "./context";
import { audit } from "./context";
import { requirePlatformAdmin } from "./admin";

export async function orgFeatureFlags(ctx: Ctx) {
  const r = await one<{ id: string; feature_flags: unknown }>(ctx.db, "SELECT id, feature_flags FROM organizations WHERE id=$1", [ctx.orgId]);
  if (!r) throw notFound();
  return r;
}

export async function hasFeature(ctx: Ctx, key: FeatureKey) {
  return featureEnabled(await orgFeatureFlags(ctx), key);
}

export async function requireFeature(ctx: Ctx, key: FeatureKey) {
  if (!(await hasFeature(ctx, key))) throw forbidden("Cette fonctionnalité n'est pas encore ouverte pour votre entreprise");
}

/** Administration de la plateforme : force une fonctionnalité pour une entreprise, ou la remet en déploiement automatique. */
export async function setOrgFeature(ctx: Ctx, orgId: string, key: string, value: string) {
  requirePlatformAdmin(ctx);
  if (!isFeatureKey(key)) throw badRequest("Fonctionnalité inconnue");
  if (!["on", "off", "auto"].includes(value)) throw badRequest("Réglage inconnu");
  const sql =
    value === "auto"
      ? "UPDATE organizations SET feature_flags = feature_flags - $2 WHERE id=$1 RETURNING id"
      : "UPDATE organizations SET feature_flags = feature_flags || jsonb_build_object($2::text, $3::text) WHERE id=$1 RETURNING id";
  const r = await ctx.db.query<{ id: string }>(sql, value === "auto" ? [orgId, key] : [orgId, key, value]);
  if (!r.length) throw notFound("Entreprise introuvable");
  await audit(ctx.db, { orgId, userId: ctx.userId, action: "admin.feature", target: key, data: { value }, ip: ctx.ip });
}
