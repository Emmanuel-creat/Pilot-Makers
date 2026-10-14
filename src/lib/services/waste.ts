/**
 * Déchets des chantiers : évacuations notées au fil du chantier (catégorie, quantité, installation,
 * bordereau), bilan par chantier et registre chronologique des déchets sortants de l'entreprise.
 */

import { z } from "zod";
import { toCsv } from "@/lib/csv";
import { num, one } from "@/lib/db";
import { badRequest, isUuid, notFound } from "@/lib/http";
import { categoryByKey, REGISTER_HEADERS, registerRow, WASTE_UNITS, type WasteEntry, type WasteUnit } from "@/lib/waste";
import type { Ctx } from "./context";
import { audit, requireWritable } from "./context";
import { eurosToCents } from "./pricing";
import { parisDate } from "./quotes";

const day = (v: unknown) => (v instanceof Date ? v.toISOString() : String(v)).slice(0, 10);

function mapEntry(r: Record<string, unknown>): WasteEntry {
  return {
    id: String(r.id),
    date: day(r.removed_on),
    category: String(r.category),
    quantity: Number(r.quantity),
    unit: r.unit as WasteUnit,
    destination: String(r.destination),
    carrier: String(r.carrier),
    slipRef: String(r.slip_ref),
    sorted: Boolean(r.sorted),
    costCents: num(r.cost_cents),
  };
}

export async function listJobWaste(ctx: Ctx, jobId: string): Promise<WasteEntry[]> {
  if (!isUuid(jobId)) return [];
  const rows = await ctx.db.query<Record<string, unknown>>("SELECT * FROM job_waste WHERE job_id=$1 AND org_id=$2 ORDER BY removed_on, created_at", [
    jobId,
    ctx.orgId,
  ]);
  return rows.map(mapEntry);
}

const schema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date d'évacuation invalide"),
  category: z.string().refine((v) => !!categoryByKey(v), "Choisissez la nature du déchet"),
  quantity: z
    .string()
    .trim()
    .transform((v) => Number(v.replace(",", ".")))
    .refine((v) => Number.isFinite(v) && v > 0 && v < 100000, "Quantité invalide"),
  unit: z.enum(Object.keys(WASTE_UNITS) as [WasteUnit, ...WasteUnit[]]),
  destination: z.string().trim().max(200).default(""),
  carrier: z.string().trim().max(200).default(""),
  slipRef: z.string().trim().max(60).default(""),
  sorted: z.preprocess((v) => v === true || v === "on" || v === "true", z.boolean()),
  cost: z.string().trim().max(20).default(""),
});

export async function addJobWaste(ctx: Ctx, jobId: string, raw: unknown, now = new Date()) {
  requireWritable(ctx);
  const p = schema.safeParse(raw);
  if (!p.success) throw badRequest(p.error.issues[0].message);
  const v = p.data;
  if (v.date > parisDate(now)) throw badRequest("La date d'évacuation ne peut pas être dans le futur");
  const c = categoryByKey(v.category)!;
  if (c.slip === "BSDA" && !v.slipRef) throw badRequest("L'amiante s'évacue avec un bordereau BSDA : indiquez son numéro");
  const costCents = eurosToCents(v.cost, "Coût");
  if (!isUuid(jobId) || !(await one(ctx.db, "SELECT 1 FROM jobs WHERE id=$1 AND org_id=$2", [jobId, ctx.orgId]))) throw notFound("Chantier introuvable");
  const r = await one<{ id: string }>(
    ctx.db,
    `INSERT INTO job_waste (org_id, job_id, removed_on, category, quantity, unit, destination, carrier, slip_ref, sorted, cost_cents, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id`,
    [ctx.orgId, jobId, v.date, v.category, v.quantity, v.unit, v.destination, v.carrier, v.slipRef, v.sorted, costCents, ctx.userId],
  );
  await audit(ctx.db, { orgId: ctx.orgId, userId: ctx.userId, action: "job.waste_add", target: r!.id, data: { category: v.category }, ip: ctx.ip });
  return r!.id;
}

export async function deleteJobWaste(ctx: Ctx, id: string) {
  requireWritable(ctx);
  if (!isUuid(id)) throw notFound("Évacuation introuvable");
  const r = await one<{ job_id: string }>(ctx.db, "DELETE FROM job_waste WHERE id=$1 AND org_id=$2 RETURNING job_id", [id, ctx.orgId]);
  if (!r) throw notFound("Évacuation introuvable");
  await audit(ctx.db, { orgId: ctx.orgId, userId: ctx.userId, action: "job.waste_delete", target: id, ip: ctx.ip });
  return r.job_id;
}

export interface RegisterLine {
  entry: WasteEntry;
  jobId: string;
  jobTitle: string;
  address: string;
}

/** Évacuations de l'entreprise sur une année, la plus récente en premier. */
export async function wasteRegister(ctx: Ctx, year: number): Promise<RegisterLine[]> {
  if (!Number.isInteger(year) || year < 2000 || year > 2100) throw badRequest("Année invalide");
  const rows = await ctx.db.query<Record<string, unknown>>(
    `SELECT w.*, j.title, j.site_line1, j.site_postal_code, j.site_city FROM job_waste w JOIN jobs j ON j.id=w.job_id
     WHERE w.org_id=$1 AND w.removed_on BETWEEN $2 AND $3 ORDER BY w.removed_on DESC, w.created_at DESC`,
    [ctx.orgId, `${year}-01-01`, `${year}-12-31`],
  );
  return rows.map((r) => ({
    entry: mapEntry(r),
    jobId: String(r.job_id),
    jobTitle: String(r.title),
    address: [r.site_line1, [r.site_postal_code, r.site_city].filter(Boolean).join(" ")].filter(Boolean).join(", "),
  }));
}

/** Registre chronologique des déchets sortants, à conserver trois ans. */
export async function wasteRegisterCsv(ctx: Ctx, year: number) {
  const lines = (await wasteRegister(ctx, year)).reverse();
  return toCsv(
    REGISTER_HEADERS,
    lines.map((l) => registerRow(l.entry, { title: l.jobTitle, address: l.address })),
  );
}
