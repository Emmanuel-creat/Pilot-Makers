/**
 * Plan de prévention d'un chantier : risques retenus et leurs mesures, secours, intervenants, et le
 * document à afficher sur le chantier et à faire lire à chacun.
 */

import { z } from "zod";
import { one } from "@/lib/db";
import { badRequest, isUuid, notFound } from "@/lib/http";
import { renderSafetyPdf } from "@/lib/pdf/safety-pdf";
import { protectiveEquipment, requiredSurveys, RISK_KEYS, suggestRisks } from "@/lib/safety";
import type { Ctx } from "./context";
import { audit, requireWritable } from "./context";
import { getJob } from "./jobs";
import { parisDate } from "./quotes";

export interface SafetyPlan {
  risks: string[];
  buildingYear: number | null;
  manager: string;
  firstAider: string;
  hospital: string;
  meetingPoint: string;
  instructions: string;
}

export async function getSafetyPlan(ctx: Ctx, jobId: string, now = new Date()) {
  if (!isUuid(jobId)) throw notFound("Chantier introuvable");
  const { job, tasks } = await getJob(ctx, jobId);
  const [row, team, companies] = await Promise.all([
    one<Record<string, unknown>>(ctx.db, "SELECT * FROM job_safety_plans WHERE job_id=$1 AND org_id=$2", [jobId, ctx.orgId]),
    ctx.db.query<{ name: string }>(
      `SELECT DISTINCT u.name FROM job_assignments a JOIN users u ON u.id=a.resource_id
       WHERE a.job_id=$1 AND a.org_id=$2 AND a.resource_type='user' ORDER BY u.name`,
      [jobId, ctx.orgId],
    ),
    ctx.db.query<{ name: string; trade: string }>(
      `SELECT s.name, s.trade FROM job_subcontractors js JOIN subcontractors s ON s.id=js.subcontractor_id
       WHERE js.job_id=$1 AND js.org_id=$2 ORDER BY lower(s.name)`,
      [jobId, ctx.orgId],
    ),
  ]);
  const buildingYear = row?.building_year == null ? null : Number(row.building_year);
  const suggested = suggestRisks({ labels: [job.title, ...tasks.map((t) => `${t.section} ${t.label}`)], buildingYear, otherCompanies: companies.length > 0 });
  const plan: SafetyPlan = row
    ? {
        risks: (row.risks as string[]).filter((k) => RISK_KEYS.includes(k)),
        buildingYear,
        manager: String(row.manager),
        firstAider: String(row.first_aider),
        hospital: String(row.hospital),
        meetingPoint: String(row.meeting_point),
        instructions: String(row.instructions),
      }
    : { risks: suggested, buildingYear: null, manager: ctx.userName, firstAider: "", hospital: "", meetingPoint: "", instructions: "" };
  return {
    job,
    plan,
    saved: !!row,
    updatedAt: row ? new Date(row.updated_at as string).toISOString() : null,
    suggested,
    team: team.map((t) => t.name),
    companies: companies.map((c) => (c.trade ? `${c.name} (${c.trade})` : c.name)),
    surveys: requiredSurveys(buildingYear),
    ppe: protectiveEquipment(plan.risks),
    today: parisDate(now),
  };
}

const text = (max: number) => z.string().trim().max(max).default("");
const schema = z.object({
  risks: z.array(z.string()).max(RISK_KEYS.length).default([]),
  buildingYear: z
    .string()
    .trim()
    .default("")
    .refine((v) => v === "" || (/^\d{4}$/.test(v) && Number(v) >= 1000 && Number(v) <= new Date().getFullYear() + 1), "Année de construction invalide"),
  manager: text(160),
  firstAider: text(160),
  hospital: text(300),
  meetingPoint: text(300),
  instructions: text(4000),
});

export async function saveSafetyPlan(ctx: Ctx, jobId: string, raw: unknown) {
  requireWritable(ctx);
  const p = schema.safeParse(raw);
  if (!p.success) throw badRequest(p.error.issues[0].message);
  const v = p.data;
  const risks = RISK_KEYS.filter((k) => v.risks.includes(k));
  if (!risks.length) throw badRequest("Retenez au moins un risque");
  if (!v.manager) throw badRequest("Indiquez le responsable du chantier");
  await getJob(ctx, jobId);
  await ctx.db.query(
    `INSERT INTO job_safety_plans (job_id, org_id, risks, building_year, manager, first_aider, hospital, meeting_point, instructions, updated_by, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,now())
     ON CONFLICT (job_id) DO UPDATE SET risks=$3, building_year=$4, manager=$5, first_aider=$6, hospital=$7, meeting_point=$8, instructions=$9,
       updated_by=$10, updated_at=now()`,
    [jobId, ctx.orgId, risks, v.buildingYear ? Number(v.buildingYear) : null, v.manager, v.firstAider, v.hospital, v.meetingPoint, v.instructions, ctx.userId],
  );
  await audit(ctx.db, { orgId: ctx.orgId, userId: ctx.userId, action: "job.safety_plan", target: jobId, data: { risks }, ip: ctx.ip });
}

export async function safetyPdf(ctx: Ctx, jobId: string, now = new Date()) {
  const s = await getSafetyPlan(ctx, jobId, now);
  if (!s.saved) throw badRequest("Enregistrez d'abord le plan de prévention");
  const org = await one<{ trade_name: string; legal_name: string; phone: string }>(
    ctx.db,
    "SELECT trade_name, legal_name, phone FROM organizations WHERE id=$1",
    [ctx.orgId],
  );
  const j = s.job;
  return renderSafetyPdf({
    org: { name: org?.trade_name || org?.legal_name || "", phone: org?.phone ?? "" },
    job: {
      title: j.title,
      address: [j.site_line1, j.site_line2, [j.site_postal_code, j.site_city].filter(Boolean).join(" ")].filter(Boolean).join(", "),
      startDate: j.start_date,
      endDate: j.end_date,
      customer: j.customer_name ?? "",
    },
    plan: s.plan,
    team: s.team,
    companies: s.companies,
    surveys: s.surveys,
    ppe: s.ppe,
    today: s.today,
  });
}
