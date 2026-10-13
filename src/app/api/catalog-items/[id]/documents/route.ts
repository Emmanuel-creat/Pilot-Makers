import { badRequest } from "@/lib/http";
import { hitRate } from "@/lib/rate-limit";
import { api } from "@/lib/server/session";
import { addCatalogDocument, DOC_MAX_BYTES, listCatalogDocuments } from "@/lib/services/datasheets";

/** Fiches techniques et certificats d'un article. */
export const GET = api<{ id: string }>(async ({ ctx, params }) => ({ documents: await listCatalogDocuments(ctx, params.id) }));

/** Dépôt d'un document PDF (envoi multipart : fichier, type, titre). */
export const POST = api<{ id: string }>(async ({ req, ctx, params }) => {
  const length = Number(req.headers.get("content-length") ?? 0);
  if (length > DOC_MAX_BYTES + 100_000) throw badRequest("Document trop lourd (5 Mo au plus)");
  await hitRate(ctx.db, "files.transfer", ctx.orgId);
  const form = await req.formData().catch(() => {
    throw badRequest("Envoi illisible");
  });
  const file = form.get("file");
  if (!(file instanceof File) || !file.size) throw badRequest("Document manquant");
  const title = String(form.get("title") ?? "").trim() || file.name.replace(/\.pdf$/i, "");
  const id = await addCatalogDocument(ctx, params.id, { kind: form.get("kind"), title }, new Uint8Array(await file.arrayBuffer()));
  return { id };
});
