/** Paiement par étape validée en photo : plan d'étapes, soumission avec photos, décision du client, facturation. */

import { bpToInput, formatPercent } from "@/lib/calc/format";
import type { Database, Queryable } from "@/lib/db";
import { num, one } from "@/lib/db";
import { requireCleanFile } from "@/lib/file-scan";
import { badRequest, conflict, isUuid, notFound } from "@/lib/http";
import { ImageFormatError, stripImageMetadata } from "@/lib/image-metadata";
import {
  canInvoice,
  canSubmit,
  currentStage,
  decisionSchema,
  MAX_STAGE_PHOTOS,
  parsePlan,
  STAGE_PHOTO_MAX_BYTES,
  stageMail,
  type StageStatus,
} from "@/lib/payment-stages";
import { hitRate } from "@/lib/rate-limit";
import { createPortalLink, resolvePortal } from "./client-space";
import type { Ctx } from "./context";
import { audit, requirePermission, requireWritable } from "./context";
import { createFinalInvoice, createProgressInvoice } from "./invoices";
import { sendMail } from "./mail";
import { notifyOrg } from "./push";
import { sniffImage } from "./quote-media";

export interface PaymentStage {
  id: string;
  position: number;
  label: string;
  cumulativeBp: number;
  status: StageStatus;
  artisanNote: string;
  clientComment: string;
  submittedAt: Date | null;
  decidedAt: Date | null;
  invoiceId: string | null;
  invoiceNumber: string | null;
  photoIds: string[];
}

async function loadStages(q: Queryable, orgId: string, quoteIds: string[]): Promise<(PaymentStage & { quoteId: string })[]> {
  if (!quoteIds.length) return [];
  const rows = await q.query<Record<string, unknown>>(
    `SELECT s.*, i.number AS invoice_number,
       coalesce((SELECT array_agg(p.id::text ORDER BY p.created_at) FROM payment_stage_photos p WHERE p.stage_id=s.id), '{}') AS photo_ids
     FROM payment_stages s LEFT JOIN invoices i ON i.id=s.invoice_id
     WHERE s.org_id=$1 AND s.quote_id = ANY($2::uuid[]) ORDER BY s.quote_id, s.position`,
    [orgId, quoteIds],
  );
  return rows.map((r) => ({
    id: String(r.id),
    quoteId: String(r.quote_id),
    position: num(r.position),
    label: String(r.label),
    cumulativeBp: num(r.cumulative_bp),
    status: r.status as StageStatus,
    artisanNote: String(r.artisan_note ?? ""),
    clientComment: String(r.client_comment ?? ""),
    submittedAt: (r.submitted_at as Date | null) ?? null,
    decidedAt: (r.decided_at as Date | null) ?? null,
    invoiceId: (r.invoice_id as string | null) ?? null,
    invoiceNumber: (r.invoice_number as string | null) ?? null,
    photoIds: (r.photo_ids as string[]) ?? [],
  }));
}

async function quoteOf(q: Queryable, ctx: Ctx, quoteId: string) {
  if (!isUuid(quoteId)) throw notFound("Devis introuvable");
  const r = await one<{ id: string; number: string | null; title: string; status: string; customer_id: string | null }>(
    q,
    "SELECT id, number, title, status, customer_id FROM quotes WHERE id=$1 AND org_id=$2",
    [quoteId, ctx.orgId],
  );
  if (!r) throw notFound("Devis introuvable");
  return r;
}

/** Étapes d'un devis, côté entreprise. */
export async function listStages(ctx: Ctx, quoteId: string) {
  requirePermission(ctx, "billing");
  const quote = await quoteOf(ctx.db, ctx, quoteId);
  const stages = await loadStages(ctx.db, ctx.orgId, [quoteId]);
  const current = currentStage(stages);
  return {
    quote,
    stages: stages.map((s) => ({ ...s, canSubmit: canSubmit(stages, s.id), canInvoice: canInvoice(stages, s.id) })),
    currentId: current?.id ?? null,
    editable: stages.every((s) => s.status === "prevue"),
  };
}

/** Plan d'étapes d'un devis accepté. Modifiable tant qu'aucune étape n'a été soumise au client. */
export async function defineStages(ctx: Ctx, quoteId: string, rows: { label: string; percent: string }[]) {
  requireWritable(ctx);
  requirePermission(ctx, "billing");
  const { plan, error } = parsePlan(rows);
  if (error) throw badRequest(error);
  await ctx.db.transaction(async (tx) => {
    const quote = await quoteOf(tx, ctx, quoteId);
    if (quote.status !== "accepted") throw conflict("Les étapes de paiement se définissent sur un devis accepté");
    const started = await one(tx, "SELECT 1 FROM payment_stages WHERE quote_id=$1 AND org_id=$2 AND status <> 'prevue'", [quoteId, ctx.orgId]);
    if (started) throw conflict("Une étape a déjà été soumise au client : le plan ne peut plus changer");
    await tx.query("DELETE FROM payment_stages WHERE quote_id=$1 AND org_id=$2", [quoteId, ctx.orgId]);
    for (const [i, p] of plan.entries()) {
      await tx.query("INSERT INTO payment_stages (org_id, quote_id, position, label, cumulative_bp) VALUES ($1,$2,$3,$4,$5)", [
        ctx.orgId,
        quoteId,
        i + 1,
        p.label,
        p.cumulativeBp,
      ]);
    }
  });
  await audit(ctx.db, { orgId: ctx.orgId, userId: ctx.userId, action: "quote.stages", target: quoteId, data: { count: plan.length }, ip: ctx.ip });
  return plan.length;
}

/**
 * Soumission de l'étape en cours avec ses photos : métadonnées retirées, fichiers analysés.
 * Une étape contestée se soumet à nouveau avec de nouvelles photos, qui remplacent les anciennes.
 */
export async function submitStage(ctx: Ctx, stageId: string, input: { note: string; notify: boolean }, photos: Uint8Array[]) {
  requireWritable(ctx);
  requirePermission(ctx, "billing");
  if (!isUuid(stageId)) throw notFound("Étape introuvable");
  const note = input.note.trim();
  if (note.length > 1000) throw badRequest("Note trop longue (1 000 caractères au plus)");
  if (!photos.length) throw badRequest("Ajoutez au moins une photo de l'avancement");
  if (photos.length > MAX_STAGE_PHOTOS) throw badRequest(`${MAX_STAGE_PHOTOS} photos au plus par étape`);
  const clean: { mime: string; data: Uint8Array }[] = [];
  for (const bytes of photos) {
    if (bytes.length > STAGE_PHOTO_MAX_BYTES) throw badRequest("Photo trop lourde (1,5 Mo au plus)");
    const mime = sniffImage(bytes);
    if (!mime) throw badRequest("Format de photo non pris en charge : JPEG ou PNG");
    await requireCleanFile(bytes, (r) =>
      audit(ctx.db, { orgId: ctx.orgId, userId: ctx.userId, action: "file.rejected", target: stageId, data: r, ip: ctx.ip }),
    );
    try {
      clean.push({ mime, data: stripImageMetadata(bytes, mime) });
    } catch (e) {
      if (e instanceof ImageFormatError) throw badRequest("Photo illisible");
      throw e;
    }
  }
  const stage = await ctx.db.transaction(async (tx) => {
    const s = await one<{ quote_id: string; label: string; cumulative_bp: unknown }>(
      tx,
      "SELECT quote_id, label, cumulative_bp FROM payment_stages WHERE id=$1 AND org_id=$2 FOR UPDATE",
      [stageId, ctx.orgId],
    );
    if (!s) throw notFound("Étape introuvable");
    const all = await loadStages(tx, ctx.orgId, [s.quote_id]);
    if (!canSubmit(all, stageId)) throw conflict("Seule l'étape en cours, prévue ou contestée, peut être soumise au client");
    await tx.query("DELETE FROM payment_stage_photos WHERE stage_id=$1", [stageId]);
    for (const p of clean) {
      await tx.query("INSERT INTO payment_stage_photos (org_id, stage_id, mime, data) VALUES ($1,$2,$3,$4)", [ctx.orgId, stageId, p.mime, p.data]);
    }
    await tx.query("UPDATE payment_stages SET status='soumise', artisan_note=$2, submitted_at=now(), decided_at=NULL WHERE id=$1", [stageId, note]);
    return s;
  });
  let emailed = false;
  if (input.notify) {
    const quote = await quoteOf(ctx.db, ctx, stage.quote_id);
    const c = quote.customer_id ? await one<{ email: string }>(ctx.db, "SELECT email FROM customers WHERE id=$1", [quote.customer_id]) : null;
    if (!c?.email) throw badRequest("Étape soumise, mais ce client n'a pas d'adresse e-mail : transmettez-lui le lien de son espace");
    await hitRate(ctx.db, "mail.send", ctx.orgId);
    const link = await createPortalLink(ctx, quote.customer_id!);
    const org = await one<{ trade_name: string }>(ctx.db, "SELECT trade_name FROM organizations WHERE id=$1", [ctx.orgId]);
    const mail = stageMail({
      orgName: org?.trade_name || "Votre artisan",
      quoteNumber: quote.number ?? "",
      stageLabel: stage.label,
      percent: formatPercent(num(stage.cumulative_bp)),
      url: link.url,
      note,
    });
    await sendMail(ctx.db, { orgId: ctx.orgId, kind: "payment_stage", to: c.email, subject: mail.subject, body: mail.body });
    emailed = true;
  }
  await audit(ctx.db, {
    orgId: ctx.orgId,
    userId: ctx.userId,
    action: "quote.stage_submitted",
    target: stageId,
    data: { photos: clean.length, emailed },
    ip: ctx.ip,
  });
  return { quoteId: stage.quote_id, emailed };
}

/** Facture de l'étape validée : situation à l'avancement cumulé, ou facture de solde pour la dernière. */
export async function invoiceStage(ctx: Ctx, stageId: string) {
  requireWritable(ctx);
  requirePermission(ctx, "billing");
  if (!isUuid(stageId)) throw notFound("Étape introuvable");
  const s = await one<{ quote_id: string; cumulative_bp: unknown }>(ctx.db, "SELECT quote_id, cumulative_bp FROM payment_stages WHERE id=$1 AND org_id=$2", [
    stageId,
    ctx.orgId,
  ]);
  if (!s) throw notFound("Étape introuvable");
  const all = await loadStages(ctx.db, ctx.orgId, [s.quote_id]);
  if (!canInvoice(all, stageId)) throw conflict("Seule une étape validée par le client, dont les précédentes sont facturées, peut être facturée");
  const bp = num(s.cumulative_bp);
  const invoice = bp >= 10000 ? await createFinalInvoice(ctx, s.quote_id) : await createProgressInvoice(ctx, s.quote_id, { percent: bpToInput(bp) });
  await ctx.db.query("UPDATE payment_stages SET invoice_id=$2 WHERE id=$1", [stageId, invoice.id]);
  return { quoteId: s.quote_id, ...invoice };
}

/** Photo d'une étape, côté entreprise. */
export async function stagePhotoForOrg(ctx: Ctx, photoId: string) {
  if (!isUuid(photoId)) throw notFound("Photo introuvable");
  const r = await one<{ mime: string; data: Uint8Array }>(ctx.db, "SELECT mime, data FROM payment_stage_photos WHERE id=$1 AND org_id=$2", [
    photoId,
    ctx.orgId,
  ]);
  if (!r) throw notFound("Photo introuvable");
  return { type: r.mime, bytes: new Uint8Array(r.data) };
}

/** Étapes visibles dans l'espace client, rangées par devis. */
export async function portalStages(q: Queryable, orgId: string, quoteIds: string[]) {
  const all = await loadStages(q, orgId, quoteIds);
  const byQuote = new Map<string, typeof all>();
  for (const s of all) byQuote.set(s.quoteId, [...(byQuote.get(s.quoteId) ?? []), s]);
  return byQuote;
}

async function portalStage(q: Queryable, token: string, stageId: string) {
  const link = await resolvePortal(q, token);
  if (!link || !isUuid(stageId)) throw notFound("Lien invalide ou expiré");
  const s = await one<{ id: string; quote_id: string; label: string; status: StageStatus }>(
    q,
    `SELECT s.id, s.quote_id, s.label, s.status FROM payment_stages s JOIN quotes qu ON qu.id=s.quote_id
     WHERE s.id=$1 AND s.org_id=$2 AND qu.customer_id=$3`,
    [stageId, link.org_id, link.customer_id],
  );
  if (!s) throw notFound("Étape introuvable");
  return { link, stage: s };
}

/** Photo d'une étape, depuis l'espace client. */
export async function stagePhotoForPortal(db: Database, token: string, photoId: string, meta: { ip: string }) {
  await hitRate(db, "public.view", meta.ip);
  const link = await resolvePortal(db, token);
  if (!link || !isUuid(photoId)) throw notFound("Lien invalide ou expiré");
  const r = await one<{ mime: string; data: Uint8Array }>(
    db,
    `SELECT p.mime, p.data FROM payment_stage_photos p JOIN payment_stages s ON s.id=p.stage_id JOIN quotes qu ON qu.id=s.quote_id
     WHERE p.id=$1 AND p.org_id=$2 AND qu.customer_id=$3`,
    [photoId, link.org_id, link.customer_id],
  );
  if (!r) throw notFound("Photo introuvable");
  return { type: r.mime, bytes: new Uint8Array(r.data) };
}

/** Décision du client sur une étape soumise : validation, ou contestation motivée. L'entreprise est prévenue. */
export async function decideStage(db: Database, token: string, stageId: string, raw: unknown, meta: { ip: string }) {
  await hitRate(db, "public.message", meta.ip);
  const parsed = decisionSchema.safeParse(raw);
  if (!parsed.success) throw badRequest(parsed.error.issues[0].message);
  const { link, stage } = await portalStage(db, token, stageId);
  const d = parsed.data;
  const r = await db.query("UPDATE payment_stages SET status=$2, client_comment=$3, decided_at=now() WHERE id=$1 AND status='soumise' RETURNING id", [
    stage.id,
    d.decision,
    d.comment,
  ]);
  if (!r.length) throw conflict("Cette étape n'attend pas de décision");
  await audit(db, {
    orgId: link.org_id,
    userId: null,
    action: `quote.stage_${d.decision}`,
    target: stage.id,
    data: { comment: d.comment.slice(0, 200) },
    ip: meta.ip,
  });
  await notifyOrg(db, link.org_id, {
    title: d.decision === "validee" ? "Étape validée par le client" : "Étape contestée par le client",
    body: d.decision === "validee" ? `${stage.label} : vous pouvez la facturer.` : `${stage.label} : ${d.comment.slice(0, 120)}`,
    url: `/app/devis/${stage.quote_id}/etapes`,
  });
  return d.decision;
}
