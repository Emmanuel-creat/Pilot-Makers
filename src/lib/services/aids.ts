/**
 * Aides à la rénovation énergétique (MaPrimeRénov', certificats d'économies d'énergie, éco-prêt à taux zéro).
 *
 * L'entreprise enregistre ses qualifications RGE (organisme, numéro, domaines, fin de validité). Sur un devis,
 * elle indique les dispositifs visés et les domaines de travaux : l'émission est bloquée si aucune qualification
 * valide ne couvre un domaine, et le devis porte les mentions utiles au dossier du client.
 *
 * Les règles des dispositifs changent souvent : ces contrôles aident l'artisan mais doivent être validés et
 * tenus à jour par un professionnel compétent. Les montants d'aide restent des estimations.
 */

import { z } from "zod";
import type { Queryable } from "@/lib/db";
import { one } from "@/lib/db";
import { badRequest, isUuid, notFound } from "@/lib/http";
import { AID_PROGRAMS, RGE_DOMAINS, type AidProgram, type RgeDomain, type RgeQualification } from "./aid-rules";
import type { Ctx } from "./context";
import { audit, requirePermission, requireWritable } from "./context";

export * from "./aid-rules";

const programKeys = Object.keys(AID_PROGRAMS) as [AidProgram, ...AidProgram[]];
const domainKeys = Object.keys(RGE_DOMAINS) as [RgeDomain, ...RgeDomain[]];
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date invalide");

export const energyAidSchema = z
  .object({
    programs: z.array(z.enum(programKeys)).max(3).default([]),
    domains: z.array(z.enum(domainKeys)).max(12).default([]),
    visitDate: z.union([isoDate, z.literal("")]).default(""),
    estimatedAid: z.string().trim().max(14).default(""),
  })
  .nullable()
  .optional()
  .default(null);

/* ------------------------------------------------------------------ */
/* Qualifications RGE                                                  */
/* ------------------------------------------------------------------ */

const qualificationSchema = z.object({
  body: z.string().trim().min(2, "Organisme requis").max(60),
  number: z.string().trim().min(2, "Numéro de qualification requis").max(60),
  domains: z.array(z.enum(domainKeys)).min(1, "Cochez au moins un domaine"),
  valid_until: isoDate,
});

function mapRow(r: Record<string, unknown>): RgeQualification {
  return {
    id: String(r.id),
    body: String(r.body),
    number: String(r.number),
    domains: (Array.isArray(r.domains) ? r.domains : []) as RgeDomain[],
    valid_until: r.valid_until instanceof Date ? r.valid_until.toISOString().slice(0, 10) : String(r.valid_until).slice(0, 10),
  };
}

export async function rgeQualifications(db: Queryable, orgId: string): Promise<RgeQualification[]> {
  const rows = await db.query<Record<string, unknown>>(
    "SELECT id, body, number, domains, valid_until FROM rge_qualifications WHERE org_id=$1 ORDER BY valid_until DESC, created_at",
    [orgId],
  );
  return rows.map(mapRow);
}

export async function listRge(ctx: Ctx) {
  return rgeQualifications(ctx.db, ctx.orgId);
}

export async function addRge(ctx: Ctx, raw: unknown) {
  requirePermission(ctx, "settings");
  requireWritable(ctx);
  const p = qualificationSchema.safeParse(raw);
  if (!p.success) throw badRequest(p.error.issues[0].message, p.error.issues);
  const r = await one<{ id: string }>(
    ctx.db,
    "INSERT INTO rge_qualifications (org_id, body, number, domains, valid_until) VALUES ($1,$2,$3,$4,$5) RETURNING id",
    [ctx.orgId, p.data.body, p.data.number, JSON.stringify([...new Set(p.data.domains)]), p.data.valid_until],
  );
  await audit(ctx.db, {
    orgId: ctx.orgId,
    userId: ctx.userId,
    action: "org.rge_add",
    target: r!.id,
    data: { body: p.data.body, number: p.data.number },
    ip: ctx.ip,
  });
  return r!.id;
}

export async function removeRge(ctx: Ctx, id: string) {
  requirePermission(ctx, "settings");
  requireWritable(ctx);
  if (!isUuid(id)) throw notFound("Qualification introuvable");
  const r = await one<{ id: string }>(ctx.db, "DELETE FROM rge_qualifications WHERE id=$1 AND org_id=$2 RETURNING id", [id, ctx.orgId]);
  if (!r) throw notFound("Qualification introuvable");
  await audit(ctx.db, { orgId: ctx.orgId, userId: ctx.userId, action: "org.rge_remove", target: id, ip: ctx.ip });
}
