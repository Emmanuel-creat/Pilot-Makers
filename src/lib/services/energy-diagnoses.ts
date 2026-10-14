/** Diagnostics énergétiques simplifiés : enregistrement, relecture et devis des travaux retenus. */

import { randomUUID } from "node:crypto";
import { one } from "@/lib/db";
import { diagnose, diagnosisSchema, type DiagnosisInput, type WorkKey } from "@/lib/energy-diagnosis";
import { badRequest, isUuid, notFound } from "@/lib/http";
import type { Ctx } from "./context";
import { audit, requireWritable } from "./context";
import type { DraftLine } from "./quote-types";
import { createQuote, getDraft, saveDraft } from "./quotes";

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
