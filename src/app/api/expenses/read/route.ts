import { badRequest } from "@/lib/http";
import { readPurchaseInvoice } from "@/lib/invoice-reader";
import { hitRate } from "@/lib/rate-limit";
import { api } from "@/lib/server/session";
import { RECEIPT_MAX_BYTES } from "@/lib/services/expenses";

/** Lecture d'une facture d'achat électronique (Factur-X, CII, UBL) pour préremplir la saisie. Rien n'est enregistré. */
export const POST = api(async ({ req, ctx }) => {
  const length = Number(req.headers.get("content-length") ?? 0);
  if (length > RECEIPT_MAX_BYTES + 200_000) throw badRequest("Fichier trop lourd (4 Mo au plus)");
  await hitRate(ctx.db, "job.photo", ctx.orgId);
  const form = await req.formData().catch(() => {
    throw badRequest("Envoi illisible");
  });
  const file = form.get("file");
  if (!(file instanceof File) || !file.size) throw badRequest("Aucun fichier");
  if (file.size > RECEIPT_MAX_BYTES) throw badRequest("Fichier trop lourd (4 Mo au plus)");
  const data = await readPurchaseInvoice(new Uint8Array(await file.arrayBuffer()));
  return { found: !!data, data };
});
