import { badRequest } from "@/lib/http";
import { MAX_STAGE_PHOTOS, STAGE_PHOTO_MAX_BYTES } from "@/lib/payment-stages";
import { hitRate } from "@/lib/rate-limit";
import { api } from "@/lib/server/session";
import { submitStage } from "@/lib/services/payment-stages";

/** Soumission d'une étape de paiement au client, avec les photos de l'avancement. */
export const POST = api<{ id: string }>(async ({ req, ctx, params }) => {
  const length = Number(req.headers.get("content-length") ?? 0);
  if (length > MAX_STAGE_PHOTOS * STAGE_PHOTO_MAX_BYTES + 100_000) throw badRequest("Envoi trop lourd");
  await hitRate(ctx.db, "files.transfer", ctx.orgId);
  const form = await req.formData().catch(() => {
    throw badRequest("Envoi illisible");
  });
  const files = form.getAll("photos").filter((f): f is File => f instanceof File && f.size > 0);
  const photos = await Promise.all(files.map(async (f) => new Uint8Array(await f.arrayBuffer())));
  return submitStage(ctx, params.id, { note: String(form.get("note") ?? ""), notify: form.get("notify") === "1" }, photos);
});
