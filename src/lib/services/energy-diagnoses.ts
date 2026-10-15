/** Diagnostics énergétiques simplifiés : enregistrement, relecture et devis des travaux retenus. */

import { randomUUID } from "node:crypto";
import { one } from "@/lib/db";
import { diagnose, diagnosisSchema, type DiagnosisInput, type WorkKey } from "@/lib/energy-diagnosis";
import { badRequest, isUuid, notFound } from "@/lib/http";
import { aidStepSchema, buildJourney, isAidStep, readAidSteps } from "@/lib/energy-journey";
import type { Ctx } from "./context";
import { audit, requireWritable } from "./context";
import type { DraftLine } from "./quote-types";
import { createQuote, getDraft, parisDate, saveDraft } from "./quotes";

interface Row {
  id: string;
  customer_id: string | null;
  customer_name: string | null;
  quote_id: string | null;
  quote_number: string | null;
  input: DiagnosisInput;
  current_class: string;
  after_class: string;
  created_at: Date;
}

const SELECT = `SELECT d.id, d.customer_id, CASE WHEN c.id IS NULL THEN NULL WHEN c.type <> 'particulier' AND c.company_name <> '' THEN c.company_name ELSE nullif(trim(concat_ws(' ', nullif(c.civility, ''), nullif(c.first_name, ''), nullif(c.last_name, ''))), '') END AS customer_name, d.quote_id, q.number AS quote_number, d.input, d.current_class, d.after_class, d.created_at
  FROM energy_diagnoses d LEFT JOIN customers c ON c.id = d.customer_id LEFT JOIN quotes q ON q.id = d.quote_id`;

export async function saveDiagnosis(ctx: Ctx, raw: unknown, customerId: string | null) {
  requireWritable(ctx);
  const p = diagnosisSchema.safeParse(raw);
  if (!p.success) throw badRequest(p.error.issues[0].message);
  if (customerId) {
    if (!isUuid(customerId) || !(await one(ctx.db, "SELECT 1 FROM customers WHERE id=$1 AND org_id=$2", [customerId, ctx.orgId])))
      throw notFound("Client introuvable");
  }
  const d = diagnose(p.data);
  const r = await one<{ id: string }>(
    ctx.db,
    "INSERT INTO energy_diagnoses (org_id, customer_id, input, current_class, after_class, created_by) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id",
    [ctx.orgId, customerId, JSON.stringify(p.data), d.current.energyClass, d.after.energyClass, ctx.userId],
  );
  await audit(ctx.db, { orgId: ctx.orgId, userId: ctx.userId, action: "energy_diagnosis.create", target: r!.id, ip: ctx.ip });
  return r!.id;
}

export async function getDiagnosis(ctx: Ctx, id: string) {
  if (!isUuid(id)) throw notFound("Diagnostic introuvable");
  const r = await one<Row>(ctx.db, `${SELECT} WHERE d.id=$1 AND d.org_id=$2`, [id, ctx.orgId]);
  if (!r) throw notFound("Diagnostic introuvable");
  return { ...r, diagnosis: diagnose(r.input) };
}

export async function listDiagnoses(ctx: Ctx) {
  return ctx.db.query<Row>(`${SELECT} WHERE d.org_id=$1 ORDER BY d.created_at DESC LIMIT 100`, [ctx.orgId]);
}

const price = (n: number) => String(Math.round(n * 100) / 100).replace(".", ",");

/** Crée le devis des travaux retenus, prix indicatifs du diagnostic marqués à vérifier, aides renseignées. */
export async function quoteFromDiagnosis(ctx: Ctx, id: string, keys: WorkKey[]) {
  requireWritable(ctx);
  const r = await getDiagnosis(ctx, id);
  const works = r.diagnosis.works.filter((w) => keys.includes(w.key));
  if (!works.length) throw badRequest("Choisissez au moins un des travaux proposés");
  const quoteId = await createQuote(ctx, { customerId: r.customer_id, title: "Rénovation énergétique" });
  const draft = await getDraft(ctx, quoteId);
  const lines: DraftLine[] = works.map((w) => ({
    id: randomUUID(),
    kind: "item",
    catalogItemId: null,
    nature: "forfait",
    label: w.label,
    description: "",
    quantity: String(w.quantity),
    unit: w.unit,
    unitPrice: price((w.costMin + w.costMax) / 2 / 1.055 / w.quantity),
    unitCost: "",
    discountPercent: "",
    vatPercent: "5,5",
    estimated: true,
    estimateNote: "Prix indicatif du diagnostic énergétique : à ajuster après métré",
  }));
  const aid = works.reduce((s, w) => s + w.aid, 0);
  const visit = new Date(r.created_at).toISOString().slice(0, 10);
  await saveDraft(
    ctx,
    quoteId,
    {
      ...draft,
      sections: [{ id: randomUUID(), title: "Travaux de rénovation énergétique", description: "", lines }],
      energyAid: {
        programs: r.diagnosis.income && aid > 0 ? ["mpr", "cee"] : ["cee"],
        domains: [...new Set(works.map((w) => w.rgeDomain))],
        visitDate: visit,
        estimatedAid: aid > 0 ? String(aid) : "",
      },
    },
    draft.draftRevision,
  );
  await ctx.db.query("UPDATE energy_diagnoses SET quote_id=$3 WHERE id=$1 AND org_id=$2", [id, ctx.orgId, quoteId]);
  await audit(ctx.db, {
    orgId: ctx.orgId,
    userId: ctx.userId,
    action: "energy_diagnosis.quote",
    target: id,
    data: { quoteId, works: works.length },
    ip: ctx.ip,
  });
  return quoteId;
}

/** Parcours complet du diagnostic au versement de l'aide */
export async function energyJourney(ctx: Ctx, id: string, now = new Date()) {
  const r = await getDiagnosis(ctx, id);
  const day = (d: Date | string | null | undefined) => (d ? parisDate(new Date(d)) : null);
  const f = r.quote_id
    ? await one<{
        issued_at: Date | null;
        accepted: boolean;
        responded_at: Date | null;
        aid: string | null;
        job_status: string | null;
        start_date: Date | string | null;
        reception_date: Date | string | null;
        invoice_at: Date | null;
      }>(
        ctx.db,
        `SELECT q.issued_at, q.accepted_version IS NOT NULL AS accepted, q.responded_at, q.energy_aid->>'estimatedAid' AS aid,
                j.status AS job_status, j.start_date, rc.reception_date,
                (SELECT max(i.issued_at) FROM invoices i WHERE i.quote_id=q.id AND i.kind='final') AS invoice_at
         FROM quotes q LEFT JOIN jobs j ON j.quote_id=q.id LEFT JOIN job_receptions rc ON rc.job_id=j.id AND rc.decision <> 'refus'
         WHERE q.id=$1 AND q.org_id=$2`,
        [r.quote_id, ctx.orgId],
      )
    : null;
  const quotedAid = Number(String(f?.aid ?? "").replace(",", "."));
  const steps = readAidSteps((await one<{ aid_steps: unknown }>(ctx.db, "SELECT aid_steps FROM energy_diagnoses WHERE id=$1", [id]))?.aid_steps);
  const dateOnly = (d: Date | string | null | undefined) => (d == null ? null : typeof d === "string" ? d.slice(0, 10) : parisDate(d));
  const journey = buildJourney(
    {
      diagnosedOn: day(r.created_at)!,
      quoteNumber: r.quote_number,
      quoteIssuedOn: day(f?.issued_at),
      acceptedOn: f?.accepted ? day(f.responded_at) : null,
      jobStatus: f?.job_status ?? null,
      jobStartOn: dateOnly(f?.start_date),
      receptionOn: dateOnly(f?.reception_date),
      finalInvoiceOn: day(f?.invoice_at),
      estimatedAid: quotedAid > 0 ? quotedAid : r.diagnosis.bestAid,
    },
    steps,
    parisDate(now),
  );
  return { diagnosis: r, ...journey };
}

/** Coche ou décoche une étape du dossier d'aide, avec sa date et, le cas échéant, le montant */
export async function setAidStep(ctx: Ctx, id: string, key: string, raw: unknown | null) {
  requireWritable(ctx);
  if (!isAidStep(key)) throw badRequest("Étape inconnue");
  await getDiagnosis(ctx, id);
  if (raw == null) {
    await ctx.db.query("UPDATE energy_diagnoses SET aid_steps = aid_steps - $3 WHERE id=$1 AND org_id=$2", [id, ctx.orgId, key]);
  } else {
    const p = aidStepSchema.safeParse(raw);
    if (!p.success) throw badRequest(p.error.issues[0].message);
    if (p.data.on > parisDate(new Date())) throw badRequest("La date ne peut pas être dans le futur");
    await ctx.db.query("UPDATE energy_diagnoses SET aid_steps = jsonb_set(aid_steps, ARRAY[$3], $4::jsonb) WHERE id=$1 AND org_id=$2", [
      id,
      ctx.orgId,
      key,
      JSON.stringify(p.data),
    ]);
  }
  await audit(ctx.db, { orgId: ctx.orgId, userId: ctx.userId, action: "energy_diagnosis.aid_step", target: id, data: { key, done: raw != null }, ip: ctx.ip });
}
