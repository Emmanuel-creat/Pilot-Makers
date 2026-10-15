/**
 * Agences : la même application sert l'artisan seul et l'entreprise à plusieurs établissements. Sans agence, rien
 * ne change ; dès qu'une agence existe, membres et devis s'y rattachent et l'activité se compare d'une agence à l'autre.
 */

import { z } from "zod";
import { one } from "@/lib/db";
import { badRequest, conflict, isUuid, notFound } from "@/lib/http";
import { audit, can, requirePermission, requireWritable, type Ctx } from "./context";

export interface Agency {
  id: string;
  name: string;
  city: string;
  siret: string;
  members: number;
}

export async function listAgencies(ctx: Ctx): Promise<Agency[]> {
  const rows = await ctx.db.query<{ id: string; name: string; city: string; siret: string; members: unknown }>(
    `SELECT a.id, a.name, a.city, a.siret, (SELECT count(*) FROM memberships m WHERE m.agency_id=a.id) AS members
     FROM agencies a WHERE a.org_id=$1 ORDER BY lower(a.name)`,
    [ctx.orgId],
  );
  return rows.map((r) => ({ ...r, members: Number(r.members) }));
}

const schema = z.object({
  name: z.string().trim().min(2, "Nom de l'agence trop court").max(80),
  city: z.string().trim().max(80).default(""),
  siret: z
    .string()
    .transform((v) => v.replace(/\s/g, ""))
    .refine((v) => v === "" || /^\d{14}$/.test(v), "Le SIRET de l'établissement compte 14 chiffres"),
});

export async function createAgency(ctx: Ctx, raw: unknown) {
  requirePermission(ctx, "settings");
  requireWritable(ctx);
  const p = schema.safeParse(raw);
  if (!p.success) throw badRequest(p.error.issues[0].message);
  if (await one(ctx.db, "SELECT 1 FROM agencies WHERE org_id=$1 AND lower(name)=lower($2)", [ctx.orgId, p.data.name]))
    throw conflict("Une agence porte déjà ce nom");
  const r = await one<{ id: string }>(ctx.db, "INSERT INTO agencies (org_id, name, city, siret) VALUES ($1,$2,$3,$4) RETURNING id", [
    ctx.orgId,
    p.data.name,
    p.data.city,
    p.data.siret,
  ]);
  await audit(ctx.db, { orgId: ctx.orgId, userId: ctx.userId, action: "agency.create", target: r!.id, ip: ctx.ip });
  return r!.id;
}

/** Supprime l'agence : ses membres et ses devis restent, sans agence. */
export async function deleteAgency(ctx: Ctx, id: string) {
  requirePermission(ctx, "settings");
  requireWritable(ctx);
  const r = isUuid(id) ? await ctx.db.query("DELETE FROM agencies WHERE id=$1 AND org_id=$2 RETURNING id", [id, ctx.orgId]) : [];
  if (!r.length) throw notFound("Agence introuvable");
  await audit(ctx.db, { orgId: ctx.orgId, userId: ctx.userId, action: "agency.delete", target: id, ip: ctx.ip });
}

async function agencyOf(ctx: Ctx, agencyId: string | null) {
  if (!agencyId) return null;
  if (!isUuid(agencyId) || !(await one(ctx.db, "SELECT 1 FROM agencies WHERE id=$1 AND org_id=$2", [agencyId, ctx.orgId])))
    throw notFound("Agence introuvable");
  return agencyId;
}

/** Rattache un membre à une agence ; ses prochains devis seront de cette agence. */
export async function assignMemberAgency(ctx: Ctx, userId: string, agencyId: string | null) {
  requirePermission(ctx, "settings");
  requireWritable(ctx);
  const a = await agencyOf(ctx, agencyId);
  const r = isUuid(userId) ? await ctx.db.query("UPDATE memberships SET agency_id=$3 WHERE user_id=$1 AND org_id=$2 RETURNING id", [userId, ctx.orgId, a]) : [];
  if (!r.length) throw notFound("Membre introuvable");
}

/** Change l'agence d'un devis (par exemple un devis préparé par le siège pour une agence). */
export async function setQuoteAgency(ctx: Ctx, quoteId: string, agencyId: string | null) {
  requireWritable(ctx);
  const a = await agencyOf(ctx, agencyId);
  const r = isUuid(quoteId) ? await ctx.db.query("UPDATE quotes SET agency_id=$3 WHERE id=$1 AND org_id=$2 RETURNING id", [quoteId, ctx.orgId, a]) : [];
  if (!r.length) throw notFound("Devis introuvable");
}

export interface AgencyActivity {
  id: string | null;
  name: string;
  members: number;
  issued: number;
  accepted: number;
  /** Taux de transformation des devis émis, en pour cent ; null sans devis émis */
  rate: number | null;
  /** Montant HT des devis acceptés ; null sans le droit de voir la facturation */
  acceptedHtCents: number | null;
}

/** Activité des douze derniers mois, agence par agence, plus les devis sans agence */
export async function agencyActivity(ctx: Ctx, now = new Date()): Promise<AgencyActivity[]> {
  const billing = can(ctx, "billing");
  const rows = await ctx.db.query<{ agency_id: string | null; issued: unknown; accepted: unknown; accepted_ht: unknown }>(
    `SELECT agency_id, count(*) AS issued, count(*) FILTER (WHERE accepted_version IS NOT NULL) AS accepted,
            coalesce(sum(total_ht_cents) FILTER (WHERE accepted_version IS NOT NULL), 0) AS accepted_ht
     FROM quotes WHERE org_id=$1 AND issued_at IS NOT NULL AND amends_quote_id IS NULL AND issued_at > $2::timestamptz - interval '365 days'
     GROUP BY agency_id`,
    [ctx.orgId, now.toISOString()],
  );
  const agencies = await listAgencies(ctx);
  const unassigned = Number(
    (await one<{ n: unknown }>(ctx.db, "SELECT count(*) AS n FROM memberships WHERE org_id=$1 AND agency_id IS NULL", [ctx.orgId]))?.n ?? 0,
  );
  const line = (id: string | null, name: string, members: number): AgencyActivity => {
    const r = rows.find((x) => x.agency_id === id);
    const issued = Number(r?.issued ?? 0);
    const accepted = Number(r?.accepted ?? 0);
    return {
      id,
      name,
      members,
      issued,
      accepted,
      rate: issued ? Math.round((accepted / issued) * 100) : null,
      acceptedHtCents: billing ? Number(r?.accepted_ht ?? 0) : null,
    };
  };
  const out = agencies.map((a) => line(a.id, a.name, a.members));
  const none = line(null, "Sans agence", unassigned);
  if (none.issued || none.members) out.push(none);
  return out;
}
