/**
 * Sur le chantier : journal (notes et photos datées, géolocalisées si l'appareil le permet),
 * procès-verbal de réception signé sur l'écran, puis suivi et levée des réserves.
 */

import { z } from "zod";
import { num, one } from "@/lib/db";
import { badRequest, conflict, notFound } from "@/lib/http";
import { renderLiftingPdf, renderReceptionPdf, type LiftedReserve, type ReceptionDecision, type ReceptionSnapshot } from "@/lib/pdf/reception-pdf";
import { sha256 } from "@/lib/security";
import type { Ctx } from "./context";
import { audit, requireWritable } from "./context";
import { customerDisplayName, type Customer } from "./customers";
import { getJob } from "./jobs";
import { orgRow } from "./quotes";

/* ------------------------------------------------------------------ */
/* Journal de chantier                                                 */
/* ------------------------------------------------------------------ */

export const PHOTO_MAX_BYTES = 2_500_000;
export const PHOTOS_PER_JOB = 300;

/** Type réel de l'image, d'après ses premiers octets (le type annoncé par le navigateur ne suffit pas). */
export function imageType(bytes: Uint8Array): "image/jpeg" | "image/png" | "image/webp" | null {
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return "image/png";
  if (String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP") return "image/webp";
  return null;
}

export interface JournalEntry {
  id: string;
  note: string;
  has_photo: boolean;
  taken_at: Date;
  latitude: number | null;
  longitude: number | null;
  author_name: string | null;
}

export async function addJournalEntry(
  ctx: Ctx,
  jobId: string,
  input: { note?: string; photo?: Uint8Array | null; takenAt?: string; latitude?: string | number | null; longitude?: string | number | null },
) {
  requireWritable(ctx);
  await getJob(ctx, jobId);
  const note = String(input.note ?? "").trim();
  if (note.length > 4000) throw badRequest("Note trop longue (4 000 caractères au plus)");
  const photo = input.photo && input.photo.length ? input.photo : null;
  if (!note && !photo) throw badRequest("Ajoutez une photo ou une note");
  let type: string | null = null;
  if (photo) {
    if (photo.length > PHOTO_MAX_BYTES) throw badRequest("Photo trop lourde (2,5 Mo au plus)");
    type = imageType(photo);
    if (!type) throw badRequest("Format de photo non reconnu (JPEG, PNG ou WebP)");
    const count = await one<{ n: unknown }>(ctx.db, "SELECT count(*) AS n FROM job_journal WHERE job_id=$1 AND photo IS NOT NULL", [jobId]);
    if (num(count?.n) >= PHOTOS_PER_JOB) throw conflict(`${PHOTOS_PER_JOB} photos au plus par chantier`);
  }
  const lat = input.latitude === null || input.latitude === undefined || input.latitude === "" ? null : Number(input.latitude);
  const lng = input.longitude === null || input.longitude === undefined || input.longitude === "" ? null : Number(input.longitude);
  const geo = lat !== null && lng !== null && Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
  const now = new Date();
  let taken = input.takenAt ? new Date(input.takenAt) : now;
  // Date de prise de vue : jamais dans le futur, ni plus d'un an en arrière.
  if (Number.isNaN(taken.getTime()) || taken > new Date(now.getTime() + 5 * 60_000) || taken < new Date(now.getTime() - 366 * 86_400_000))
    taken = now;
  const row = await one<{ id: string }>(
    ctx.db,
    `INSERT INTO job_journal (org_id, job_id, author_id, note, photo, photo_type, photo_sha256, taken_at, latitude, longitude)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,
    [ctx.orgId, jobId, ctx.userId, note, photo, type, photo ? sha256(photo) : null, taken, geo ? lat : null, geo ? lng : null],
  );
  return row!.id;
}

export async function listJournal(ctx: Ctx, jobId: string): Promise<JournalEntry[]> {
  const rows = await ctx.db.query<Record<string, unknown>>(
    `SELECT j.id, j.note, j.photo IS NOT NULL AS has_photo, j.taken_at, j.latitude, j.longitude, u.name AS author_name
     FROM job_journal j LEFT JOIN users u ON u.id=j.author_id WHERE j.job_id=$1 AND j.org_id=$2 ORDER BY j.taken_at DESC LIMIT 500`,
    [jobId, ctx.orgId],
  );
  return rows.map((r) => ({
    ...(r as unknown as JournalEntry),
    latitude: r.latitude === null ? null : Number(r.latitude),
    longitude: r.longitude === null ? null : Number(r.longitude),
  }));
}

export async function journalPhoto(ctx: Ctx, entryId: string) {
  const r = await one<{ photo: Uint8Array | null; photo_type: string | null; photo_sha256: string | null }>(
    ctx.db,
    "SELECT photo, photo_type, photo_sha256 FROM job_journal WHERE id=$1 AND org_id=$2",
    [entryId, ctx.orgId],
  );
  if (!r?.photo) throw notFound("Photo introuvable");
  return { bytes: r.photo, type: r.photo_type ?? "image/jpeg", sha256: r.photo_sha256 ?? "" };
}

export async function deleteJournalEntry(ctx: Ctx, entryId: string) {
  requireWritable(ctx);
  const r = await ctx.db.query<{ job_id: string }>("DELETE FROM job_journal WHERE id=$1 AND org_id=$2 RETURNING job_id", [entryId, ctx.orgId]);
  if (!r.length) throw notFound("Élément introuvable");
  return r[0].job_id;
}

/* ------------------------------------------------------------------ */
/* Réception et réserves                                               */
/* ------------------------------------------------------------------ */

const SIGNATURE = /^data:image\/png;base64,[A-Za-z0-9+/=]+$/;

const receptionSchema = z.object({
  decision: z.enum(["sans_reserve", "avec_reserves", "refus"]),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date de réception invalide"),
  place: z.string().trim().max(120).default(""),
  refusalReason: z.string().trim().max(2000).default(""),
  reserves: z
    .array(z.object({ label: z.string().trim().max(500), location: z.string().trim().max(200).default(""), dueDate: z.string().trim().default("") }))
    .max(100)
    .default([]),
  clientName: z.string().trim().min(2, "Nom du maître d'ouvrage requis").max(120),
  clientSignature: z.string().max(400_000).regex(SIGNATURE, "Signature du maître d'ouvrage requise"),
  companyName: z.string().trim().min(2, "Nom du représentant de l'entreprise requis").max(120),
  companySignature: z.string().max(400_000).regex(SIGNATURE, "Signature de l'entreprise requise"),
});

const addressOf = (...parts: (string | null | undefined)[]) => parts.filter((p) => p && String(p).trim()).join(", ");

/** Signe le procès-verbal de réception : PDF figé, réserves ouvertes, chantier réceptionné (sauf refus). */
export async function signReception(ctx: Ctx, jobId: string, raw: unknown) {
  requireWritable(ctx);
  const p = receptionSchema.safeParse(raw);
  if (!p.success) throw badRequest(p.error.issues[0].message);
  const d = p.data;
  const reserves = d.reserves.filter((r) => r.label);
  if (d.decision === "avec_reserves" && !reserves.length) throw badRequest("Indiquez au moins une réserve, ou choisissez une réception sans réserve");
  if (d.decision === "refus" && !d.refusalReason) throw badRequest("Indiquez le motif du refus");
  for (const r of reserves) if (r.dueDate && !/^\d{4}-\d{2}-\d{2}$/.test(r.dueDate)) throw badRequest("Délai de levée invalide");
  const now = new Date();
  if (d.date > now.toISOString().slice(0, 10)) throw badRequest("La date de réception ne peut pas être dans le futur");
  return ctx.db.transaction(async (tx) => {
    const { job } = await getJob(ctx, jobId, tx);
    if (await one(tx, "SELECT 1 FROM job_receptions WHERE job_id=$1", [jobId])) throw conflict("Le procès-verbal de réception est déjà signé");
    const org = await orgRow(tx, ctx.orgId);
    const customer = job.customer_id
      ? await one<Customer>(tx, "SELECT * FROM customers WHERE id=$1 AND org_id=$2", [job.customer_id, ctx.orgId])
      : null;
    const snapshot: ReceptionSnapshot = {
      date: d.date,
      place: d.place || job.site_city || org.city,
      decision: d.decision as ReceptionDecision,
      refusalReason: d.decision === "refus" ? d.refusalReason : "",
      job: { title: job.title, address: addressOf(job.site_line1, job.site_line2, [job.site_postal_code, job.site_city].filter(Boolean).join(" ")) },
      quoteNumber: job.quote_number ?? null,
      org: {
        name: org.legal_name || org.trade_name,
        address: addressOf(org.address_line1, org.address_line2, `${org.postal_code} ${org.city}`),
        siret: org.siret,
      },
      customer: customer
        ? {
            name: customerDisplayName(customer),
            address: addressOf(
              customer.billing_line1,
              customer.billing_line2,
              [customer.billing_postal_code, customer.billing_city].filter(Boolean).join(" "),
            ),
          }
        : { name: d.clientName, address: "" },
      reserves: d.decision === "avec_reserves" ? reserves.map((r) => ({ label: r.label, location: r.location, dueDate: r.dueDate || null })) : [],
      client: { name: d.clientName, signature: d.clientSignature },
      company: { name: d.companyName, signature: d.companySignature },
      signedAt: now.toISOString(),
    };
    const pdf = await renderReceptionPdf(snapshot);
    const hash = sha256(pdf);
    await tx.query(
      "INSERT INTO job_receptions (org_id, job_id, decision, reception_date, snapshot, pdf, pdf_sha256, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)",
      [ctx.orgId, jobId, d.decision, d.date, JSON.stringify(snapshot), pdf, hash, ctx.userId],
    );
    let position = 0;
    for (const r of snapshot.reserves) {
      await tx.query("INSERT INTO job_reserves (org_id, job_id, position, label, location, due_date) VALUES ($1,$2,$3,$4,$5,$6)", [
        ctx.orgId,
        jobId,
        position++,
        r.label,
        r.location,
        r.dueDate,
      ]);
    }
    await tx.query("UPDATE jobs SET status=$3, updated_at=now() WHERE id=$1 AND org_id=$2", [
      jobId,
      ctx.orgId,
      d.decision === "refus" ? "termine" : "receptionne",
    ]);
    await audit(tx, {
      orgId: ctx.orgId,
      userId: ctx.userId,
      action: "job.reception",
      target: jobId,
      data: { decision: d.decision, reserves: snapshot.reserves.length, pdf_sha256: hash },
      ip: ctx.ip,
    });
    return { pdfSha256: hash };
  });
}

export interface Reserve {
  id: string;
  position: number;
  label: string;
  location: string;
  due_date: string | null;
  lifted_at: Date | null;
  lifted_note: string;
}

export async function getReception(ctx: Ctx, jobId: string) {
  const r = await one<{ decision: ReceptionDecision; reception_date: unknown; snapshot: ReceptionSnapshot; pdf_sha256: string; created_at: Date }>(
    ctx.db,
    "SELECT decision, reception_date, snapshot, pdf_sha256, created_at FROM job_receptions WHERE job_id=$1 AND org_id=$2",
    [jobId, ctx.orgId],
  );
  const reserves = (
    await ctx.db.query<Record<string, unknown>>("SELECT * FROM job_reserves WHERE job_id=$1 AND org_id=$2 ORDER BY position", [jobId, ctx.orgId])
  ).map((x) => ({
    ...(x as unknown as Reserve),
    position: num(x.position),
    due_date: x.due_date ? (x.due_date instanceof Date ? x.due_date.toISOString().slice(0, 10) : String(x.due_date).slice(0, 10)) : null,
  }));
  return { reception: r, reserves, open: reserves.filter((x) => !x.lifted_at).length };
}

export async function receptionPdf(ctx: Ctx, jobId: string) {
  const r = await one<{ pdf: Uint8Array; pdf_sha256: string }>(ctx.db, "SELECT pdf, pdf_sha256 FROM job_receptions WHERE job_id=$1 AND org_id=$2", [
    jobId,
    ctx.orgId,
  ]);
  if (!r) throw notFound("Aucun procès-verbal de réception");
  return r;
}

export async function liftReserve(ctx: Ctx, reserveId: string, note: string) {
  requireWritable(ctx);
  const text = String(note ?? "").trim();
  if (text.length > 1000) throw badRequest("Commentaire trop long");
  const r = await ctx.db.query<{ job_id: string }>(
    "UPDATE job_reserves SET lifted_at=now(), lifted_note=$3, lifted_by=$4 WHERE id=$1 AND org_id=$2 AND lifted_at IS NULL RETURNING job_id",
    [reserveId, ctx.orgId, text, ctx.userId],
  );
  if (!r.length) throw conflict("Réserve introuvable ou déjà levée");
  await audit(ctx.db, { orgId: ctx.orgId, userId: ctx.userId, action: "job.reserve_lifted", target: reserveId, ip: ctx.ip });
  return r[0].job_id;
}

/** Procès-verbal de levée des réserves, une fois toutes levées. */
export async function liftingPdf(ctx: Ctx, jobId: string) {
  const { reception, reserves, open } = await getReception(ctx, jobId);
  if (!reception) throw notFound("Aucun procès-verbal de réception");
  if (!reserves.length) throw badRequest("La réception a été prononcée sans réserve");
  if (open) throw conflict(`${open} réserve${open > 1 ? "s" : ""} encore à lever`);
  const lifted: LiftedReserve[] = reserves.map((r) => ({
    label: r.label,
    location: r.location,
    liftedAt: new Date(r.lifted_at!).toISOString(),
    note: r.lifted_note,
  }));
  const last = lifted
    .map((l) => l.liftedAt)
    .sort()
    .at(-1)!;
  return renderLiftingPdf(reception.snapshot, lifted, last);
}
