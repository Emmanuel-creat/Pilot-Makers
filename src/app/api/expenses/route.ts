import { badRequest } from "@/lib/http";
import { hitRate } from "@/lib/rate-limit";
import { api } from "@/lib/server/session";
import { addExpense, RECEIPT_MAX_BYTES } from "@/lib/services/expenses";

/** Nouvelle note de frais (envoi multipart) : photo du ticket et montants. */
export const POST = api(async ({ req, ctx }) => {
  const length = Number(req.headers.get("content-length") ?? 0);
  if (length > RECEIPT_MAX_BYTES + 200_000) throw badRequest("Photo trop lourde (4 Mo au plus)");
  await hitRate(ctx.db, "job.photo", ctx.orgId);
  const form = await req.formData().catch(() => {
    throw badRequest("Envoi illisible");
  });
  const file = form.get("photo");
  const field = (k: string) => String(form.get(k) ?? "");
  const id = await addExpense(
    ctx,
    {
      date: field("date"),
      merchant: field("merchant"),
      category: field("category"),
      amount: field("amount"),
      vat: field("vat"),
      payment: field("payment") || "perso",
      jobId: field("jobId"),
      note: field("note"),
    },
    file instanceof File && file.size ? new Uint8Array(await file.arrayBuffer()) : null,
  );
  return { id };
});
