import { badRequest } from "@/lib/http";
import { hitRate } from "@/lib/rate-limit";
import { api } from "@/lib/server/session";
import { importStatement } from "@/lib/services/bank";

const MAX_BYTES = 5_000_000;

/** Import d'un relevé bancaire (envoi multipart) : OFX, CAMT.053, CSV, Excel ou LibreOffice. */
export const POST = api(async ({ req, ctx }) => {
  if (Number(req.headers.get("content-length") ?? 0) > MAX_BYTES + 100_000) throw badRequest("Relevé trop lourd (5 Mo au plus)");
  await hitRate(ctx.db, "files.transfer", ctx.orgId);
  const form = await req.formData().catch(() => {
    throw badRequest("Envoi illisible");
  });
  const file = form.get("file");
  if (!(file instanceof File) || !file.size) throw badRequest("Choisissez le fichier du relevé");
  return importStatement(ctx, new Uint8Array(await file.arrayBuffer()), file.name);
});
