/**
 * Coordination des corps de métier : interventions de l'équipe et des sous-traitants sur un chantier,
 * contrôle de leur enchaînement et envoi du planning aux entreprises intervenantes.
 */

import { z } from "zod";
import { one } from "@/lib/db";
import { badRequest, isUuid, notFound } from "@/lib/http";
import { coordinationIssues, planningText, sortInterventions, tradeByKey, type Intervention } from "@/lib/coordination";
import type { Ctx } from "./context";
import { audit, requireWritable } from "./context";
import { sendMail } from "./mail";

export const OWN_TEAM = "Notre équipe";
const day = (v: unknown) => (v == null ? null : (v instanceof Date ? v.toISOString() : String(v)).slice(0, 10));

export interface JobIntervention extends Intervention {
  subcontractorId: string | null;
}

async function requireJob(ctx: Ctx, jobId: string) {
  if (!isUuid(jobId)) throw notFound("Chantier introuvable");
  const j = await one<Record<string, unknown>>(ctx.db, "SELECT * FROM jobs WHERE id=$1 AND org_id=$2", [jobId, ctx.orgId]);
  if (!j) throw notFound("Chantier introuvable");
  return j;
}

export async function listInterventions(ctx: Ctx, jobId: string): Promise<JobIntervention[]> {
  const rows = await ctx.db.query<Record<string, unknown>>(
    `SELECT i.*, s.name AS sub_name FROM job_interventions i LEFT JOIN subcontractors s ON s.id=i.subcontractor_id
     WHERE i.job_id=$1 AND i.org_id=$2 ORDER BY i.start_date NULLS LAST, i.created_at`,
    [jobId, ctx.orgId],
  );
  return sortInterventions(
    rows.map((r) => ({
      id: String(r.id),
      trade: String(r.trade),
      company: r.subcontractor_id ? String(r.sub_name ?? "Sous-traitant") : OWN_TEAM,
      subcontractorId: (r.subcontractor_id as string | null) ?? null,
      startDate: day(r.start_date),
      endDate: day(r.end_date),
      afterId: (r.after_id as string | null) ?? null,
      note: String(r.note ?? ""),
    })),
  );
}

export async function getCoordination(ctx: Ctx, jobId: string) {
  const job = await requireJob(ctx, jobId);
  const [interventions, subs] = await Promise.all([
    listInterventions(ctx, jobId),
    ctx.db.query<{ id: string; name: string; trade: string; email: string }>(
      "SELECT id, name, trade, email FROM subcontractors WHERE org_id=$1 AND archived_at IS NULL ORDER BY lower(name)",
      [ctx.orgId],
    ),
  ]);
  const involved = new Set(interventions.map((i) => i.subcontractorId).filter(Boolean));
  return {
    job: {
      id: jobId,
      title: String(job.title),
      address: address(job),
      planningSentAt: job.planning_sent_at ? new Date(job.planning_sent_at as string).toISOString() : null,
    },
    interventions,
    issues: coordinationIssues(interventions),
    subcontractors: subs,
    recipients: subs.filter((s) => involved.has(s.id) && s.email),
  };
}

const address = (j: Record<string, unknown>) => [j.site_line1, [j.site_postal_code, j.site_city].filter(Boolean).join(" ")].filter(Boolean).join(", ");

const dateOrEmpty = z
  .string()
  .trim()
  .default("")
  .refine((v) => v === "" || /^\d{4}-\d{2}-\d{2}$/.test(v), "Date invalide");
const schema = z.object({
  trade: z.string().refine((v) => !!tradeByKey(v), "Choisissez le corps de métier"),
  subcontractorId: z.string().default(""),
  startDate: dateOrEmpty,
  endDate: dateOrEmpty,
  afterId: z.string().default(""),
  note: z.string().trim().max(300).default(""),
});

export async function saveIntervention(ctx: Ctx, jobId: string, raw: unknown, id?: string) {
  requireWritable(ctx);
  await requireJob(ctx, jobId);
  const p = schema.safeParse(raw);
  if (!p.success) throw badRequest(p.error.issues[0].message);
  const v = p.data;
  if (v.startDate && v.endDate && v.endDate < v.startDate) throw badRequest("La fin doit suivre le début");
  if ((v.startDate && !v.endDate) || (!v.startDate && v.endDate)) throw badRequest("Indiquez le début et la fin, ou aucune des deux");
  let sub: string | null = null;
  if (v.subcontractorId) {
    if (!isUuid(v.subcontractorId) || !(await one(ctx.db, "SELECT 1 FROM subcontractors WHERE id=$1 AND org_id=$2", [v.subcontractorId, ctx.orgId])))
      throw badRequest("Sous-traitant inconnu");
    sub = v.subcontractorId;
  }
  let after: string | null = null;
  if (v.afterId) {
    if (!isUuid(v.afterId) || v.afterId === id || !(await one(ctx.db, "SELECT 1 FROM job_interventions WHERE id=$1 AND job_id=$2", [v.afterId, jobId])))
      throw badRequest("Intervention précédente inconnue");
    after = v.afterId;
  }
  const params = [jobId, ctx.orgId, v.trade, sub, v.startDate || null, v.endDate || null, after, v.note];
  if (id) {
    if (!isUuid(id)) throw notFound("Intervention introuvable");
    const r = await one(
      ctx.db,
      `UPDATE job_interventions SET trade=$3, subcontractor_id=$4, start_date=$5, end_date=$6, after_id=$7, note=$8
       WHERE id=$9 AND job_id=$1 AND org_id=$2 RETURNING id`,
      [...params, id],
    );
    if (!r) throw notFound("Intervention introuvable");
    return id;
  }
  const n = await one<{ n: string }>(ctx.db, "SELECT count(*) AS n FROM job_interventions WHERE job_id=$1", [jobId]);
  if (Number(n?.n) >= 40) throw badRequest("40 interventions au plus par chantier");
  const r = await one<{ id: string }>(
    ctx.db,
    `INSERT INTO job_interventions (job_id, org_id, trade, subcontractor_id, start_date, end_date, after_id, note) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
    params,
  );
  return r!.id;
}

export async function deleteIntervention(ctx: Ctx, id: string) {
  requireWritable(ctx);
  if (!isUuid(id)) throw notFound("Intervention introuvable");
  const r = await one<{ job_id: string }>(ctx.db, "DELETE FROM job_interventions WHERE id=$1 AND org_id=$2 RETURNING job_id", [id, ctx.orgId]);
  if (!r) throw notFound("Intervention introuvable");
  return r.job_id;
}

/** Envoie le planning à chaque sous-traitant du chantier qui a une adresse e-mail. */
export async function sendPlanning(ctx: Ctx, jobId: string) {
  requireWritable(ctx);
  const c = await getCoordination(ctx, jobId);
  if (!c.interventions.length) throw badRequest("Ajoutez d'abord les interventions");
  if (!c.recipients.length) throw badRequest("Aucun sous-traitant de ce planning n'a d'adresse e-mail");
  const org = await one<{ trade_name: string; legal_name: string; phone: string }>(
    ctx.db,
    "SELECT trade_name, legal_name, phone FROM organizations WHERE id=$1",
    [ctx.orgId],
  );
  const name = org?.trade_name || org?.legal_name || "";
  const text = planningText(c.job.title, c.job.address, c.interventions);
  await ctx.db.transaction(async (tx) => {
    for (const s of c.recipients) {
      await sendMail(tx, {
        orgId: ctx.orgId,
        kind: "notification",
        to: s.email,
        subject: `Planning du chantier ${c.job.title}`,
        body: `Bonjour,\n\n${text}\n\nMerci de nous signaler au plus vite toute indisponibilité${org?.phone ? ` au ${org.phone}` : ""}.\n\nCordialement,\n${name}`,
      });
    }
    await tx.query("UPDATE jobs SET planning_sent_at=now() WHERE id=$1 AND org_id=$2", [jobId, ctx.orgId]);
  });
  await audit(ctx.db, {
    orgId: ctx.orgId,
    userId: ctx.userId,
    action: "job.planning_sent",
    target: jobId,
    data: { recipients: c.recipients.length },
    ip: ctx.ip,
  });
  return c.recipients.length;
}
