/**
 * Congés et absences de l'équipe, reliés au planning : une affectation sur un jour d'absence est
 * signalée comme un conflit, au même titre que deux chantiers le même jour.
 */

import { z } from "zod";
import { one } from "@/lib/db";
import { badRequest, notFound } from "@/lib/http";
import type { Ctx } from "./context";
import { can, requireWritable } from "./context";
import { daysBetween } from "./planning-dates";

export const ABSENCE_KINDS = {
  conges: "Congés",
  rtt: "Repos",
  maladie: "Arrêt maladie",
  formation: "Formation",
  autre: "Autre absence",
} as const;
export type AbsenceKind = keyof typeof ABSENCE_KINDS;

export interface Absence {
  id: string;
  userId: string;
  userName: string;
  kind: AbsenceKind;
  start: string;
  end: string;
  note: string;
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const schema = z.object({
  userId: z.string().uuid("Personne invalide"),
  kind: z.enum(Object.keys(ABSENCE_KINDS) as [AbsenceKind, ...AbsenceKind[]], { message: "Type d'absence invalide" }),
  start: z.string().regex(DATE, "Date de début invalide"),
  end: z.string().regex(DATE, "Date de fin invalide"),
  note: z.string().trim().max(200, "Commentaire trop long").default(""),
});

/** Chacun déclare ses propres absences ; celles des autres demandent le droit de gérer l'équipe. */
function requireFor(ctx: Ctx, userId: string) {
  if (userId !== ctx.userId && !can(ctx, "staff")) throw badRequest("Seule une personne qui gère l'équipe peut saisir l'absence d'un autre membre");
}

export async function addAbsence(ctx: Ctx, raw: unknown) {
  requireWritable(ctx);
  const p = schema.safeParse(raw);
  if (!p.success) throw badRequest(p.error.issues[0].message);
  const d = p.data;
  if (d.end < d.start) throw badRequest("La fin précède le début");
  if (daysBetween(d.start, d.end) > 366) throw badRequest("Une absence dure un an au plus");
  requireFor(ctx, d.userId);
  if (!(await one(ctx.db, "SELECT 1 FROM memberships WHERE org_id=$1 AND user_id=$2", [ctx.orgId, d.userId])))
    throw notFound("Personne introuvable dans l'équipe");
  const r = await one<{ id: string }>(
    ctx.db,
    "INSERT INTO member_absences (org_id, user_id, kind, start_date, end_date, note, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id",
    [ctx.orgId, d.userId, d.kind, d.start, d.end, d.note, ctx.userId],
  );
  return r!.id;
}

export async function deleteAbsence(ctx: Ctx, id: string) {
  requireWritable(ctx);
  const a = await one<{ user_id: string }>(ctx.db, "SELECT user_id FROM member_absences WHERE id=$1 AND org_id=$2", [id, ctx.orgId]);
  if (!a) throw notFound("Absence introuvable");
  requireFor(ctx, a.user_id);
  await ctx.db.query("DELETE FROM member_absences WHERE id=$1 AND org_id=$2", [id, ctx.orgId]);
}

const iso = (v: unknown) => (v instanceof Date ? v.toISOString().slice(0, 10) : String(v).slice(0, 10));

/** Absences qui touchent la période. */
export async function listAbsences(ctx: Pick<Ctx, "db" | "orgId">, from: string, to: string): Promise<Absence[]> {
  if (!DATE.test(from) || !DATE.test(to)) throw badRequest("Période invalide");
  const rows = await ctx.db.query<Record<string, unknown>>(
    `SELECT a.id, a.user_id, a.kind, a.start_date, a.end_date, a.note, coalesce(nullif(u.name, ''), u.email) AS user_name
     FROM member_absences a JOIN users u ON u.id=a.user_id
     WHERE a.org_id=$1 AND a.start_date <= $3 AND a.end_date >= $2 ORDER BY a.start_date, user_name`,
    [ctx.orgId, from, to],
  );
  return rows.map((r) => ({
    id: String(r.id),
    userId: String(r.user_id),
    userName: String(r.user_name),
    kind: r.kind as AbsenceKind,
    start: iso(r.start_date),
    end: iso(r.end_date),
    note: String(r.note ?? ""),
  }));
}

/** Absence de la personne qui recouvre la période, ou null. */
export function absenceDuring(absences: readonly Absence[], userId: string, start: string, end: string): Absence | null {
  return absences.find((a) => a.userId === userId && a.start <= end && a.end >= start) ?? null;
}
