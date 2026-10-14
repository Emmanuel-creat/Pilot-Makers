/** Métrés sur plan rattachés à un devis : import du plan, relevés enregistrés et lignes ajoutées au devis. */

import { randomUUID } from "node:crypto";
import { z } from "zod";
import { num, one } from "@/lib/db";
import { requireCleanFile } from "@/lib/file-scan";
import { badRequest, conflict, isUuid, notFound } from "@/lib/http";
import { ImageFormatError, stripImageMetadata } from "@/lib/image-metadata";
import { quantity, quantityText, TAKEOFF_KINDS, takeoffSchema, type Measurement } from "@/lib/takeoff";
import type { Ctx } from "./context";
import { audit, requireWritable } from "./context";
import { sniffImage } from "./quote-media";
import { EDITABLE_STATUSES, type QuoteStatus } from "./quote-types";
import { getDraft, saveDraft } from "./quotes";

export const PLAN_MAX_BYTES = 4_000_000;
const MAX_PER_QUOTE = 10;

async function quoteOf(ctx: Ctx, quoteId: string) {
  if (!isUuid(quoteId)) throw notFound("Devis introuvable");
  const q = await one<{ status: QuoteStatus; title: string; number: string | null }>(
    ctx.db,
    "SELECT status, title, number FROM quotes WHERE id=$1 AND org_id=$2",
    [quoteId, ctx.orgId],
  );
  if (!q) throw notFound("Devis introuvable");
  return q;
}

export async function listTakeoffs(ctx: Ctx, quoteId: string) {
  await quoteOf(ctx, quoteId);
  const rows = await ctx.db.query<{ id: string; name: string; measurements: Measurement[]; px_per_m: number | null; updated_at: Date }>(
    "SELECT id, name, measurements, px_per_m, updated_at FROM quote_takeoffs WHERE quote_id=$1 AND org_id=$2 ORDER BY created_at",
    [quoteId, ctx.orgId],
  );
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    count: r.measurements.length,
    calibrated: r.px_per_m != null,
    updatedAt: new Date(r.updated_at).toISOString(),
  }));
}

export async function createTakeoff(ctx: Ctx, quoteId: string, name: string, bytes: Uint8Array) {
  requireWritable(ctx);
  await quoteOf(ctx, quoteId);
  if (!bytes.length) throw badRequest("Plan vide");
  if (bytes.length > PLAN_MAX_BYTES) throw badRequest("Plan trop lourd (4 Mo au plus)");
  const mime = sniffImage(bytes);
  if (!mime) throw badRequest("Format non pris en charge : image JPEG ou PNG du plan");
  await requireCleanFile(bytes, (r) => audit(ctx.db, { orgId: ctx.orgId, userId: ctx.userId, action: "file.rejected", target: quoteId, data: r, ip: ctx.ip }));
  let clean: Uint8Array;
  try {
    clean = stripImageMetadata(bytes, mime);
  } catch (e) {
    if (e instanceof ImageFormatError) throw badRequest("Image illisible");
    throw e;
  }
  const n = await one<{ n: unknown }>(ctx.db, "SELECT count(*) AS n FROM quote_takeoffs WHERE quote_id=$1", [quoteId]);
  if (num(n?.n) >= MAX_PER_QUOTE) throw badRequest(`${MAX_PER_QUOTE} plans au plus par devis`);
  const r = await one<{ id: string }>(
    ctx.db,
    "INSERT INTO quote_takeoffs (org_id, quote_id, name, mime, data, created_by) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id",
    [ctx.orgId, quoteId, name.trim().slice(0, 120) || "Plan", mime, clean, ctx.userId],
  );
  await audit(ctx.db, { orgId: ctx.orgId, userId: ctx.userId, action: "quote.takeoff_add", target: quoteId, ip: ctx.ip });
  return r!.id;
}

async function row(ctx: Ctx, id: string) {
  if (!isUuid(id)) throw notFound("Plan introuvable");
  const r = await one<{ id: string; quote_id: string; name: string; px_per_m: number | null; measurements: Measurement[] }>(
    ctx.db,
    "SELECT id, quote_id, name, px_per_m, measurements FROM quote_takeoffs WHERE id=$1 AND org_id=$2",
    [id, ctx.orgId],
  );
  if (!r) throw notFound("Plan introuvable");
  return r;
}

export async function getTakeoff(ctx: Ctx, id: string) {
  const r = await row(ctx, id);
  const q = await quoteOf(ctx, r.quote_id);
  return {
    id: r.id,
    quoteId: r.quote_id,
    quoteTitle: q.title || q.number || "Devis",
    editable: EDITABLE_STATUSES.includes(q.status),
    name: r.name,
    pxPerM: r.px_per_m,
    measurements: r.measurements,
  };
}

export async function takeoffImage(ctx: Ctx, id: string) {
  if (!isUuid(id)) throw notFound("Plan introuvable");
  const r = await one<{ mime: string; data: Uint8Array }>(ctx.db, "SELECT mime, data FROM quote_takeoffs WHERE id=$1 AND org_id=$2", [id, ctx.orgId]);
  if (!r) throw notFound("Plan introuvable");
  return { type: r.mime, bytes: new Uint8Array(r.data) };
}

export async function saveTakeoff(ctx: Ctx, id: string, raw: unknown) {
  requireWritable(ctx);
  await row(ctx, id);
  const p = takeoffSchema.safeParse(raw);
  if (!p.success) throw badRequest("Relevés invalides");
  await ctx.db.query("UPDATE quote_takeoffs SET px_per_m=$3, measurements=$4, updated_at=now() WHERE id=$1 AND org_id=$2", [
    id,
    ctx.orgId,
    p.data.pxPerM,
    JSON.stringify(p.data.measurements),
  ]);
}

export async function deleteTakeoff(ctx: Ctx, id: string) {
  requireWritable(ctx);
  const r = await row(ctx, id);
  await ctx.db.query("DELETE FROM quote_takeoffs WHERE id=$1 AND org_id=$2", [id, ctx.orgId]);
  return r.quote_id;
}

/** Ajoute au devis une ligne par relevé choisi, quantité et unité remplies ; le prix reste à saisir. */
export async function addTakeoffLines(ctx: Ctx, id: string, ids: string[]) {
  requireWritable(ctx);
  const r = await row(ctx, id);
  const chosen = r.measurements.filter((m) => ids.includes(m.id));
  if (!chosen.length) throw badRequest("Choisissez au moins un relevé");
  const draft = await getDraft(ctx, r.quote_id);
  if (!EDITABLE_STATUSES.includes(draft.status as QuoteStatus)) throw conflict("Ce devis a été émis : créez une nouvelle version pour le modifier");
  const lines = [];
  for (const m of chosen) {
    const q = quantity(m, r.px_per_m);
    if (q === null) throw badRequest(`Relevé « ${m.label || TAKEOFF_KINDS[m.kind].label} » incomplet ou plan non étalonné`);
    lines.push({
      id: randomUUID(),
      kind: "item" as const,
      catalogItemId: null,
      nature: "main_oeuvre" as const,
      label: m.label || TAKEOFF_KINDS[m.kind].label,
      description: "",
      quantity: quantityText(q),
      unit: TAKEOFF_KINDS[m.kind].unit,
      unitPrice: "",
      unitCost: "",
      discountPercent: "",
      vatPercent: "",
      estimated: false,
      estimateNote: "",
      internalNote: `Métré sur le plan « ${r.name} »`,
    });
  }
  const sections = draft.sections.length ? draft.sections.map((s) => ({ ...s })) : [{ id: randomUUID(), title: "", description: "", lines: [] }];
  const last = sections[sections.length - 1];
  sections[sections.length - 1] = { ...last, lines: [...last.lines, ...(lines as never[])] };
  await saveDraft(ctx, r.quote_id, { ...draft, sections }, draft.draftRevision);
  return { added: lines.length, quoteId: r.quote_id };
}

export const takeoffIdsSchema = z.array(z.string().max(40)).max(200);
