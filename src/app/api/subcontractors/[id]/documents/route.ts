import { badRequest } from "@/lib/http";
import { hitRate } from "@/lib/rate-limit";
import { api } from "@/lib/server/session";
import { addDocument, DOC_MAX_BYTES } from "@/lib/services/subcontractors";

/** Ajout d'un document de sous-traitant (envoi multipart) : fichier PDF, JPEG ou PNG et date de fin de validité. */
export const POST = api<{ id: string }>(async ({ req, ctx, params }) => {
  const length = Number(req.headers.get("content-length") ?? 0);
  if (length > DOC_MAX_BYTES + 200_000) throw badRequest("Fichier trop lourd (5 Mo au plus)");
  await hitRate(ctx.db, "files.transfer", ctx.orgId);
  const form = await req.formData().catch(() => {
    throw badRequest("Envoi illisible");
  });
  const file = form.get("file");
  const id = await addDocument(ctx, params.id, {
    kind: String(form.get("kind") ?? ""),
    label: String(form.get("label") ?? ""),
    validUntil: String(form.get("validUntil") ?? ""),
    file: file instanceof File && file.size ? new Uint8Array(await file.arrayBuffer()) : null,
    fileName: file instanceof File ? file.name : "",
  });
  return { id };
});
