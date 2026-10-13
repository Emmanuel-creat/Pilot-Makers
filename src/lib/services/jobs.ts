/**
 * Chantiers : un devis accepté devient un chantier, ses lignes deviennent des tâches.
 * L'avancement se saisit par tâche ; il est pondéré par le montant hors taxe de chaque ligne,
 * ce qui donne directement le pourcentage à reporter sur une facture de situation.
 */

import { z } from "zod";
import { num, one, type Queryable } from "@/lib/db";
import { badRequest, conflict, notFound } from "@/lib/http";
import { isSealed, open, seal } from "@/lib/secret-box";
import type { Ctx } from "./context";
import { audit, requireWritable } from "./context";
import { acceptedQuote } from "./invoices";

import { JOB_STATUSES, type JobStatus } from "./jobs-labels";

export { JOB_STATUSES, type JobStatus };

export interface JobContact {
  name: string;
  role: string;
  phone: string;
}

export interface Job {
  id: string;
  quote_id: string | null;
  customer_id: string | null;
  title: string;
  status: JobStatus;
  site_line1: string;
  site_line2: string;
  site_postal_code: string;
  site_city: string;
  access_notes: string;
  access_codes: string;
  contacts: JobContact[];
  start_date: string | null;
  end_date: string | null;
  created_at: Date;
  quote_number?: string | null;
  customer_name?: string | null;
}

export interface JobTask {
  id: string;
  section: string;
  label: string;
  quantity: string;
  unit: string;
  weight_cents: number;
  position: number;
  progress_bp: number;
  done_at: Date | null;
}

const day = (v: unknown) => (v ? (v instanceof Date ? v.toISOString().slice(0, 10) : String(v).slice(0, 10)) : null);

function mapJob(r: Record<string, unknown>): Job {
  const codes = String(r.access_codes ?? "");
  return {
    ...(r as unknown as Job),
    access_codes: codes && isSealed(codes) ? open(codes) : codes,
    contacts: (r.contacts as JobContact[]) ?? [],
    start_date: day(r.start_date),
    end_date: day(r.end_date),
  };
}

function mapTask(r: Record<string, unknown>): JobTask {
  return { ...(r as unknown as JobTask), weight_cents: num(r.weight_cents), position: num(r.position), progress_bp: num(r.progress_bp) };
}

/** Avancement global pondéré par les montants ; à parts égales si aucune tâche n'a de montant. */
export function progressOf(tasks: Pick<JobTask, "weight_cents" | "progress_bp">[]): number {
  if (!tasks.length) return 0;
  const total = tasks.reduce((s, t) => s + t.weight_cents, 0);
  if (total <= 0) return Math.round(tasks.reduce((s, t) => s + t.progress_bp, 0) / tasks.length);
  const done = tasks.reduce((s, t) => s + BigInt(t.weight_cents) * BigInt(t.progress_bp), 0n);
  return Number((done + BigInt(total) / 2n) / BigInt(total));
}

/** Avancement par lot (section du devis), dans l'ordre des tâches. */
export function progressBySection(tasks: JobTask[]) {
  const groups = new Map<string, JobTask[]>();
  for (const t of tasks) groups.set(t.section, [...(groups.get(t.section) ?? []), t]);
  return [...groups.entries()].map(([section, list]) => ({ section, tasks: list, progressBp: progressOf(list) }));
}

/** Crée le chantier d'un devis accepté (ou renvoie celui qui existe déjà). */
export async function createJobFromQuote(ctx: Ctx, quoteId: string): Promise<string> {
  requireWritable(ctx);
  return ctx.db.transaction(async (tx) => {
    const existing = await one<{ id: string }>(tx, "SELECT id FROM jobs WHERE quote_id=$1 AND org_id=$2", [quoteId, ctx.orgId]);
    if (existing) return existing.id;
    const quote = await acceptedQuote(tx, ctx, quoteId).catch((e) => {
      throw e?.status === 409 ? conflict("Seul un devis accepté devient un chantier") : e;
    });
    const s = quote.snapshot;
    const job = await one<{ id: string }>(
      tx,
      `INSERT INTO jobs (org_id, quote_id, customer_id, title, site_line1, site_line2, site_postal_code, site_city, contacts)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
      [
        ctx.orgId,
        quoteId,
        quote.customer_id,
        s.quote.title || `Chantier ${quote.number}`,
        s.quote.site.line1 || s.customer.billing_line1,
        s.quote.site.line2 || s.customer.billing_line2,
        s.quote.site.postalCode || s.customer.billing_postal_code,
        s.quote.site.city || s.customer.billing_city,
        JSON.stringify(s.customer.phone ? [{ name: s.customer.contact || s.customer.name, role: "Client", phone: s.customer.phone }] : []),
      ],
    );
    const amounts = new Map(s.calc.sections.flatMap((sec) => sec.lines.map((l) => [l.id, l.optional ? 0 : l.netCents] as const)));
    let position = 0;
    for (const sec of s.sections) {
      for (const l of sec.lines) {
        if (l.kind !== "item" || l.optional) continue;
        await tx.query(
          "INSERT INTO job_tasks (org_id, job_id, section, label, quantity, unit, weight_cents, position) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)",
          [ctx.orgId, job!.id, sec.title, l.label, l.quantity, l.unit, amounts.get(l.id) ?? 0, position++],
        );
      }
    }
    await audit(tx, { orgId: ctx.orgId, userId: ctx.userId, action: "job.create", target: job!.id, data: { quote_id: quoteId }, ip: ctx.ip });
    return job!.id;
  });
}

export async function listJobs(ctx: Ctx, f: { status?: string } = {}) {
  const params: unknown[] = [ctx.orgId];
  let where = "j.org_id=$1";
  if (f.status && f.status in JOB_STATUSES) {
    params.push(f.status);
    where += " AND j.status=$2";
  }
  const rows = await ctx.db.query<Record<string, unknown>>(
    `SELECT j.*, q.number AS quote_number,
       coalesce(nullif(c.company_name, ''), nullif(trim(c.first_name || ' ' || c.last_name), '')) AS customer_name,
       (SELECT coalesce(json_agg(json_build_object('weight_cents', t.weight_cents, 'progress_bp', t.progress_bp)), '[]'::json) FROM job_tasks t WHERE t.job_id=j.id) AS task_weights
     FROM jobs j LEFT JOIN quotes q ON q.id=j.quote_id LEFT JOIN customers c ON c.id=j.customer_id
     WHERE ${where} ORDER BY CASE j.status WHEN 'en_cours' THEN 0 WHEN 'a_planifier' THEN 1 WHEN 'termine' THEN 2 ELSE 3 END, j.start_date NULLS LAST, j.created_at DESC`,
    params,
  );
  return rows.map((r) => {
    const weights = ((r.task_weights as { weight_cents: unknown; progress_bp: unknown }[]) ?? []).map((t) => ({
      weight_cents: num(t.weight_cents),
      progress_bp: num(t.progress_bp),
    }));
    return { ...mapJob(r), progressBp: progressOf(weights), taskCount: weights.length };
  });
}

export async function getJob(ctx: Ctx, id: string, q: Queryable = ctx.db) {
  const r = await one<Record<string, unknown>>(
    q,
    `SELECT j.*, q.number AS quote_number,
       coalesce(nullif(c.company_name, ''), nullif(trim(c.first_name || ' ' || c.last_name), '')) AS customer_name
     FROM jobs j LEFT JOIN quotes q ON q.id=j.quote_id LEFT JOIN customers c ON c.id=j.customer_id WHERE j.id=$1 AND j.org_id=$2`,
    [id, ctx.orgId],
  );
  if (!r) throw notFound("Chantier introuvable");
  const tasks = (await q.query<Record<string, unknown>>("SELECT * FROM job_tasks WHERE job_id=$1 ORDER BY position", [id])).map(mapTask);
  return { job: mapJob(r), tasks, progressBp: progressOf(tasks), sections: progressBySection(tasks) };
}

export async function jobForQuote(ctx: Ctx, quoteId: string) {
  return one<{ id: string }>(ctx.db, "SELECT id FROM jobs WHERE quote_id=$1 AND org_id=$2", [quoteId, ctx.orgId]);
}

const str = (max: number) => z.string().trim().max(max).default("");
const dateOrEmpty = z
  .string()
  .trim()
  .refine((v) => v === "" || /^\d{4}-\d{2}-\d{2}$/.test(v), "Date invalide")
  .default("");

const jobSchema = z.object({
  title: z.string().trim().min(1, "Nom du chantier requis").max(300),
  status: z.enum(Object.keys(JOB_STATUSES) as [JobStatus, ...JobStatus[]]),
  site_line1: str(300),
  site_line2: str(300),
  site_postal_code: str(10),
  site_city: str(120),
  access_notes: str(2000),
  access_codes: str(500),
  contacts: z
    .array(z.object({ name: str(120), role: str(80), phone: str(40) }))
    .max(10)
    .default([]),
  start_date: dateOrEmpty,
  end_date: dateOrEmpty,
});

export async function updateJob(ctx: Ctx, id: string, raw: unknown) {
  requireWritable(ctx);
  const p = jobSchema.safeParse(raw);
  if (!p.success) throw badRequest(p.error.issues[0].message);
  const d = p.data;
  if (d.start_date && d.end_date && d.end_date < d.start_date) throw badRequest("La fin prévue précède le début");
  const contacts = d.contacts.filter((c) => c.name || c.phone);
  const r = await ctx.db.query<{ id: string }>(
    `UPDATE jobs SET title=$3, status=$4, site_line1=$5, site_line2=$6, site_postal_code=$7, site_city=$8, access_notes=$9, access_codes=$10,
       contacts=$11, start_date=$12, end_date=$13, updated_at=now() WHERE id=$1 AND org_id=$2 RETURNING id`,
    [
      id,
      ctx.orgId,
      d.title,
      d.status,
      d.site_line1,
      d.site_line2,
      d.site_postal_code,
      d.site_city,
      d.access_notes,
      // Codes d'accès (digicode, boîte à clés) : chiffrés en base comme les coordonnées bancaires.
      d.access_codes ? seal(d.access_codes) : "",
      JSON.stringify(contacts),
      d.start_date || null,
      d.end_date || null,
    ],
  );
  if (!r.length) throw notFound("Chantier introuvable");
}

/** Avancement d'une tâche, en pourcentage (0 à 100). */
export async function setTaskProgress(ctx: Ctx, taskId: string, percent: number) {
  requireWritable(ctx);
  if (!Number.isFinite(percent) || percent < 0 || percent > 100) throw badRequest("Avancement entre 0 et 100 %");
  const bp = Math.round(percent * 100);
  const r = await ctx.db.query<{ job_id: string }>(
    `UPDATE job_tasks SET progress_bp=$3, done_at=CASE WHEN $3 = 10000 THEN coalesce(done_at, now()) ELSE NULL END, updated_at=now()
     WHERE id=$1 AND org_id=$2 RETURNING job_id`,
    [taskId, ctx.orgId, bp],
  );
  if (!r.length) throw notFound("Tâche introuvable");
  // Premier avancement saisi : le chantier passe en cours.
  if (bp > 0) await ctx.db.query("UPDATE jobs SET status='en_cours', updated_at=now() WHERE id=$1 AND status='a_planifier'", [r[0].job_id]);
  return r[0].job_id;
}

export async function addTask(ctx: Ctx, jobId: string, raw: { label: string; section?: string }) {
  requireWritable(ctx);
  const label = String(raw.label ?? "").trim();
  if (!label) throw badRequest("Libellé de la tâche requis");
  if (label.length > 300) throw badRequest("Libellé trop long");
  await getJob(ctx, jobId);
  const pos = await one<{ n: unknown }>(ctx.db, "SELECT coalesce(max(position), -1) + 1 AS n FROM job_tasks WHERE job_id=$1", [jobId]);
  await ctx.db.query("INSERT INTO job_tasks (org_id, job_id, section, label, position) VALUES ($1,$2,$3,$4,$5)", [
    ctx.orgId,
    jobId,
    String(raw.section ?? "")
      .trim()
      .slice(0, 200) || "Tâches ajoutées",
    label,
    num(pos?.n),
  ]);
}

export async function deleteTask(ctx: Ctx, taskId: string) {
  requireWritable(ctx);
  const r = await ctx.db.query<{ id: string }>("DELETE FROM job_tasks WHERE id=$1 AND org_id=$2 AND weight_cents=0 RETURNING id", [
    taskId,
    ctx.orgId,
  ]);
  if (!r.length) throw badRequest("Seule une tâche ajoutée à la main peut être supprimée");
}
