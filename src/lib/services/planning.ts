/**
 * Planning de l'entreprise : chaque personne et chaque véhicule est affecté à un chantier sur une période.
 * Un chevauchement (même ressource, deux chantiers, mêmes jours) est signalé sans être bloqué :
 * l'artisan reste maître de son organisation, mais le voit en rouge.
 */

import { z } from "zod";
import { one, type Queryable } from "@/lib/db";
import { badRequest, notFound } from "@/lib/http";
import type { Ctx } from "./context";
import { requireWritable } from "./context";
import { addDays, daysBetween, findConflicts, type Slot } from "./planning-dates";
import { ABSENCE_KINDS, absenceDuring, listAbsences } from "./absences";

export interface Resource {
  type: "user" | "vehicle";
  id: string;
  name: string;
  detail: string;
}

export async function listResources(ctx: Ctx): Promise<Resource[]> {
  const [members, vehicles] = await Promise.all([
    ctx.db.query<{ id: string; name: string; email: string }>(
      "SELECT u.id, u.name, u.email FROM memberships m JOIN users u ON u.id=m.user_id WHERE m.org_id=$1 ORDER BY u.name",
      [ctx.orgId],
    ),
    ctx.db.query<{ id: string; name: string; plate: string }>("SELECT id, name, plate FROM org_vehicles WHERE org_id=$1 ORDER BY name", [ctx.orgId]),
  ]);
  return [
    ...members.map((m) => ({ type: "user" as const, id: m.id, name: m.name || m.email, detail: "Équipe" })),
    ...vehicles.map((v) => ({ type: "vehicle" as const, id: v.id, name: v.name, detail: v.plate || "Véhicule" })),
  ];
}

export async function addVehicle(ctx: Ctx, raw: { name: string; plate?: string }) {
  requireWritable(ctx);
  const name = String(raw.name ?? "").trim();
  if (!name || name.length > 80) throw badRequest("Nom du véhicule requis (80 caractères au plus)");
  const plate = String(raw.plate ?? "")
    .trim()
    .toUpperCase()
    .slice(0, 20);
  const r = await one<{ id: string }>(ctx.db, "INSERT INTO org_vehicles (org_id, name, plate) VALUES ($1,$2,$3) RETURNING id", [ctx.orgId, name, plate]);
  return r!.id;
}

export async function deleteVehicle(ctx: Ctx, id: string) {
  requireWritable(ctx);
  await ctx.db.query("DELETE FROM job_assignments WHERE org_id=$1 AND resource_type='vehicle' AND resource_id=$2", [ctx.orgId, id]);
  const r = await ctx.db.query("DELETE FROM org_vehicles WHERE id=$1 AND org_id=$2 RETURNING id", [id, ctx.orgId]);
  if (!r.length) throw notFound("Véhicule introuvable");
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const assignSchema = z.object({
  jobId: z.string().uuid("Chantier invalide"),
  resourceType: z.enum(["user", "vehicle"]),
  resourceId: z.string().uuid("Ressource invalide"),
  start: z.string().regex(DATE, "Date de début invalide"),
  end: z.string().regex(DATE, "Date de fin invalide"),
});

async function checkResource(q: Queryable, ctx: Ctx, type: "user" | "vehicle", id: string) {
  const ok =
    type === "user"
      ? await one(q, "SELECT 1 FROM memberships WHERE org_id=$1 AND user_id=$2", [ctx.orgId, id])
      : await one(q, "SELECT 1 FROM org_vehicles WHERE org_id=$1 AND id=$2", [ctx.orgId, id]);
  if (!ok) throw notFound(type === "user" ? "Personne introuvable dans l'équipe" : "Véhicule introuvable");
}

/** Dates prévues du chantier : de la première à la dernière affectation. */
async function syncJobDates(q: Queryable, orgId: string, jobId: string) {
  await q.query(
    `UPDATE jobs SET start_date = coalesce((SELECT min(start_date) FROM job_assignments WHERE job_id=$1), start_date),
       end_date = coalesce((SELECT max(end_date) FROM job_assignments WHERE job_id=$1), end_date), updated_at=now()
     WHERE id=$1 AND org_id=$2`,
    [jobId, orgId],
  );
}

async function conflictsFor(q: Queryable, orgId: string, id: string) {
  const r = await q.query<{ title: string }>(
    `SELECT DISTINCT j.title FROM job_assignments a JOIN job_assignments b ON b.org_id=a.org_id AND b.resource_type=a.resource_type
       AND b.resource_id=a.resource_id AND b.id<>a.id AND b.job_id<>a.job_id AND b.start_date<=a.end_date AND b.end_date>=a.start_date
     JOIN jobs j ON j.id=b.job_id WHERE a.id=$1 AND a.org_id=$2`,
    [id, orgId],
  );
  const absent = await q.query<{ kind: keyof typeof ABSENCE_KINDS }>(
    `SELECT m.kind FROM job_assignments a JOIN member_absences m ON m.org_id=a.org_id AND a.resource_type='user' AND m.user_id=a.resource_id
       AND m.start_date<=a.end_date AND m.end_date>=a.start_date WHERE a.id=$1 AND a.org_id=$2 LIMIT 1`,
    [id, orgId],
  );
  return [...r.map((x) => x.title), ...absent.map((x) => `absence (${ABSENCE_KINDS[x.kind].toLowerCase()})`)];
}

export async function assign(ctx: Ctx, raw: unknown) {
  requireWritable(ctx);
  const p = assignSchema.safeParse(raw);
  if (!p.success) throw badRequest(p.error.issues[0].message);
  const d = p.data;
  if (d.end < d.start) throw badRequest("La fin précède le début");
  if (daysBetween(d.start, d.end) > 366) throw badRequest("Une affectation dure un an au plus");
  return ctx.db.transaction(async (tx) => {
    if (!(await one(tx, "SELECT 1 FROM jobs WHERE id=$1 AND org_id=$2", [d.jobId, ctx.orgId]))) throw notFound("Chantier introuvable");
    await checkResource(tx, ctx, d.resourceType, d.resourceId);
    const r = await one<{ id: string }>(
      tx,
      "INSERT INTO job_assignments (org_id, job_id, resource_type, resource_id, start_date, end_date) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id",
      [ctx.orgId, d.jobId, d.resourceType, d.resourceId, d.start, d.end],
    );
    await syncJobDates(tx, ctx.orgId, d.jobId);
    return { id: r!.id, conflicts: await conflictsFor(tx, ctx.orgId, r!.id) };
  });
}

/** Déplacement par glisser-déposer : autre ressource et/ou autre jour, même durée. */
export async function moveAssignment(ctx: Ctx, id: string, raw: { resourceType: string; resourceId: string; start: string }) {
  requireWritable(ctx);
  if (!DATE.test(raw.start)) throw badRequest("Date invalide");
  if (raw.resourceType !== "user" && raw.resourceType !== "vehicle") throw badRequest("Ressource invalide");
  return ctx.db.transaction(async (tx) => {
    const a = await one<{ job_id: string; start_date: unknown; end_date: unknown }>(
      tx,
      "SELECT job_id, start_date, end_date FROM job_assignments WHERE id=$1 AND org_id=$2 FOR UPDATE",
      [id, ctx.orgId],
    );
    if (!a) throw notFound("Affectation introuvable");
    await checkResource(tx, ctx, raw.resourceType as "user" | "vehicle", raw.resourceId);
    const iso = (v: unknown) => (v instanceof Date ? v.toISOString().slice(0, 10) : String(v).slice(0, 10));
    const length = daysBetween(iso(a.start_date), iso(a.end_date));
    await tx.query("UPDATE job_assignments SET resource_type=$3, resource_id=$4, start_date=$5, end_date=$6 WHERE id=$1 AND org_id=$2", [
      id,
      ctx.orgId,
      raw.resourceType,
      raw.resourceId,
      raw.start,
      addDays(raw.start, length),
    ]);
    await syncJobDates(tx, ctx.orgId, a.job_id);
    return { conflicts: await conflictsFor(tx, ctx.orgId, id) };
  });
}

export async function deleteAssignment(ctx: Ctx, id: string) {
  requireWritable(ctx);
  const r = await ctx.db.query<{ job_id: string }>("DELETE FROM job_assignments WHERE id=$1 AND org_id=$2 RETURNING job_id", [id, ctx.orgId]);
  if (!r.length) throw notFound("Affectation introuvable");
}

export interface PlannedSlot extends Slot {
  title: string;
  city: string;
  status: string;
  conflict: boolean;
  /** Type d'absence de la personne pendant l'affectation, ou null */
  absence: string | null;
}

/** Affectations qui touchent la période, avec les conflits repérés. */
export async function planning(ctx: Ctx, from: string, to: string): Promise<PlannedSlot[]> {
  if (!DATE.test(from) || !DATE.test(to) || to < from) throw badRequest("Période invalide");
  const rows = await ctx.db.query<Record<string, unknown>>(
    `SELECT a.id, a.job_id, a.resource_type, a.resource_id, a.start_date, a.end_date, j.title, j.site_city, j.status
     FROM job_assignments a JOIN jobs j ON j.id=a.job_id
     WHERE a.org_id=$1 AND a.start_date <= $3 AND a.end_date >= $2 ORDER BY a.start_date`,
    [ctx.orgId, from, to],
  );
  const iso = (v: unknown) => (v instanceof Date ? v.toISOString().slice(0, 10) : String(v).slice(0, 10));
  const slots: PlannedSlot[] = rows.map((r) => ({
    id: String(r.id),
    jobId: String(r.job_id),
    resourceType: r.resource_type as "user" | "vehicle",
    resourceId: String(r.resource_id),
    start: iso(r.start_date),
    end: iso(r.end_date),
    title: String(r.title),
    city: String(r.site_city ?? ""),
    status: String(r.status),
    conflict: false,
    absence: null,
  }));
  const conflicts = findConflicts(slots);
  const absences = await listAbsences(ctx, from, to);
  return slots.map((s) => {
    const a = s.resourceType === "user" ? absenceDuring(absences, s.resourceId, s.start, s.end) : null;
    return { ...s, conflict: conflicts.has(s.id) || !!a, absence: a ? ABSENCE_KINDS[a.kind] : null };
  });
}

/** Chantiers à planifier (pour le formulaire d'affectation). */
export async function plannableJobs(ctx: Ctx) {
  return ctx.db.query<{ id: string; title: string; status: string }>(
    "SELECT id, title, status FROM jobs WHERE org_id=$1 AND status IN ('a_planifier', 'en_cours') ORDER BY created_at DESC LIMIT 200",
    [ctx.orgId],
  );
}
