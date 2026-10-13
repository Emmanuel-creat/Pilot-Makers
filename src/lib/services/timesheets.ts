/**
 * Pointage des heures par chantier et feuilles de temps.
 *
 * Chaque membre pointe ses propres heures (chronomètre sur le téléphone ou saisie). L'encadrement
 * (administrateurs) valide ou refuse ; une heure validée n'est plus modifiable. L'export de paie
 * ne reprend que les heures validées.
 */

import { z } from "zod";
import { toCsv } from "@/lib/csv";
import { num, one, type Queryable } from "@/lib/db";
import { badRequest, conflict, forbidden, isUuid, notFound } from "@/lib/http";
import type { Ctx } from "./context";
import { audit, requirePermission, requireWritable } from "./context";
import { addDays, mondayOf, monthRange } from "./planning-dates";
import { readPricing } from "./pricing";
import { parisDate } from "./quotes";
import { classifyDays, decimalHours, parseDuration } from "./timesheet-calc";

export const ENTRY_STATUSES = { saisi: "À valider", valide: "Validé", refuse: "Refusé" } as const;
export type EntryStatus = keyof typeof ENTRY_STATUSES;

export interface TimeEntry {
  id: string;
  user_id: string;
  user_name: string;
  job_id: string | null;
  job_title: string | null;
  work_date: string;
  started_at: Date | null;
  ended_at: Date | null;
  minutes: number;
  note: string;
  status: EntryStatus;
  review_note: string;
}

const isAdmin = (ctx: Ctx) => ctx.role === "owner" || ctx.role === "admin";

function mapEntry(r: Record<string, unknown>): TimeEntry {
  const wd = r.work_date;
  return {
    id: String(r.id),
    user_id: String(r.user_id),
    user_name: String(r.user_name ?? ""),
    job_id: (r.job_id as string | null) ?? null,
    job_title: (r.job_title as string | null) ?? null,
    work_date: wd instanceof Date ? wd.toISOString().slice(0, 10) : String(wd).slice(0, 10),
    started_at: (r.started_at as Date | null) ?? null,
    ended_at: (r.ended_at as Date | null) ?? null,
    minutes: num(r.minutes),
    note: String(r.note ?? ""),
    status: r.status as EntryStatus,
    review_note: String(r.review_note ?? ""),
  };
}

const SELECT = `SELECT t.*, u.name AS user_name, j.title AS job_title
  FROM time_entries t JOIN users u ON u.id=t.user_id LEFT JOIN jobs j ON j.id=t.job_id`;

async function checkJob(q: Queryable, orgId: string, jobId: string | null | undefined): Promise<string | null> {
  if (!jobId) return null;
  if (!isUuid(jobId) || !(await one(q, "SELECT 1 FROM jobs WHERE id=$1 AND org_id=$2", [jobId, orgId]))) throw badRequest("Chantier introuvable");
  return jobId;
}

async function checkMember(q: Queryable, orgId: string, userId: string) {
  if (!isUuid(userId) || !(await one(q, "SELECT 1 FROM memberships WHERE user_id=$1 AND org_id=$2", [userId, orgId])))
    throw badRequest("Membre introuvable");
}

const coord = (v: unknown, max: number) => {
  const n = Number(v);
  return v !== undefined && v !== "" && v !== null && Number.isFinite(n) && Math.abs(n) <= max ? n : null;
};

/* ------------------------------------------------------------------ */
/* Chronomètre                                                         */
/* ------------------------------------------------------------------ */

export async function runningEntry(ctx: Ctx): Promise<TimeEntry | null> {
  const r = await one<Record<string, unknown>>(
    ctx.db,
    `${SELECT} WHERE t.org_id=$1 AND t.user_id=$2 AND t.started_at IS NOT NULL AND t.ended_at IS NULL`,
    [ctx.orgId, ctx.userId],
  );
  return r ? mapEntry(r) : null;
}

export async function startTimer(ctx: Ctx, input: { jobId?: string; latitude?: unknown; longitude?: unknown }, now = new Date()) {
  requireWritable(ctx);
  const jobId = await checkJob(ctx.db, ctx.orgId, input.jobId);
  if (await runningEntry(ctx)) throw conflict("Un pointage est déjà en cours : terminez-le d'abord");
  const r = await one<{ id: string }>(
    ctx.db,
    `INSERT INTO time_entries (org_id, user_id, job_id, work_date, started_at, latitude, longitude)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
    [ctx.orgId, ctx.userId, jobId, parisDate(now), now, coord(input.latitude, 90), coord(input.longitude, 180)],
  );
  return r!.id;
}

export async function stopTimer(ctx: Ctx, input: { note?: string } = {}, now = new Date()) {
  requireWritable(ctx);
  const run = await runningEntry(ctx);
  if (!run) throw notFound("Aucun pointage en cours");
  const minutes = Math.min(1440, Math.max(1, Math.round((now.getTime() - new Date(run.started_at!).getTime()) / 60000)));
  await ctx.db.query("UPDATE time_entries SET ended_at=$2, minutes=$3, note=$4, updated_at=now() WHERE id=$1", [
    run.id,
    now,
    minutes,
    String(input.note ?? "")
      .trim()
      .slice(0, 500),
  ]);
  return { id: run.id, minutes };
}

/* ------------------------------------------------------------------ */
/* Saisie                                                              */
/* ------------------------------------------------------------------ */

const entrySchema = z.object({
  jobId: z.string().optional().default(""),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date invalide"),
  duration: z.string().trim().min(1, "Indiquez la durée"),
  note: z.string().trim().max(500).optional().default(""),
  userId: z.string().optional().default(""),
});

function parseEntry(raw: unknown, today: string) {
  const p = entrySchema.safeParse(raw);
  if (!p.success) throw badRequest(p.error.issues[0].message);
  const minutes = parseDuration(p.data.duration);
  if (minutes === null || minutes <= 0 || minutes > 1440) throw badRequest("Durée invalide : par exemple 7:30 ou 7,5");
  if (p.data.date > addDays(today, 1)) throw badRequest("Impossible de pointer des heures à venir");
  if (p.data.date < addDays(today, -400)) throw badRequest("Date trop ancienne");
  return { ...p.data, minutes };
}

/** Saisie d'heures ; un administrateur peut saisir pour un autre membre. */
export async function addEntry(ctx: Ctx, raw: unknown, now = new Date()) {
  requireWritable(ctx);
  const d = parseEntry(raw, parisDate(now));
  const userId = d.userId && d.userId !== ctx.userId ? d.userId : ctx.userId;
  if (userId !== ctx.userId) {
    requirePermission(ctx, "staff");
    await checkMember(ctx.db, ctx.orgId, userId);
  }
  const jobId = await checkJob(ctx.db, ctx.orgId, d.jobId);
  const r = await one<{ id: string }>(
    ctx.db,
    "INSERT INTO time_entries (org_id, user_id, job_id, work_date, minutes, note) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id",
    [ctx.orgId, userId, jobId, d.date, d.minutes, d.note],
  );
  return r!.id;
}

async function ownEntry(ctx: Ctx, id: string) {
  if (!isUuid(id)) throw notFound("Pointage introuvable");
  const r = await one<Record<string, unknown>>(ctx.db, `${SELECT} WHERE t.id=$1 AND t.org_id=$2`, [id, ctx.orgId]);
  if (!r) throw notFound("Pointage introuvable");
  const e = mapEntry(r);
  if (e.user_id !== ctx.userId && !isAdmin(ctx)) throw notFound("Pointage introuvable");
  if (e.status === "valide") throw forbidden("Heures validées : demandez à l'encadrement de les rouvrir");
  return e;
}

async function editableEntry(ctx: Ctx, id: string) {
  const e = await ownEntry(ctx, id);
  if (e.started_at && !e.ended_at) throw conflict("Pointage en cours : terminez-le d'abord");
  return e;
}

export async function updateEntry(ctx: Ctx, id: string, raw: unknown, now = new Date()) {
  requireWritable(ctx);
  const e = await editableEntry(ctx, id);
  const d = parseEntry(raw, parisDate(now));
  const jobId = await checkJob(ctx.db, ctx.orgId, d.jobId);
  // Une heure refusée puis corrigée repart en validation.
  await ctx.db.query(
    "UPDATE time_entries SET job_id=$2, work_date=$3, minutes=$4, note=$5, status='saisi', review_note='', reviewed_by=NULL, reviewed_at=NULL, updated_at=now() WHERE id=$1",
    [e.id, jobId, d.date, d.minutes, d.note],
  );
}

/** Suppression d'un pointage non validé (y compris un chronomètre lancé par erreur). */
export async function deleteEntry(ctx: Ctx, id: string) {
  requireWritable(ctx);
  const e = await ownEntry(ctx, id);
  await ctx.db.query("DELETE FROM time_entries WHERE id=$1", [e.id]);
}

/* ------------------------------------------------------------------ */
/* Lecture et validation                                               */
/* ------------------------------------------------------------------ */

/** Pointages d'une période. Un membre ne voit que les siens. */
export async function listEntries(ctx: Ctx, f: { from: string; to: string; userId?: string; status?: EntryStatus; jobId?: string }) {
  const params: unknown[] = [ctx.orgId, f.from, f.to];
  const where = ["t.org_id=$1", "t.work_date BETWEEN $2 AND $3"];
  const userId = isAdmin(ctx) ? f.userId : ctx.userId;
  if (userId) {
    params.push(userId);
    where.push(`t.user_id=$${params.length}`);
  }
  if (f.status && f.status in ENTRY_STATUSES) {
    params.push(f.status);
    where.push(`t.status=$${params.length}`);
  }
  if (f.jobId && isUuid(f.jobId)) {
    params.push(f.jobId);
    where.push(`t.job_id=$${params.length}`);
  }
  const rows = await ctx.db.query<Record<string, unknown>>(
    `${SELECT} WHERE ${where.join(" AND ")} ORDER BY t.work_date, u.name, t.started_at NULLS LAST, t.created_at`,
    params,
  );
  return rows.map(mapEntry);
}

export async function reviewEntries(ctx: Ctx, ids: string[], decision: "valide" | "refuse" | "saisi", note = "") {
  requireWritable(ctx);
  requirePermission(ctx, "staff");
  const valid = ids.filter(isUuid);
  if (!valid.length) throw badRequest("Sélectionnez au moins un pointage");
  if (decision === "refuse" && !note.trim()) throw badRequest("Indiquez la raison du refus");
  const r = await ctx.db.query<{ id: string }>(
    `UPDATE time_entries SET status=$3, review_note=$4, reviewed_by=$5, reviewed_at=now(), updated_at=now()
     WHERE org_id=$1 AND id = ANY($2::uuid[]) AND NOT (started_at IS NOT NULL AND ended_at IS NULL) RETURNING id`,
    [ctx.orgId, valid, decision, decision === "refuse" ? note.trim().slice(0, 300) : "", decision === "saisi" ? null : ctx.userId],
  );
  await audit(ctx.db, { orgId: ctx.orgId, userId: ctx.userId, action: `time.${decision}`, data: { count: r.length }, ip: ctx.ip });
  return { updated: r.length };
}

/** Qualification d'un membre (reprise des taux horaires de l'onglet Tarifs) : sert au coût des heures. */
export async function setMemberQualification(ctx: Ctx, userId: string, qualification: string) {
  requireWritable(ctx);
  requirePermission(ctx, "staff");
  await checkMember(ctx.db, ctx.orgId, userId);
  const q = qualification.trim().slice(0, 60);
  if (q) {
    const org = await one<{ pricing: unknown }>(ctx.db, "SELECT pricing FROM organizations WHERE id=$1", [ctx.orgId]);
    if (!readPricing(org?.pricing).laborRates.some((r) => r.label === q))
      throw badRequest("Qualification inconnue : ajoutez-la dans Entreprise, onglet Tarifs");
  }
  await ctx.db.query("UPDATE memberships SET qualification=$3 WHERE user_id=$1 AND org_id=$2", [userId, ctx.orgId, q]);
}

/** Coût horaire de chaque membre selon sa qualification (centimes), 0 si non renseigné. */
export async function memberCosts(q: Queryable, orgId: string): Promise<Map<string, { name: string; qualification: string; costCents: number }>> {
  const org = await one<{ pricing: unknown }>(q, "SELECT pricing FROM organizations WHERE id=$1", [orgId]);
  const rates = readPricing(org?.pricing).laborRates;
  const rows = await q.query<{ user_id: string; name: string; qualification: string }>(
    "SELECT m.user_id, u.name, m.qualification FROM memberships m JOIN users u ON u.id=m.user_id WHERE m.org_id=$1",
    [orgId],
  );
  return new Map(
    rows.map((r) => [
      r.user_id,
      { name: r.name, qualification: r.qualification, costCents: rates.find((x) => x.label === r.qualification)?.costCents ?? 0 },
    ]),
  );
}

/** Heures pointées sur un chantier (toutes, et validées), avec leur coût. */
export async function jobHours(ctx: Ctx, jobId: string) {
  const rows = await ctx.db.query<{ user_id: string; status: string; minutes: unknown }>(
    "SELECT user_id, status, sum(minutes) AS minutes FROM time_entries WHERE org_id=$1 AND job_id=$2 AND status <> 'refuse' GROUP BY user_id, status",
    [ctx.orgId, jobId],
  );
  const costs = await memberCosts(ctx.db, ctx.orgId);
  let minutes = 0;
  let validated = 0;
  let costCents = 0;
  const byUser = new Map<string, number>();
  for (const r of rows) {
    const m = num(r.minutes);
    minutes += m;
    if (r.status === "valide") validated += m;
    costCents += Math.round((m * (costs.get(r.user_id)?.costCents ?? 0)) / 60);
    byUser.set(r.user_id, (byUser.get(r.user_id) ?? 0) + m);
  }
  return {
    minutes,
    validatedMinutes: validated,
    costCents,
    byUser: [...byUser].map(([id, m]) => ({ userId: id, name: costs.get(id)?.name ?? "", minutes: m })),
  };
}

/* ------------------------------------------------------------------ */
/* Export vers la paie                                                 */
/* ------------------------------------------------------------------ */

export interface PayrollRow {
  userId: string;
  name: string;
  qualification: string;
  days: number;
  minutes: number;
  normal: number;
  hs25: number;
  hs50: number;
  pending: number;
}

/**
 * Récapitulatif mensuel des heures validées par salarié, avec heures supplémentaires calculées
 * par semaine civile (35 h, puis 25 % jusqu'à 43 h, puis 50 %). Les semaines à cheval sur deux mois
 * sont lues en entier pour respecter l'ordre des heures, seuls les jours du mois sont comptés.
 */
export async function payroll(ctx: Ctx, month: string): Promise<PayrollRow[]> {
  requirePermission(ctx, "staff");
  if (!/^\d{4}-\d{2}$/.test(month)) throw badRequest("Mois invalide");
  const { from, to } = monthRange(`${month}-01`);
  const rows = await ctx.db.query<{ user_id: string; work_date: unknown; status: string; minutes: unknown }>(
    `SELECT user_id, work_date, status, sum(minutes) AS minutes FROM time_entries
     WHERE org_id=$1 AND work_date BETWEEN $2 AND $3 AND status <> 'refuse' AND NOT (started_at IS NOT NULL AND ended_at IS NULL)
     GROUP BY user_id, work_date, status`,
    [ctx.orgId, mondayOf(from), addDays(mondayOf(to), 6)],
  );
  const costs = await memberCosts(ctx.db, ctx.orgId);
  const perUser = new Map<string, { days: Record<string, number>; pending: number }>();
  for (const r of rows) {
    const date = r.work_date instanceof Date ? r.work_date.toISOString().slice(0, 10) : String(r.work_date).slice(0, 10);
    const u = perUser.get(r.user_id) ?? { days: {}, pending: 0 };
    if (r.status === "valide") u.days[date] = (u.days[date] ?? 0) + num(r.minutes);
    else if (date >= from && date <= to) u.pending += num(r.minutes);
    perUser.set(r.user_id, u);
  }
  const out: PayrollRow[] = [];
  for (const [userId, u] of perUser) {
    const classes = classifyDays(u.days);
    const row: PayrollRow = {
      userId,
      name: costs.get(userId)?.name ?? "",
      qualification: costs.get(userId)?.qualification ?? "",
      days: 0,
      minutes: 0,
      normal: 0,
      hs25: 0,
      hs50: 0,
      pending: u.pending,
    };
    for (const [d, c] of Object.entries(classes)) {
      if (d < from || d > to) continue;
      row.days++;
      row.minutes += c.normal + c.hs25 + c.hs50;
      row.normal += c.normal;
      row.hs25 += c.hs25;
      row.hs50 += c.hs50;
    }
    out.push(row);
  }
  return out.sort((a, b) => a.name.localeCompare(b.name, "fr"));
}

/** Fichier pour le cabinet de paie : une ligne par salarié, heures en décimal. */
export async function payrollCsv(ctx: Ctx, month: string): Promise<string> {
  const rows = await payroll(ctx, month);
  await audit(ctx.db, { orgId: ctx.orgId, userId: ctx.userId, action: "time.export", data: { month }, ip: ctx.ip });
  return toCsv(
    [
      "mois",
      "salarie",
      "qualification",
      "jours_travailles",
      "heures_total",
      "heures_normales",
      "heures_sup_25",
      "heures_sup_50",
      "heures_en_attente",
    ],
    rows.map((r) => [
      month,
      r.name,
      r.qualification,
      String(r.days),
      decimalHours(r.minutes),
      decimalHours(r.normal),
      decimalHours(r.hs25),
      decimalHours(r.hs50),
      decimalHours(r.pending),
    ]),
  );
}

/** Détail des heures validées du mois, une ligne par pointage. */
export async function timesheetDetailCsv(ctx: Ctx, month: string): Promise<string> {
  requirePermission(ctx, "staff");
  if (!/^\d{4}-\d{2}$/.test(month)) throw badRequest("Mois invalide");
  const { from, to } = monthRange(`${month}-01`);
  const entries = await listEntries(ctx, { from, to, status: "valide" });
  return toCsv(
    ["date", "salarie", "chantier", "heures", "note"],
    entries.map((e) => [e.work_date, e.user_name, e.job_title ?? "", decimalHours(e.minutes), e.note]),
  );
}

/** Chantiers proposés au pointage : ceux où la personne est prévue aujourd'hui d'abord, puis les chantiers en cours. */
export async function pointableJobs(ctx: Ctx, today: string) {
  return ctx.db.query<{ id: string; title: string; planned: boolean }>(
    `SELECT j.id, j.title, EXISTS (
        SELECT 1 FROM job_assignments a WHERE a.job_id=j.id AND a.resource_type='user' AND a.resource_id=$2 AND $3::date BETWEEN a.start_date AND a.end_date
      ) AS planned
     FROM jobs j WHERE j.org_id=$1 AND j.status IN ('a_planifier', 'en_cours')
     ORDER BY planned DESC, (j.status = 'en_cours') DESC, j.updated_at DESC LIMIT 200`,
    [ctx.orgId, ctx.userId, today],
  );
}
