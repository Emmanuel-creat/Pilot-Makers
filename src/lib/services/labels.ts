/** Labels de l'entreprise : saisie, et liste publique avec les qualifications RGE valides. */

import { z } from "zod";
import { one, type Queryable } from "@/lib/db";
import { badRequest, notFound } from "@/lib/http";
import { LABEL_KIND_CODES, publicLabels, type OrgLabel, type PublicLabel } from "@/lib/labels";
import { RGE_DOMAINS } from "./aid-rules";
import { rgeQualifications } from "./aids";
import type { Ctx } from "./context";
import { audit, requirePermission, requireWritable } from "./context";

const labelSchema = z
  .object({
    kind: z.enum(LABEL_KIND_CODES, { message: "Label inconnu" }),
    name: z.string().trim().max(80, "Nom trop long").default(""),
    number: z.string().trim().max(60, "Numéro trop long").default(""),
    validUntil: z
      .string()
      .trim()
      .regex(/^(\d{4}-\d{2}-\d{2})?$/, "Date invalide")
      .default(""),
  })
  .refine((l) => l.kind !== "autre" || l.name, { message: "Indiquez le nom du label", path: ["name"] });

const dateOf = (v: unknown) => (v ? (v instanceof Date ? v.toISOString() : String(v)).slice(0, 10) : null);

function mapRow(r: Record<string, unknown>): OrgLabel {
  return {
    id: String(r.id),
    kind: r.kind as OrgLabel["kind"],
    name: String(r.name ?? ""),
    number: String(r.number ?? ""),
    validUntil: dateOf(r.valid_until),
    shown: Boolean(r.shown),
  };
}

async function labelsOf(db: Queryable, orgId: string): Promise<OrgLabel[]> {
  const rows = await db.query<Record<string, unknown>>("SELECT * FROM org_labels WHERE org_id=$1 ORDER BY created_at", [orgId]);
  return rows.map(mapRow);
}

export async function listLabels(ctx: Ctx): Promise<OrgLabel[]> {
  return labelsOf(ctx.db, ctx.orgId);
}

export async function addLabel(ctx: Ctx, raw: unknown): Promise<string> {
  requirePermission(ctx, "settings");
  requireWritable(ctx);
  const p = labelSchema.safeParse(raw);
  if (!p.success) throw badRequest(p.error.issues[0].message);
  const count = await one<{ n: unknown }>(ctx.db, "SELECT count(*) AS n FROM org_labels WHERE org_id=$1", [ctx.orgId]);
  if (Number(count?.n ?? 0) >= 20) throw badRequest("Vingt labels au plus");
  const r = await one<{ id: string }>(ctx.db, "INSERT INTO org_labels (org_id, kind, name, number, valid_until) VALUES ($1,$2,$3,$4,$5) RETURNING id", [
    ctx.orgId,
    p.data.kind,
    p.data.name,
    p.data.number,
    p.data.validUntil || null,
  ]);
  await audit(ctx.db, { orgId: ctx.orgId, userId: ctx.userId, action: "organization.label_add", target: r!.id, data: p.data, ip: ctx.ip });
  return r!.id;
}

export async function setLabelShown(ctx: Ctx, id: string, shown: boolean) {
  requirePermission(ctx, "settings");
  requireWritable(ctx);
  const r = await ctx.db.query("UPDATE org_labels SET shown=$3 WHERE id=$1 AND org_id=$2 RETURNING id", [id, ctx.orgId, shown]);
  if (!r.length) throw notFound("Label introuvable");
}

export async function deleteLabel(ctx: Ctx, id: string) {
  requirePermission(ctx, "settings");
  requireWritable(ctx);
  const r = await ctx.db.query("DELETE FROM org_labels WHERE id=$1 AND org_id=$2 RETURNING id", [id, ctx.orgId]);
  if (!r.length) throw notFound("Label introuvable");
  await audit(ctx.db, { orgId: ctx.orgId, userId: ctx.userId, action: "organization.label_remove", target: id, ip: ctx.ip });
}

/** Labels montrés aux clients d'une entreprise (vitrine, devis en ligne). */
export async function orgPublicLabels(db: Queryable, orgId: string, today: string): Promise<PublicLabel[]> {
  const [rge, labels] = await Promise.all([rgeQualifications(db, orgId), labelsOf(db, orgId)]);
  return publicLabels(
    rge.map((q) => ({ ...q, domains: q.domains.map((d) => RGE_DOMAINS[d]) })),
    labels,
    today,
  );
}
