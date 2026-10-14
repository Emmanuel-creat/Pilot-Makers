/**
 * Parrainage entre clients : lien personnel du client parrain vers la page vitrine, demandes recommandées
 * suivies jusqu'au devis signé, puis récompense remise.
 */

import { z } from "zod";
import { one, type Queryable } from "@/lib/db";
import { badRequest, conflict, isUuid, notFound } from "@/lib/http";
import { makeReferralCode, normalizeCode, readReferralSettings, referralState, type ReferralState } from "@/lib/referral";
import type { Ctx } from "./context";
import { audit, requireWritable } from "./context";

export async function getReferralSettings(ctx: Ctx) {
  const r = await one<{ referral: unknown }>(ctx.db, "SELECT referral FROM organizations WHERE id=$1", [ctx.orgId]);
  return readReferralSettings(r?.referral);
}

const settingsSchema = z.object({
  enabled: z.boolean(),
  referrerReward: z.string().trim().min(3, "Indiquez la récompense du parrain").max(200),
  refereeReward: z.string().trim().max(200).default(""),
});

export async function saveReferralSettings(ctx: Ctx, raw: unknown) {
  requireWritable(ctx);
  const p = settingsSchema.safeParse(raw);
  if (!p.success) throw badRequest(p.error.issues[0].message);
  await ctx.db.query("UPDATE organizations SET referral=$2 WHERE id=$1", [ctx.orgId, JSON.stringify(p.data)]);
  await audit(ctx.db, { orgId: ctx.orgId, userId: ctx.userId, action: "referral.settings", data: { enabled: p.data.enabled }, ip: ctx.ip });
  return p.data;
}

/** Code de parrainage du client, créé au premier besoin. */
export async function ensureReferralCode(ctx: Ctx, customerId: string) {
  requireWritable(ctx);
  if (!isUuid(customerId)) throw notFound("Client introuvable");
  const c = await one<{ name: string; referral_code: string | null }>(
    ctx.db,
    "SELECT coalesce(nullif(company_name, ''), nullif(last_name, ''), first_name) AS name, referral_code FROM customers WHERE id=$1 AND org_id=$2",
    [customerId, ctx.orgId],
  );
  if (!c) throw notFound("Client introuvable");
  if (c.referral_code) return c.referral_code;
  for (let i = 0; i < 5; i++) {
    const code = makeReferralCode(c.name ?? "");
    const r = await ctx.db.query(
      `UPDATE customers SET referral_code=$3 WHERE id=$1 AND org_id=$2 AND referral_code IS NULL
         AND NOT EXISTS (SELECT 1 FROM customers WHERE org_id=$2 AND referral_code=$3) RETURNING id`,
      [customerId, ctx.orgId, code],
    );
    if (r.length) return code;
  }
  throw conflict("Code de parrainage indisponible, réessayez");
}

export interface Referral {
  leadId: string;
  name: string;
  city: string;
  createdAt: string;
  referrerId: string;
  referrerName: string;
  quoteId: string | null;
  quoteNumber: string | null;
  state: ReferralState;
}

async function referrals(ctx: Ctx, where: string, params: unknown[]): Promise<Referral[]> {
  const rows = await ctx.db.query<Record<string, unknown>>(
    `SELECT l.id, l.name, l.city, l.created_at, l.status, l.referral_rewarded_at, l.referrer_id, l.quote_id,
       q.number AS quote_number, q.status AS quote_status,
       coalesce(nullif(c.company_name, ''), trim(c.first_name || ' ' || c.last_name)) AS referrer_name
     FROM leads l JOIN customers c ON c.id=l.referrer_id LEFT JOIN quotes q ON q.id=l.quote_id
     WHERE l.org_id=$1 AND ${where} ORDER BY l.created_at DESC`,
    [ctx.orgId, ...params],
  );
  return rows.map((r) => ({
    leadId: String(r.id),
    name: String(r.name),
    city: String(r.city),
    createdAt: (r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at)).slice(0, 10),
    referrerId: String(r.referrer_id),
    referrerName: String(r.referrer_name ?? ""),
    quoteId: (r.quote_id as string | null) ?? null,
    quoteNumber: (r.quote_number as string | null) ?? null,
    state: referralState({ leadStatus: String(r.status), quoteStatus: (r.quote_status as string | null) ?? null, rewardedAt: r.referral_rewarded_at }),
  }));
}

export const customerReferrals = (ctx: Ctx, customerId: string) =>
  isUuid(customerId) ? referrals(ctx, "l.referrer_id=$2", [customerId]) : Promise.resolve([]);

export async function listReferrals(ctx: Ctx) {
  const list = await referrals(ctx, "l.referrer_id IS NOT NULL", []);
  const count = (s: ReferralState) => list.filter((r) => r.state === s).length;
  return { list, toReward: count("gagne"), won: count("gagne") + count("recompense"), total: list.length };
}

/** Récompense remise au parrain : seulement une fois le devis du filleul signé. */
export async function markReferralRewarded(ctx: Ctx, leadId: string) {
  requireWritable(ctx);
  if (!isUuid(leadId)) throw notFound("Recommandation introuvable");
  const [r] = await referrals(ctx, "l.id=$2", [leadId]);
  if (!r) throw notFound("Recommandation introuvable");
  if (r.state === "recompense") throw conflict("Récompense déjà remise");
  if (r.state !== "gagne") throw conflict("La récompense se remet une fois le devis du filleul signé");
  await ctx.db.query("UPDATE leads SET referral_rewarded_at=now() WHERE id=$1 AND org_id=$2", [leadId, ctx.orgId]);
  await audit(ctx.db, { orgId: ctx.orgId, userId: ctx.userId, action: "referral.reward", target: leadId, ip: ctx.ip });
  return r;
}

/** Parrain d'une demande publique : client de l'entreprise dont le code est valide, programme actif. */
export async function referrerForCode(db: Queryable, orgId: string, code: string) {
  const c = normalizeCode(code);
  if (!c) return null;
  const org = await one<{ referral: unknown }>(db, "SELECT referral FROM organizations WHERE id=$1", [orgId]);
  const settings = readReferralSettings(org?.referral);
  if (!settings.enabled) return null;
  const r = await one<{ id: string }>(db, "SELECT id FROM customers WHERE org_id=$1 AND referral_code=$2 AND archived_at IS NULL", [orgId, c]);
  return r ? { customerId: r.id, settings } : null;
}

/** Offre affichée au visiteur arrivé par un lien de parrainage valide, ou null. */
export async function referralOffer(db: Queryable, slug: string, code: string | undefined) {
  if (!code) return null;
  const s = await one<{ org_id: string }>(db, "SELECT org_id FROM showcases WHERE slug=$1 AND enabled", [slug]);
  if (!s) return null;
  const r = await referrerForCode(db, s.org_id, code);
  return r ? { code: normalizeCode(code), refereeReward: r.settings.refereeReward } : null;
}
