import { badRequest } from "@/lib/http";
import { hitRate } from "@/lib/rate-limit";
import { api } from "@/lib/server/session";
import { createTakeoff, PLAN_MAX_BYTES } from "@/lib/services/takeoffs";

/** Import d'un plan (image) pour y relever les quantités du devis. */
export const POST = api<{ id: string }>(async ({ req, ctx, params }) => {
  const length = Number(req.headers.get("content-length") ?? 0);
  if (length > PLAN_MAX_BYTES + 100_000) throw badRequest("Plan trop lourd (4 Mo au plus)");
  await hitRate(ctx.db, "job.photo", ctx.orgId);
  const form = await req.formData().catch(() => {
    throw badRequest("Envoi illisible");
  });
  const file = form.get("image");
  if (!(file instanceof File) || !file.size) throw badRequest("Plan manquant");
  const id = await createTakeoff(ctx, params.id, String(form.get("name") ?? ""), new Uint8Array(await file.arrayBuffer()));
  return { id };
});
