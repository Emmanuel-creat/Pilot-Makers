import { badRequest } from "@/lib/http";
import { hitRate } from "@/lib/rate-limit";
import { api } from "@/lib/server/session";
import { importSpec, SPEC_MAX_BYTES } from "@/lib/services/spec-import";

/** Lecture d'un CCTP (.docx, .odt, .pdf, .txt) : crée un devis avec un lot par lot du cahier et une ligne par article. */
export const POST = api(async ({ req, ctx }) => {
  const length = Number(req.headers.get("content-length") ?? 0);
  if (length > SPEC_MAX_BYTES + 100_000) throw badRequest("Fichier trop lourd (10 Mo au plus)");
  await hitRate(ctx.db, "files.transfer", ctx.orgId);
  const form = await req.formData().catch(() => {
    throw badRequest("Envoi illisible");
  });
  const file = form.get("file");
  if (!(file instanceof File) || !file.size) throw badRequest("Fichier manquant");
  return importSpec(ctx, {
    bytes: new Uint8Array(await file.arrayBuffer()),
    fileName: file.name,
    customerId: String(form.get("customerId") ?? "") || null,
    title: String(form.get("title") ?? ""),
  });
});
