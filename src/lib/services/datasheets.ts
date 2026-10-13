/**
 * Fiches techniques, certificats (ACERMI, CE, NF), notices et fiches de données de sécurité des articles.
 *
 * Le document est déposé une fois sur l'article du catalogue. À l'émission, le devis retient la liste des
 * documents des articles qu'il contient : le client les télécharge réunis en un seul PDF depuis son lien.
 * Un document n'est jamais modifié : le retirer le masque du catalogue mais les devis émis le gardent.
 */

import { requireCleanFile } from "@/lib/file-scan";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { z } from "zod";
import { one } from "@/lib/db";
import type { Queryable } from "@/lib/db";
import { badRequest, isUuid, notFound } from "@/lib/http";
import { sha256 } from "@/lib/security";
import type { Ctx } from "./context";
import { audit, requireWritable } from "./context";

export const DOC_KINDS = {
  fiche_technique: "Fiche technique",
  certificat: "Certificat ou avis technique",
  notice: "Notice de pose",
  fds: "Fiche de données de sécurité",
  autre: "Autre document",
} as const;
export type DocKind = keyof typeof DOC_KINDS;
export const DOC_MAX_BYTES = 5_000_000;
export const DOCS_MAX_PER_ITEM = 10;

export interface CatalogDocument {
  id: string;
  kind: DocKind;
  title: string;
  size: number;
  created_at: string;
}

/** Document cité par un devis émis */
export interface SnapshotDocument {
  id: string;
  kind: DocKind;
  title: string;
  item: string;
}

const inputSchema = z.object({
  kind: z.enum(Object.keys(DOC_KINDS) as [DocKind, ...DocKind[]], { message: "Type de document inconnu" }),
  title: z.string().trim().min(2, "Titre du document requis").max(120),
});

export async function addCatalogDocument(ctx: Ctx, itemId: string, raw: unknown, bytes: Uint8Array) {
  requireWritable(ctx);
  if (!isUuid(itemId)) throw notFound("Article introuvable");
  const p = inputSchema.safeParse(raw);
  if (!p.success) throw badRequest(p.error.issues[0].message);
  if (!bytes.length) throw badRequest("Fichier vide");
  if (bytes.length > DOC_MAX_BYTES) throw badRequest("Document trop lourd (5 Mo au plus)");
  if (Buffer.from(bytes.subarray(0, 5)).toString("latin1") !== "%PDF-") throw badRequest("Seuls les documents PDF sont acceptés");
  await requireCleanFile(bytes, (r) => audit(ctx.db, { orgId: ctx.orgId, userId: ctx.userId, action: "file.rejected", target: itemId, data: r, ip: ctx.ip }));
  try {
    await PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false });
  } catch {
    throw badRequest("PDF illisible");
  }
  const item = await one<{ id: string }>(ctx.db, "SELECT id FROM catalog_items WHERE id=$1 AND org_id=$2", [itemId, ctx.orgId]);
  if (!item) throw notFound("Article introuvable");
  const count = await one<{ n: string }>(ctx.db, "SELECT count(*) AS n FROM catalog_documents WHERE item_id=$1 AND removed_at IS NULL", [itemId]);
  if (Number(count?.n) >= DOCS_MAX_PER_ITEM) throw badRequest(`${DOCS_MAX_PER_ITEM} documents au plus par article`);
  const r = await one<{ id: string }>(
    ctx.db,
    "INSERT INTO catalog_documents (org_id, item_id, kind, title, file, size, sha256, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id",
    [ctx.orgId, itemId, p.data.kind, p.data.title, bytes, bytes.length, sha256(bytes), ctx.userId],
  );
  await audit(ctx.db, {
    orgId: ctx.orgId,
    userId: ctx.userId,
    action: "catalog.document_add",
    target: itemId,
    data: { title: p.data.title },
    ip: ctx.ip,
  });
  return r!.id;
}

export async function listCatalogDocuments(ctx: Ctx, itemId: string): Promise<CatalogDocument[]> {
  if (!isUuid(itemId)) return [];
  const rows = await ctx.db.query<Record<string, unknown>>(
    "SELECT id, kind, title, size, created_at FROM catalog_documents WHERE item_id=$1 AND org_id=$2 AND removed_at IS NULL ORDER BY created_at",
    [itemId, ctx.orgId],
  );
  return rows.map((r) => ({
    id: String(r.id),
    kind: r.kind as DocKind,
    title: String(r.title),
    size: Number(r.size),
    created_at: r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at),
  }));
}

export async function removeCatalogDocument(ctx: Ctx, id: string) {
  requireWritable(ctx);
  if (!isUuid(id)) throw notFound("Document introuvable");
  const r = await one<{ item_id: string }>(
    ctx.db,
    "UPDATE catalog_documents SET removed_at=now() WHERE id=$1 AND org_id=$2 AND removed_at IS NULL RETURNING item_id",
    [id, ctx.orgId],
  );
  if (!r) throw notFound("Document introuvable");
  await audit(ctx.db, { orgId: ctx.orgId, userId: ctx.userId, action: "catalog.document_remove", target: r.item_id, ip: ctx.ip });
}

export async function catalogDocumentFile(ctx: Ctx, id: string) {
  if (!isUuid(id)) throw notFound("Document introuvable");
  const r = await one<{ title: string; file: Uint8Array }>(ctx.db, "SELECT title, file FROM catalog_documents WHERE id=$1 AND org_id=$2", [
    id,
    ctx.orgId,
  ]);
  if (!r) throw notFound("Document introuvable");
  return { title: r.title, bytes: new Uint8Array(r.file) };
}

/** Documents des articles du catalogue utilisés par le devis, dans l'ordre des lignes. */
export async function quoteDocuments(
  q: Queryable,
  orgId: string,
  items: { catalogItemId?: string | null; label: string }[],
): Promise<SnapshotDocument[]> {
  const ids = [...new Set(items.map((l) => l.catalogItemId).filter((x): x is string => !!x && isUuid(x)))];
  if (!ids.length) return [];
  const rows = await q.query<{ id: string; item_id: string; kind: DocKind; title: string; name: string }>(
    `SELECT d.id, d.item_id, d.kind, d.title, i.name FROM catalog_documents d JOIN catalog_items i ON i.id=d.item_id
     WHERE d.org_id=$1 AND d.removed_at IS NULL AND d.item_id = ANY($2::uuid[]) ORDER BY d.created_at`,
    [orgId, ids],
  );
  return ids.flatMap((id) => rows.filter((r) => r.item_id === id).map((r) => ({ id: r.id, kind: r.kind, title: r.title, item: r.name })));
}

export function documentsMention(docs: SnapshotDocument[]) {
  if (!docs.length) return null;
  return `Documents joints, téléchargeables depuis le lien du devis : ${docs.map((d) => `${DOC_KINDS[d.kind].toLowerCase()} « ${d.title} » (${d.item})`).join(" ; ")}.`;
}

/** Réunit les documents cités par un devis en un seul PDF, précédé d'un sommaire. */
export async function mergedDocuments(q: Queryable, orgId: string, number: string, docs: SnapshotDocument[]): Promise<Uint8Array> {
  if (!docs.length) throw notFound("Aucun document joint à ce devis");
  const files = await q.query<{ id: string; file: Uint8Array }>("SELECT id, file FROM catalog_documents WHERE org_id=$1 AND id = ANY($2::uuid[])", [
    orgId,
    docs.map((d) => d.id),
  ]);
  const byId = new Map(files.map((f) => [f.id, new Uint8Array(f.file)]));
  const out = await PDFDocument.create();
  out.setTitle(`Documents joints au devis ${number}`);
  out.setProducer("Pilot-Makers");
  out.setCreator("Pilot-Makers");
  const font = await out.embedFont(StandardFonts.Helvetica);
  const bold = await out.embedFont(StandardFonts.HelveticaBold);
  const cover = out.addPage([595.28, 841.89]);
  let y = 780;
  cover.drawText(`Documents joints au devis ${number}`, { x: 50, y, size: 16, font: bold });
  y -= 30;
  const missing: string[] = [];
  const included: { doc: SnapshotDocument; pages: number }[] = [];
  for (const d of docs) {
    const bytes = byId.get(d.id);
    if (!bytes) {
      missing.push(d.title);
      continue;
    }
    try {
      const src = await PDFDocument.load(bytes, { ignoreEncryption: true });
      const pages = await out.copyPages(src, src.getPageIndices());
      pages.forEach((p) => out.addPage(p));
      included.push({ doc: d, pages: pages.length });
    } catch {
      missing.push(d.title);
    }
  }
  let page = 2;
  const clean = (t: string) => t.replace(/[^\x20-\x7e -ÿ]/g, "?");
  for (const { doc, pages } of included) {
    if (y < 60) break;
    cover.drawText(clean(`${DOC_KINDS[doc.kind]} : ${doc.title}`).slice(0, 90), { x: 50, y, size: 10.5, font: bold });
    cover.drawText(clean(`${doc.item}, page ${page}`).slice(0, 100), { x: 50, y: y - 13, size: 9, font, color: rgb(0.38, 0.4, 0.44) });
    y -= 34;
    page += pages;
  }
  if (missing.length && y > 60) {
    cover.drawText(clean(`Documents illisibles, à demander à l'entreprise : ${missing.join(", ")}`).slice(0, 110), { x: 50, y, size: 9, font });
  }
  return out.save();
}
