import { badRequest } from "@/lib/http";
import { hitRate } from "@/lib/rate-limit";
import { api } from "@/lib/server/session";
import { importTender, TENDER_MAX_BYTES } from "@/lib/services/tenders";

/** Import d'un DPGF, d'un BPU ou d'un DQE (CSV, XLSX ou ODS) : crée un devis prérempli. */
export const POST = api(async ({ req, ctx }) => {
  const length = Number(req.headers.get("content-length") ?? 0);
  if (length > TENDER_MAX_BYTES + 100_000) throw badRequest("Fichier trop lourd (5 Mo au plus)");
  await hitRate(ctx.db, "files.transfer", ctx.orgId);
  const form = await req.formData().catch(() => {
    throw badRequest("Envoi illisible");
  });
  const file = form.get("file");
  if (!(file instanceof File) || !file.size) throw badRequest("Fichier manquant");
  return importTender(ctx, {
    bytes: new Uint8Array(await file.arrayBuffer()),
    fileName: file.name,
    customerId: String(form.get("customerId") ?? "") || null,
    title: String(form.get("title") ?? ""),
  });
});
