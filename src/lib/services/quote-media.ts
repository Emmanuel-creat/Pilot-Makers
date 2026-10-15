/**
 * Photos annotées et croquis joints à un devis.
 *
 * L'artisan photographie l'existant ou dessine un croquis coté, l'annote dans l'éditeur, et l'image
 * est imprimée dans le PDF sous les totaux. Les métadonnées (position GPS, appareil) sont retirées.
 * Les images sont figées dans la version émise : la modifier ensuite demande une nouvelle version.
 */

import { requireCleanFile } from "@/lib/file-scan";
import { z } from "zod";
import { ImageFormatError, stripImageMetadata } from "@/lib/image-metadata";
import { num, one } from "@/lib/db";
import type { Queryable } from "@/lib/db";
import { badRequest, conflict, isUuid, notFound } from "@/lib/http";
import type { Ctx } from "./context";
import { audit, requireWritable } from "./context";
import { EDITABLE_STATUSES, type QuoteStatus } from "./quote-types";

export const MEDIA_MAX_BYTES = 1_500_000;
export const MEDIA_MAX_PER_QUOTE = 8;
export const MEDIA_KINDS = { photo: "Photo", croquis: "Croquis" } as const;
export type MediaKind = keyof typeof MEDIA_KINDS;

export interface QuoteMedia {
  id: string;
  kind: MediaKind;
  caption: string;
  position: number;
}

/** Image figée dans le devis émis */
export interface SnapshotMedia {
  kind: MediaKind;
  caption: string;
  dataUrl: string;
}

export function sniffImage(b: Uint8Array): "image/jpeg" | "image/png" | null {
  if (b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b.length > 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return "image/png";
  return null;
}

async function editableQuote(q: Queryable, ctx: Ctx, quoteId: string) {
  if (!isUuid(quoteId)) throw notFound("Devis introuvable");
  const r = await one<{ status: QuoteStatus }>(q, "SELECT status FROM quotes WHERE id=$1 AND org_id=$2", [quoteId, ctx.orgId]);
  if (!r) throw notFound("Devis introuvable");
  if (!EDITABLE_STATUSES.includes(r.status)) throw conflict("Ce devis a été émis : créez une nouvelle version pour changer ses photos");
}

const captionSchema = z.string().trim().max(160, "Légende trop longue (160 caractères au plus)").default("");

export async function addQuoteMedia(ctx: Ctx, quoteId: string, input: { kind: unknown; caption?: unknown }, bytes: Uint8Array) {
  requireWritable(ctx);
  await editableQuote(ctx.db, ctx, quoteId);
  const kind = z.enum(["photo", "croquis"]).safeParse(input.kind);
  if (!kind.success) throw badRequest("Type d'image inconnu");
  const caption = captionSchema.safeParse(input.caption ?? "");
  if (!caption.success) throw badRequest(caption.error.issues[0].message);
  if (!bytes.length) throw badRequest("Image vide");
  if (bytes.length > MEDIA_MAX_BYTES) throw badRequest("Image trop lourde (1,5 Mo au plus)");
  const mime = sniffImage(bytes);
  if (!mime) throw badRequest("Format d'image non pris en charge : JPEG ou PNG");
  await requireCleanFile(bytes, (r) => audit(ctx.db, { orgId: ctx.orgId, userId: ctx.userId, action: "file.rejected", target: quoteId, data: r, ip: ctx.ip }));
  let clean: Uint8Array;
  try {
    clean = stripImageMetadata(bytes, mime);
  } catch (e) {
    if (e instanceof ImageFormatError) throw badRequest("Image illisible");
    throw e;
  }
  return ctx.db.transaction(async (tx) => {
    const count = await one<{ n: unknown; p: unknown }>(
      tx,
      "SELECT count(*) AS n, COALESCE(max(position), -1) AS p FROM quote_media WHERE quote_id=$1 AND org_id=$2",
      [quoteId, ctx.orgId],
    );
    if (num(count?.n) >= MEDIA_MAX_PER_QUOTE) throw badRequest(`${MEDIA_MAX_PER_QUOTE} images au plus par devis`);
    const r = await one<{ id: string }>(
      tx,
      "INSERT INTO quote_media (org_id, quote_id, kind, caption, mime, data, position, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id",
      [ctx.orgId, quoteId, kind.data, caption.data, mime, clean, num(count?.p) + 1, ctx.userId],
    );
    await audit(tx, { orgId: ctx.orgId, userId: ctx.userId, action: "quote.media_add", target: quoteId, data: { kind: kind.data }, ip: ctx.ip });
    return r!.id;
  });
}

export async function listQuoteMedia(ctx: Ctx, quoteId: string): Promise<QuoteMedia[]> {
  // Le devis d'une autre entreprise répond comme un devis inexistant, sans liste vide qui confirmerait son existence.
  if (!isUuid(quoteId) || !(await one(ctx.db, "SELECT 1 FROM quotes WHERE id=$1 AND org_id=$2", [quoteId, ctx.orgId]))) throw notFound("Devis introuvable");
  const rows = await ctx.db.query<Record<string, unknown>>(
    "SELECT id, kind, caption, position FROM quote_media WHERE quote_id=$1 AND org_id=$2 ORDER BY position, created_at",
    [quoteId, ctx.orgId],
  );
  return rows.map((r) => ({ id: String(r.id), kind: r.kind as MediaKind, caption: String(r.caption), position: num(r.position) }));
}

export async function quoteMediaFile(ctx: Ctx, id: string) {
  if (!isUuid(id)) throw notFound("Image introuvable");
  const r = await one<{ mime: string; data: Uint8Array }>(ctx.db, "SELECT mime, data FROM quote_media WHERE id=$1 AND org_id=$2", [id, ctx.orgId]);
  if (!r) throw notFound("Image introuvable");
  return { type: r.mime, bytes: new Uint8Array(r.data) };
}

async function mediaRow(ctx: Ctx, id: string) {
  if (!isUuid(id)) throw notFound("Image introuvable");
  const r = await one<{ quote_id: string; position: unknown }>(ctx.db, "SELECT quote_id, position FROM quote_media WHERE id=$1 AND org_id=$2", [
    id,
    ctx.orgId,
  ]);
  if (!r) throw notFound("Image introuvable");
  await editableQuote(ctx.db, ctx, r.quote_id);
  return r;
}

export async function updateQuoteMedia(ctx: Ctx, id: string, input: { caption?: unknown; move?: unknown }) {
  requireWritable(ctx);
  const r = await mediaRow(ctx, id);
  if (input.caption !== undefined) {
    const caption = captionSchema.safeParse(input.caption);
    if (!caption.success) throw badRequest(caption.error.issues[0].message);
    await ctx.db.query("UPDATE quote_media SET caption=$3 WHERE id=$1 AND org_id=$2", [id, ctx.orgId, caption.data]);
  }
  if (input.move === "up" || input.move === "down") {
    const list = await listQuoteMedia(ctx, r.quote_id);
    const i = list.findIndex((m) => m.id === id);
    const j = input.move === "up" ? i - 1 : i + 1;
    if (j >= 0 && j < list.length) {
      [list[i], list[j]] = [list[j], list[i]];
      await ctx.db.transaction(async (tx) => {
        for (const [k, m] of list.entries()) await tx.query("UPDATE quote_media SET position=$3 WHERE id=$1 AND org_id=$2", [m.id, ctx.orgId, k]);
      });
    }
  }
}

export async function removeQuoteMedia(ctx: Ctx, id: string) {
  requireWritable(ctx);
  const r = await mediaRow(ctx, id);
  await ctx.db.query("DELETE FROM quote_media WHERE id=$1 AND org_id=$2", [id, ctx.orgId]);
  await audit(ctx.db, { orgId: ctx.orgId, userId: ctx.userId, action: "quote.media_remove", target: r.quote_id, ip: ctx.ip });
}

/** Images à figer dans le PDF, dans l'ordre choisi. */
export async function snapshotMedia(q: Queryable, orgId: string, quoteId: string): Promise<SnapshotMedia[]> {
  const rows = await q.query<{ kind: MediaKind; caption: string; mime: string; data: Uint8Array }>(
    "SELECT kind, caption, mime, data FROM quote_media WHERE quote_id=$1 AND org_id=$2 ORDER BY position, created_at",
    [quoteId, orgId],
  );
  return rows.map((r) => ({ kind: r.kind, caption: r.caption, dataUrl: `data:${r.mime};base64,${Buffer.from(r.data).toString("base64")}` }));
}
