/**
 * Dossier des ouvrages exécutés d'un chantier, réuni à partir de ce que l'application connaît déjà :
 * tâches issues du devis accepté, documents des articles, réception et réserves, photos du journal.
 */

import { one } from "@/lib/db";
import { badRequest, isUuid, notFound } from "@/lib/http";
import { doeChecks, type DoeData, type DoeDocument } from "@/lib/doe";
import { renderDoePdf, type DoeAttachment, type DoePhoto } from "@/lib/pdf/doe-pdf";
import type { Ctx } from "./context";
import { audit, requireWritable } from "./context";
import { DOC_KINDS, type DocKind, type SnapshotDocument } from "./datasheets";
import { getReception, liftingPdf } from "./job-site";
import { getJob } from "./jobs";
import { parisDate } from "./quotes";

export const DOE_PHOTOS_MAX = 24;
const join = (...parts: unknown[]) =>
  parts
    .map((p) => String(p ?? "").trim())
    .filter(Boolean)
    .join(", ");
const day = (v: unknown) => (v instanceof Date ? v.toISOString() : String(v)).slice(0, 10);

async function snapshotDocuments(ctx: Ctx, quoteId: string | null): Promise<SnapshotDocument[]> {
  if (!quoteId) return [];
  const v = await one<{ snapshot: { documents?: SnapshotDocument[] } }>(
    ctx.db,
    `SELECT v.snapshot FROM quotes q JOIN quote_versions v ON v.quote_id=q.id AND v.version=q.accepted_version
     WHERE q.id=$1 AND q.org_id=$2`,
    [quoteId, ctx.orgId],
  );
  return v?.snapshot.documents ?? [];
}

export async function doeData(ctx: Ctx, jobId: string): Promise<DoeData & { docs: SnapshotDocument[] }> {
  if (!isUuid(jobId)) throw notFound("Chantier introuvable");
  const { job, tasks } = await getJob(ctx, jobId);
  const [org, customer, rec, photos, docs, notes] = await Promise.all([
    one<Record<string, unknown>>(ctx.db, "SELECT * FROM organizations WHERE id=$1", [ctx.orgId]),
    job.customer_id
      ? one<Record<string, unknown>>(ctx.db, "SELECT * FROM customers WHERE id=$1 AND org_id=$2", [job.customer_id, ctx.orgId])
      : Promise.resolve(null),
    getReception(ctx, jobId),
    one<{ n: string }>(ctx.db, "SELECT count(*) AS n FROM job_journal WHERE job_id=$1 AND org_id=$2 AND photo IS NOT NULL", [jobId, ctx.orgId]),
    snapshotDocuments(ctx, job.quote_id),
    one<{ doe_notes: string }>(ctx.db, "SELECT doe_notes FROM jobs WHERE id=$1", [jobId]),
  ]);
  const documents: DoeDocument[] = docs.map((d) => ({ kind: DOC_KINDS[d.kind as DocKind] ?? "Document", title: d.title, item: d.item }));
  return {
    job: {
      title: job.title,
      address: join(job.site_line1, job.site_line2, join(job.site_postal_code, job.site_city).replace(", ", " ")),
      startDate: job.start_date,
      endDate: job.end_date,
      quoteNumber: job.quote_number ?? null,
    },
    org: {
      name: String(org?.trade_name || org?.legal_name || ""),
      address: join(org?.address_line1, org?.address_line2, `${org?.postal_code ?? ""} ${org?.city ?? ""}`),
      siret: String(org?.siret ?? ""),
      phone: String(org?.phone ?? ""),
      email: String(org?.email ?? ""),
      insurer: String(org?.insurance_name ?? ""),
      policy: String(org?.insurance_policy ?? ""),
      area: String(org?.insurance_area ?? ""),
      decennale: Boolean(org?.insurance_decennale),
    },
    customer: {
      name: job.customer_name ?? "",
      address: customer ? join(customer.billing_line1, customer.billing_line2, `${customer.billing_postal_code ?? ""} ${customer.billing_city ?? ""}`) : "",
    },
    works: tasks.map((t) => ({ section: t.section, label: t.label, quantity: Number(t.quantity) || 0, unit: t.unit ?? "" })),
    documents,
    reception: rec.reception ? { date: day(rec.reception.reception_date), decision: rec.reception.decision } : null,
    reserves: rec.reserves.map((r) => ({ label: r.label, location: r.location, liftedAt: r.lifted_at ? day(r.lifted_at) : null })),
    photos: Number(photos?.n ?? 0),
    notes: notes?.doe_notes ?? "",
    docs,
  };
}

export async function doeStatus(ctx: Ctx, jobId: string) {
  const d = await doeData(ctx, jobId);
  return { checks: doeChecks(d), notes: d.notes };
}

export async function saveDoeNotes(ctx: Ctx, jobId: string, text: string) {
  requireWritable(ctx);
  const notes = String(text ?? "").trim();
  if (notes.length > 4000) throw badRequest("Conseils d'entretien trop longs (4 000 caractères au plus)");
  const r = await one(ctx.db, "UPDATE jobs SET doe_notes=$3 WHERE id=$1 AND org_id=$2 RETURNING id", [jobId, ctx.orgId, notes]);
  if (!r) throw notFound("Chantier introuvable");
}

/** Le dossier complet en un PDF, documents annexés. */
export async function doePdf(ctx: Ctx, jobId: string, now = new Date()): Promise<Uint8Array> {
  const d = await doeData(ctx, jobId);
  const photos = (
    await ctx.db.query<{ photo: Uint8Array; photo_type: string; note: string; taken_at: unknown }>(
      `SELECT photo, photo_type, note, taken_at FROM job_journal WHERE job_id=$1 AND org_id=$2 AND photo IS NOT NULL AND photo_type IN ('image/jpeg','image/png')
       ORDER BY taken_at LIMIT ${DOE_PHOTOS_MAX}`,
      [jobId, ctx.orgId],
    )
  ).map<DoePhoto>((p) => ({ bytes: new Uint8Array(p.photo), type: p.photo_type, caption: p.note.split("\n")[0].slice(0, 60), date: day(p.taken_at) }));
  const attachments: DoeAttachment[] = [];
  const reception = await one<{ pdf: Uint8Array }>(ctx.db, "SELECT pdf FROM job_receptions WHERE job_id=$1 AND org_id=$2", [jobId, ctx.orgId]);
  if (reception) attachments.push({ title: "Procès-verbal de réception", bytes: new Uint8Array(reception.pdf) });
  if (d.reserves.length && d.reserves.every((r) => r.liftedAt))
    attachments.push({ title: "Procès-verbal de levée des réserves", bytes: await liftingPdf(ctx, jobId) });
  if (d.docs.length) {
    const files = await ctx.db.query<{ id: string; file: Uint8Array }>("SELECT id, file FROM catalog_documents WHERE org_id=$1 AND id = ANY($2::uuid[])", [
      ctx.orgId,
      d.docs.map((x) => x.id),
    ]);
    for (const doc of d.docs) {
      const f = files.find((x) => x.id === doc.id);
      if (f) attachments.push({ title: `${DOC_KINDS[doc.kind] ?? "Document"} : ${doc.title}`, bytes: new Uint8Array(f.file) });
    }
  }
  const pdf = await renderDoePdf(d, photos, attachments, parisDate(now));
  await audit(ctx.db, { orgId: ctx.orgId, userId: ctx.userId, action: "job.doe", target: jobId, ip: ctx.ip });
  return pdf;
}
