/** Habilitations et formations de l'équipe : saisie, suivi des échéances et rappel avant expiration. */

import { z } from "zod";
import { one, type Database } from "@/lib/db";
import { badRequest, notFound } from "@/lib/http";
import { CERT_REMINDER_DAYS, certStatus, daysUntil, type CertStatus } from "@/lib/certifications";
import type { Ctx } from "./context";
import { audit, can, requireWritable } from "./context";
import { notifyOrg } from "./push";
import { parisDate } from "./quotes";

export interface Certification {
  id: string;
  userId: string;
  userName: string;
  name: string;
  obtainedOn: string | null;
  validUntil: string | null;
  note: string;
  status: CertStatus;
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const optDate = z
  .string()
  .trim()
  .refine((v) => v === "" || DATE.test(v), "Date invalide")
  .default("");
const schema = z.object({
  userId: z.string().uuid("Personne invalide"),
  name: z.string().trim().min(2, "Intitulé de l'habilitation requis").max(120, "Intitulé trop long"),
  obtainedOn: optDate,
  validUntil: optDate,
  note: z.string().trim().max(200, "Commentaire trop long").default(""),
});

function requireFor(ctx: Ctx, userId: string) {
  if (userId !== ctx.userId && !can(ctx, "staff")) throw badRequest("Seule une personne qui gère l'équipe peut renseigner les habilitations d'un autre membre");
}

export async function addCertification(ctx: Ctx, raw: unknown) {
  requireWritable(ctx);
  const p = schema.safeParse(raw);
  if (!p.success) throw badRequest(p.error.issues[0].message);
  const d = p.data;
  if (d.obtainedOn && d.validUntil && d.validUntil < d.obtainedOn) throw badRequest("L'échéance précède la date d'obtention");
  requireFor(ctx, d.userId);
  if (!(await one(ctx.db, "SELECT 1 FROM memberships WHERE org_id=$1 AND user_id=$2", [ctx.orgId, d.userId])))
    throw notFound("Personne introuvable dans l'équipe");
  const r = await one<{ id: string }>(
    ctx.db,
    "INSERT INTO member_certifications (org_id, user_id, name, obtained_on, valid_until, note) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id",
    [ctx.orgId, d.userId, d.name, d.obtainedOn || null, d.validUntil || null, d.note],
  );
  await audit(ctx.db, { orgId: ctx.orgId, userId: ctx.userId, action: "team.certification_added", target: r!.id, ip: ctx.ip });
  return r!.id;
}

export async function deleteCertification(ctx: Ctx, id: string) {
  requireWritable(ctx);
  const c = await one<{ user_id: string }>(ctx.db, "SELECT user_id FROM member_certifications WHERE id=$1 AND org_id=$2", [id, ctx.orgId]);
  if (!c) throw notFound("Habilitation introuvable");
  requireFor(ctx, c.user_id);
  await ctx.db.query("DELETE FROM member_certifications WHERE id=$1 AND org_id=$2", [id, ctx.orgId]);
}

const iso = (v: unknown) => (v ? (v instanceof Date ? v.toISOString() : String(v)).slice(0, 10) : null);

/** Habilitations de l'équipe, les échéances les plus proches d'abord. */
export async function listCertifications(ctx: Ctx, now = new Date()): Promise<Certification[]> {
  const today = parisDate(now);
  const rows = await ctx.db.query<Record<string, unknown>>(
    `SELECT c.id, c.user_id, c.name, c.obtained_on, c.valid_until, c.note, coalesce(nullif(u.name, ''), u.email) AS user_name
     FROM member_certifications c JOIN users u ON u.id=c.user_id JOIN memberships m ON m.user_id=c.user_id AND m.org_id=c.org_id
     WHERE c.org_id=$1 ORDER BY c.valid_until NULLS LAST, user_name, c.name`,
    [ctx.orgId],
  );
  return rows.map((r) => {
    const validUntil = iso(r.valid_until);
    return {
      id: String(r.id),
      userId: String(r.user_id),
      userName: String(r.user_name),
      name: String(r.name),
      obtainedOn: iso(r.obtained_on),
      validUntil,
      note: String(r.note ?? ""),
      status: certStatus(validUntil, today),
    };
  });
}

/** Notification un mois avant l'échéance, une seule fois par habilitation. */
export async function runCertificationReminders(db: Database, now = new Date()) {
  const today = parisDate(now);
  const limit = new Date(now.getTime() + CERT_REMINDER_DAYS * 86400000).toISOString().slice(0, 10);
  const rows = await db.query<{ id: string; org_id: string; name: string; valid_until: unknown; user_name: string }>(
    `SELECT c.id, c.org_id, c.name, c.valid_until, coalesce(nullif(u.name, ''), u.email) AS user_name
     FROM member_certifications c JOIN users u ON u.id=c.user_id JOIN organizations o ON o.id=c.org_id
     WHERE c.reminded_at IS NULL AND c.valid_until IS NOT NULL AND c.valid_until >= $1 AND c.valid_until <= $2 AND o.status='active' LIMIT 1000`,
    [today, limit],
  );
  for (const r of rows) {
    const end = iso(r.valid_until)!;
    await notifyOrg(db, r.org_id, {
      title: "Habilitation à renouveler",
      body: `${r.user_name} : ${r.name} expire le ${end.split("-").reverse().join("/")} (dans ${daysUntil(today, end)} jours).`,
      url: "/app/equipe",
    });
    await db.query("UPDATE member_certifications SET reminded_at=now() WHERE id=$1", [r.id]);
  }
  return { sent: rows.length };
}
