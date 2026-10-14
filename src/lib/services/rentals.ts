/**
 * Location de matériel pour les chantiers : contrats en cours, retards de restitution, et coût
 * reporté sur le chantier au retour du matériel.
 */

import { z } from "zod";
import { num, one } from "@/lib/db";
import { badRequest, isUuid, notFound } from "@/lib/http";
import { RENTAL_PERIODS, rentalCost, rentalState, type Rental, type RentalPeriod } from "@/lib/rentals";
import type { Ctx } from "./context";
import { audit, requireWritable } from "./context";
import { eurosToCents } from "./pricing";
import { parisDate } from "./quotes";

const day = (v: unknown) => (v == null ? null : (v instanceof Date ? v.toISOString() : String(v)).slice(0, 10));

export interface JobRental extends Rental {
  jobId: string;
  jobTitle: string;
}

function mapRental(r: Record<string, unknown>): JobRental {
  return {
    id: String(r.id),
    jobId: String(r.job_id),
    jobTitle: String(r.job_title ?? ""),
    equipment: String(r.equipment),
    renter: String(r.renter),
    startDate: day(r.start_date)!,
    endDate: day(r.end_date)!,
    returnedOn: day(r.returned_on),
    rateCents: num(r.rate_cents),
    period: r.period as RentalPeriod,
    deliveryCents: num(r.delivery_cents),
    insuranceBp: Number(r.insurance_bp),
    reference: String(r.reference),
  };
}

const SELECT = "SELECT r.*, j.title AS job_title FROM job_rentals r JOIN jobs j ON j.id=r.job_id";

export async function listJobRentals(ctx: Ctx, jobId: string): Promise<JobRental[]> {
  if (!isUuid(jobId)) return [];
  const rows = await ctx.db.query<Record<string, unknown>>(`${SELECT} WHERE r.job_id=$1 AND r.org_id=$2 ORDER BY r.start_date, r.created_at`, [
    jobId,
    ctx.orgId,
  ]);
  return rows.map(mapRental);
}

/** Matériel loué pas encore rendu, tous chantiers confondus, le retour le plus proche en premier. */
export async function openRentals(ctx: Ctx, now = new Date()) {
  const rows = await ctx.db.query<Record<string, unknown>>(`${SELECT} WHERE r.org_id=$1 AND r.returned_on IS NULL ORDER BY r.end_date, r.created_at`, [
    ctx.orgId,
  ]);
  const today = parisDate(now);
  return rows.map(mapRental).map((r) => ({ ...r, state: rentalState(r, today), cost: rentalCost(r, today) }));
}

const dateText = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date invalide");
const schema = z.object({
  equipment: z.string().trim().min(2, "Indiquez le matériel loué").max(200),
  renter: z.string().trim().max(120).default(""),
  startDate: dateText,
  endDate: dateText,
  rate: z.string().trim().min(1, "Indiquez le tarif de location"),
  period: z.enum(Object.keys(RENTAL_PERIODS) as [RentalPeriod, ...RentalPeriod[]]),
  delivery: z.string().trim().default(""),
  insurance: z
    .string()
    .trim()
    .default("")
    .transform((v) => (v === "" ? 0 : Number(v.replace(",", "."))))
    .refine((v) => Number.isFinite(v) && v >= 0 && v <= 50, "Assurance : 50 % au plus"),
  reference: z.string().trim().max(80).default(""),
});

export async function addRental(ctx: Ctx, jobId: string, raw: unknown) {
  requireWritable(ctx);
  const p = schema.safeParse(raw);
  if (!p.success) throw badRequest(p.error.issues[0].message);
  const v = p.data;
  if (v.endDate < v.startDate) throw badRequest("La fin de location doit suivre le début");
  let rate: number;
  let delivery: number;
  try {
    rate = eurosToCents(v.rate, "Tarif");
    delivery = eurosToCents(v.delivery, "Transport");
  } catch (e) {
    throw badRequest((e as Error).message);
  }
  if (!isUuid(jobId) || !(await one(ctx.db, "SELECT 1 FROM jobs WHERE id=$1 AND org_id=$2", [jobId, ctx.orgId]))) throw notFound("Chantier introuvable");
  const r = await one<{ id: string }>(
    ctx.db,
    `INSERT INTO job_rentals (org_id, job_id, equipment, renter, start_date, end_date, rate_cents, period, delivery_cents, insurance_bp, reference, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id`,
    [ctx.orgId, jobId, v.equipment, v.renter, v.startDate, v.endDate, rate, v.period, delivery, Math.round(v.insurance * 100), v.reference, ctx.userId],
  );
  await audit(ctx.db, { orgId: ctx.orgId, userId: ctx.userId, action: "job.rental_add", target: r!.id, ip: ctx.ip });
  return r!.id;
}

/** Restitution : le coût réel de la location est ajouté aux coûts du chantier. */
export async function returnRental(ctx: Ctx, id: string, date: string, now = new Date()) {
  requireWritable(ctx);
  if (!isUuid(id)) throw notFound("Location introuvable");
  if (!dateText.safeParse(date).success) throw badRequest("Date de retour invalide");
  if (date > parisDate(now)) throw badRequest("La date de retour ne peut pas être dans le futur");
  const row = await one<Record<string, unknown>>(ctx.db, `${SELECT} WHERE r.id=$1 AND r.org_id=$2`, [id, ctx.orgId]);
  if (!row) throw notFound("Location introuvable");
  const r = mapRental(row);
  if (r.returnedOn) throw badRequest("Ce matériel est déjà rendu");
  if (date < r.startDate) throw badRequest("Le retour ne peut pas précéder le début de la location");
  const cost = rentalCost({ ...r, returnedOn: date }, date);
  await ctx.db.transaction(async (tx) => {
    const p = await one<{ id: string }>(
      tx,
      `INSERT INTO job_purchases (org_id, job_id, purchase_date, supplier, label, category, amount_ht_cents, reference, created_by)
       VALUES ($1,$2,$3,$4,$5,'location',$6,$7,$8) RETURNING id`,
      [
        ctx.orgId,
        r.jobId,
        date,
        r.renter,
        `Location : ${r.equipment} (${cost.days} jour${cost.days > 1 ? "s" : ""})`,
        cost.totalCents,
        r.reference,
        ctx.userId,
      ],
    );
    await tx.query("UPDATE job_rentals SET returned_on=$3, purchase_id=$4 WHERE id=$1 AND org_id=$2", [id, ctx.orgId, date, p!.id]);
  });
  await audit(ctx.db, { orgId: ctx.orgId, userId: ctx.userId, action: "job.rental_return", target: id, data: { cents: cost.totalCents }, ip: ctx.ip });
  return { jobId: r.jobId, cost };
}

export async function deleteRental(ctx: Ctx, id: string) {
  requireWritable(ctx);
  if (!isUuid(id)) throw notFound("Location introuvable");
  const r = await one<{ job_id: string; returned_on: unknown }>(ctx.db, "SELECT job_id, returned_on FROM job_rentals WHERE id=$1 AND org_id=$2", [
    id,
    ctx.orgId,
  ]);
  if (!r) throw notFound("Location introuvable");
  if (r.returned_on) throw badRequest("Une location rendue reste dans les coûts du chantier : supprimez l'achat correspondant si besoin");
  await ctx.db.query("DELETE FROM job_rentals WHERE id=$1 AND org_id=$2", [id, ctx.orgId]);
  return r.job_id;
}
