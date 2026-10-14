/** Chantiers en retard, fin probable, et client prévenu de la nouvelle date (à la demande ou automatiquement). */

import { assessDelay, delayMail, type DelayAssessment } from "@/lib/delays";
import { num, one, type Database, type Queryable } from "@/lib/db";
import { badRequest, isUuid, notFound } from "@/lib/http";
import { remainingLabourDays } from "@/lib/workload";
import type { Ctx } from "./context";
import { audit, requirePermission, requireWritable } from "./context";
import { sendMail } from "./mail";
import { parisDate } from "./quotes";

const CUSTOMER = "coalesce(nullif(c.company_name, ''), nullif(trim(c.first_name || ' ' || c.last_name), ''), '')";
const iso = (v: unknown) => (v == null ? null : (v instanceof Date ? v.toISOString() : String(v)).slice(0, 10));

export interface DelayRow extends DelayAssessment {
  jobId: string;
  orgId: string;
  title: string;
  customer: string;
  customerEmail: string;
  address: string;
  start: string;
  end: string;
  crew: number;
  lastNotice: { newEnd: string; sentAt: string } | null;
}

async function rows(db: Queryable, where: string, params: unknown[], today: string): Promise<DelayRow[]> {
  const jobs = await db.query<Record<string, unknown>>(
    `SELECT j.id, j.org_id, j.title, j.start_date, j.end_date, ${CUSTOMER} AS customer, coalesce(c.email, '') AS email,
       trim(j.site_line1 || ', ' || j.site_postal_code || ' ' || j.site_city, ', ') AS address,
       (SELECT count(DISTINCT a.resource_id) FROM job_assignments a WHERE a.job_id=j.id AND a.resource_type='user' AND a.start_date <= $${params.length + 1} AND a.end_date >= $${params.length + 1}) AS crew,
       (SELECT n.new_end::text || '|' || n.sent_at::text FROM job_delay_notices n WHERE n.job_id=j.id ORDER BY n.sent_at DESC LIMIT 1) AS last_notice
     FROM jobs j LEFT JOIN customers c ON c.id=j.customer_id
     WHERE ${where} AND j.status IN ('a_planifier','en_cours') AND j.start_date IS NOT NULL AND j.end_date IS NOT NULL AND j.start_date <= $${params.length + 1}`,
    [...params, today],
  );
  if (!jobs.length) return [];
  const tasks = await db.query<{ job_id: string; nature: string; quantity: string; unit: string; progress_bp: unknown; weight_cents: unknown }>(
    "SELECT t.job_id, coalesce(t.nature, '') AS nature, t.quantity, t.unit, t.progress_bp, t.weight_cents FROM job_tasks t WHERE t.job_id = ANY($1::uuid[])",
    [jobs.map((j) => j.id)],
  );
  return jobs.map((j) => {
    const mine = tasks.filter((t) => t.job_id === j.id);
    const weight = mine.reduce((s, t) => s + Math.max(1, num(t.weight_cents)), 0);
    const progress = weight ? mine.reduce((s, t) => s + Math.max(1, num(t.weight_cents)) * (num(t.progress_bp) / 10000), 0) / weight : 0;
    const start = iso(j.start_date)!;
    const end = iso(j.end_date)!;
    const crew = Number(j.crew ?? 0);
    const a = assessDelay({
      start,
      end,
      today,
      progress,
      crew,
      remainingLabourDays: remainingLabourDays(mine.map((t) => ({ nature: t.nature, quantity: t.quantity, unit: t.unit, progressBp: num(t.progress_bp) }))),
    });
    const [newEnd, sentAt] = j.last_notice ? String(j.last_notice).split("|") : [];
    return {
      ...a,
      jobId: String(j.id),
      orgId: String(j.org_id),
      title: String(j.title),
      customer: String(j.customer),
      customerEmail: String(j.email),
      address: String(j.address),
      start,
      end,
      crew,
      lastNotice: newEnd ? { newEnd, sentAt } : null,
    };
  });
}

export async function delayBoard(ctx: Ctx, now = new Date()) {
  const list = await rows(ctx.db, "j.org_id=$1", [ctx.orgId], parisDate(now));
  const org = await one<{ delay_auto_notice: boolean }>(ctx.db, "SELECT delay_auto_notice FROM organizations WHERE id=$1", [ctx.orgId]);
  const order = { depasse: 0, en_retard: 1, a_l_heure: 2 };
  return { autoNotice: Boolean(org?.delay_auto_notice), jobs: list.sort((a, b) => order[a.state] - order[b.state] || b.lateDays - a.lateDays) };
}

async function notify(db: Queryable, r: DelayRow, automatic: boolean, now: Date) {
  const org = await one<{ name: string; phone: string }>(
    db,
    "SELECT coalesce(nullif(trade_name, ''), legal_name) AS name, phone FROM organizations WHERE id=$1",
    [r.orgId],
  );
  const claimed = await one(
    db,
    "INSERT INTO job_delay_notices (job_id, org_id, new_end, automatic, sent_at) VALUES ($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING RETURNING job_id",
    [r.jobId, r.orgId, r.projectedEnd, automatic, now],
  );
  if (!claimed) return false;
  const mail = delayMail({
    title: r.title,
    address: r.address,
    plannedEnd: r.end,
    newEnd: r.projectedEnd,
    orgName: org?.name ?? "",
    orgPhone: org?.phone ?? "",
  });
  const e = await sendMail(db, { orgId: r.orgId, kind: "delay_notice", to: r.customerEmail, ...mail, idempotencyKey: `delay:${r.jobId}:${r.projectedEnd}` });
  await db.query("UPDATE job_delay_notices SET email_id=$3 WHERE job_id=$1 AND new_end=$2", [r.jobId, r.projectedEnd, e.id]);
  return true;
}

export async function notifyCustomerDelay(ctx: Ctx, jobId: string, now = new Date()) {
  requireWritable(ctx);
  if (!isUuid(jobId)) throw notFound("Chantier introuvable");
  const r = (await rows(ctx.db, "j.org_id=$1 AND j.id=$2", [ctx.orgId, jobId], parisDate(now)))[0];
  if (!r) throw notFound("Chantier introuvable ou sans dates");
  if (r.state === "a_l_heure") throw badRequest("Ce chantier est dans les temps");
  if (!r.customerEmail) throw badRequest("Le client n'a pas d'adresse e-mail");
  if (!(await notify(ctx.db, r, false, now))) throw badRequest("Le client a déjà été prévenu de cette date");
  await audit(ctx.db, { orgId: ctx.orgId, userId: ctx.userId, action: "job.delay_notice", target: jobId, data: { newEnd: r.projectedEnd }, ip: ctx.ip });
  return r.projectedEnd;
}

export async function setDelayAutoNotice(ctx: Ctx, on: boolean) {
  requireWritable(ctx);
  requirePermission(ctx, "settings");
  await ctx.db.query("UPDATE organizations SET delay_auto_notice=$2 WHERE id=$1", [ctx.orgId, on]);
}

/** Tâche planifiée : client prévenu une fois par nouvelle date, au plus une fois par semaine, si l'entreprise l'a activé. */
export async function runDelayNotices(db: Database, now = new Date()) {
  const list = await rows(db, "EXISTS (SELECT 1 FROM organizations o WHERE o.id=j.org_id AND o.status='active' AND o.delay_auto_notice)", [], parisDate(now));
  let sent = 0;
  for (const r of list) {
    if (r.state === "a_l_heure" || !r.customerEmail) continue;
    if (r.lastNotice && (r.lastNotice.newEnd >= r.projectedEnd || now.getTime() - new Date(r.lastNotice.sentAt).getTime() < 7 * 86_400_000)) continue;
    if (await notify(db, r, true, now)) sent++;
  }
  return { sent };
}
