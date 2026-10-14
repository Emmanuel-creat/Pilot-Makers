/** Demandes de financement d'équipement : saisie, simulation, dossier PDF pour le financeur et suivi de la réponse. */

import { z } from "zod";
import { one } from "@/lib/db";
import {
  burden,
  DEFAULT_RATE_BP,
  dossierChecks,
  EQUIPMENT_CATEGORIES,
  FINANCING_KINDS,
  FINANCING_STATUSES,
  simulate,
  type EquipmentCategory,
  type FinancingKind,
  type FinancingStatus,
} from "@/lib/financing";
import { badRequest, isUuid, notFound } from "@/lib/http";
import { renderFinancingPdf } from "@/lib/pdf/financing-pdf";
import type { Ctx } from "./context";
import { audit, requirePermission, requireWritable } from "./context";
import { eurosToCents } from "./pricing";
import { parisDate } from "./quotes";

export interface FinancingRequest {
  id: string;
  label: string;
  category: EquipmentCategory;
  supplier: string;
  quoteRef: string;
  amountCents: number;
  downCents: number;
  kind: FinancingKind;
  months: number;
  rateBp: number;
  residualBp: number;
  purpose: string;
  lender: string;
  status: FinancingStatus;
  createdAt: string;
}

function map(r: Record<string, unknown>): FinancingRequest {
  return {
    id: String(r.id),
    label: String(r.label),
    category: r.category as EquipmentCategory,
    supplier: String(r.supplier),
    quoteRef: String(r.quote_ref),
    amountCents: Number(r.amount_cents),
    downCents: Number(r.down_payment_cents),
    kind: r.kind as FinancingKind,
    months: Number(r.months),
    rateBp: Number(r.rate_bp),
    residualBp: Number(r.residual_bp),
    purpose: String(r.purpose),
    lender: String(r.lender),
    status: r.status as FinancingStatus,
    createdAt: new Date(r.created_at as string).toISOString(),
  };
}

export async function listFinancing(ctx: Ctx) {
  requirePermission(ctx, "settings");
  const rows = await ctx.db.query<Record<string, unknown>>("SELECT * FROM financing_requests WHERE org_id=$1 ORDER BY created_at DESC LIMIT 100", [ctx.orgId]);
  return rows.map(map);
}

const pct = (label: string, max: number) =>
  z
    .string()
    .trim()
    .default("")
    .transform((v, c) => {
      const n = v === "" ? NaN : Number(v.replace(",", ".").replace("%", ""));
      if (v !== "" && (!Number.isFinite(n) || n < 0 || n > max)) c.addIssue({ code: "custom", message: `${label} invalide` });
      return v === "" ? null : Math.round(n * 100);
    });

const schema = z.object({
  label: z.string().trim().min(2, "Indiquez l'équipement").max(160),
  category: z.enum(Object.keys(EQUIPMENT_CATEGORIES) as [EquipmentCategory, ...EquipmentCategory[]]),
  supplier: z.string().trim().max(120).default(""),
  quoteRef: z.string().trim().max(80).default(""),
  amount: z.string().default(""),
  down: z.string().default(""),
  kind: z.enum(Object.keys(FINANCING_KINDS) as [FinancingKind, ...FinancingKind[]]),
  months: z.coerce.number().int().min(6, "Durée de 6 à 120 mois").max(120, "Durée de 6 à 120 mois"),
  rate: pct("Taux", 30),
  residual: pct("Valeur résiduelle", 50),
  purpose: z.string().trim().max(1000).default(""),
  lender: z.string().trim().max(120).default(""),
});

function parse(raw: unknown) {
  const p = schema.safeParse(raw);
  if (!p.success) throw badRequest(p.error.issues[0].message);
  const v = p.data;
  let amount: number;
  let down: number;
  try {
    amount = eurosToCents(v.amount, "Montant");
    down = eurosToCents(v.down, "Apport");
  } catch (e) {
    throw badRequest((e as Error).message);
  }
  if (amount <= 0) throw badRequest("Indiquez le montant HT de l'équipement");
  if (down >= amount) throw badRequest("L'apport doit être inférieur au montant");
  return { ...v, amount, down, rateBp: v.rate ?? DEFAULT_RATE_BP[v.kind], residualBp: v.residual ?? 0 };
}

export async function saveFinancing(ctx: Ctx, id: string | null, raw: unknown) {
  requireWritable(ctx);
  requirePermission(ctx, "settings");
  const v = parse(raw);
  const values = [v.label, v.category, v.supplier, v.quoteRef, v.amount, v.down, v.kind, v.months, v.rateBp, v.residualBp, v.purpose, v.lender];
  if (id) {
    if (!isUuid(id)) throw notFound("Demande introuvable");
    const r = await one(
      ctx.db,
      `UPDATE financing_requests SET label=$3, category=$4, supplier=$5, quote_ref=$6, amount_cents=$7, down_payment_cents=$8, kind=$9, months=$10,
         rate_bp=$11, residual_bp=$12, purpose=$13, lender=$14 WHERE id=$1 AND org_id=$2 RETURNING id`,
      [id, ctx.orgId, ...values],
    );
    if (!r) throw notFound("Demande introuvable");
    return id;
  }
  const r = await one<{ id: string }>(
    ctx.db,
    `INSERT INTO financing_requests (org_id, label, category, supplier, quote_ref, amount_cents, down_payment_cents, kind, months, rate_bp, residual_bp, purpose, lender, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING id`,
    [ctx.orgId, ...values, ctx.userId],
  );
  await audit(ctx.db, { orgId: ctx.orgId, userId: ctx.userId, action: "financing.create", target: r!.id, ip: ctx.ip });
  return r!.id;
}

export async function setFinancingStatus(ctx: Ctx, id: string, status: string) {
  requireWritable(ctx);
  requirePermission(ctx, "settings");
  if (!(status in FINANCING_STATUSES)) throw badRequest("Statut inconnu");
  if (!isUuid(id)) throw notFound("Demande introuvable");
  const r = await one(
    ctx.db,
    `UPDATE financing_requests SET status=$3,
       sent_at = CASE WHEN $3='envoyee' THEN coalesce(sent_at, now()) ELSE sent_at END,
       decided_at = CASE WHEN $3 IN ('accordee', 'refusee') THEN now() ELSE NULL END
     WHERE id=$1 AND org_id=$2 RETURNING id`,
    [id, ctx.orgId, status],
  );
  if (!r) throw notFound("Demande introuvable");
  await audit(ctx.db, { orgId: ctx.orgId, userId: ctx.userId, action: "financing.status", target: id, data: { status }, ip: ctx.ip });
}

export async function deleteFinancing(ctx: Ctx, id: string) {
  requireWritable(ctx);
  requirePermission(ctx, "settings");
  if (!isUuid(id)) throw notFound("Demande introuvable");
  await ctx.db.query("DELETE FROM financing_requests WHERE id=$1 AND org_id=$2", [id, ctx.orgId]);
}

/** Demande, simulation, chiffre d'affaires des trois dernières années et pièces du dossier. */
export async function getFinancing(ctx: Ctx, id: string, now = new Date()) {
  requirePermission(ctx, "settings");
  if (!isUuid(id)) throw notFound("Demande introuvable");
  const r = await one<Record<string, unknown>>(ctx.db, "SELECT * FROM financing_requests WHERE id=$1 AND org_id=$2", [id, ctx.orgId]);
  if (!r) throw notFound("Demande introuvable");
  const f = map(r);
  const today = parisDate(now);
  const year = Number(today.slice(0, 4));
  const [org, revenue, last12] = await Promise.all([
    one<Record<string, string>>(
      ctx.db,
      `SELECT coalesce(nullif(legal_name, ''), trade_name) AS name, legal_form, siret, address_line1, postal_code, city, phone, email, trade,
         insurance_name, created_at::text AS created_at FROM organizations WHERE id=$1`,
      [ctx.orgId],
    ),
    ctx.db.query<{ y: unknown; ht: unknown }>(
      `SELECT extract(year FROM issue_date) AS y, sum(CASE WHEN kind='credit_note' THEN -total_ht_cents ELSE total_ht_cents END) AS ht
       FROM invoices WHERE org_id=$1 AND issue_date >= $2 AND issue_date < $3 GROUP BY 1 ORDER BY 1`,
      [ctx.orgId, `${year - 3}-01-01`, `${year}-01-01`],
    ),
    one<{ ht: unknown }>(
      ctx.db,
      `SELECT coalesce(sum(CASE WHEN kind='credit_note' THEN -total_ht_cents ELSE total_ht_cents END), 0) AS ht
       FROM invoices WHERE org_id=$1 AND issue_date > ($2::date - interval '12 months') AND issue_date <= $2::date`,
      [ctx.orgId, today],
    ),
  ]);
  const years = revenue.map((x) => ({ year: Number(x.y), htCents: Number(x.ht) })).filter((x) => x.htCents > 0);
  const last12Cents = Number(last12?.ht ?? 0);
  const chosen = simulate(f.amountCents, f.downCents, f.rateBp, f.residualBp, [f.months])[0];
  return {
    request: f,
    org: {
      name: org?.name ?? "",
      legalForm: org?.legal_form ?? "",
      siret: org?.siret ?? "",
      address: [org?.address_line1, [org?.postal_code, org?.city].filter(Boolean).join(" ")].filter(Boolean).join(", "),
      contact: [org?.phone, org?.email].filter(Boolean).join(", "),
      trade: org?.trade ?? "",
      insurer: org?.insurance_name ?? "",
    },
    years,
    last12Cents,
    chosen,
    simulations: simulate(f.amountCents, f.downCents, f.rateBp, f.residualBp),
    burdenPct: burden(chosen.monthlyCents, last12Cents),
    checks: dossierChecks({
      siret: org?.siret ?? "",
      legalForm: org?.legal_form ?? "",
      yearsOfRevenue: years.length,
      quoteRef: f.quoteRef,
      supplier: f.supplier,
      insurer: org?.insurance_name ?? "",
    }),
    today,
  };
}

export type FinancingDossier = Awaited<ReturnType<typeof getFinancing>>;

export async function financingPdf(ctx: Ctx, id: string) {
  return renderFinancingPdf(await getFinancing(ctx, id));
}
