import { badRequest } from "@/lib/http";
import { hitRate } from "@/lib/rate-limit";
import { api } from "@/lib/server/session";
import { addQuoteMedia, listQuoteMedia, MEDIA_MAX_BYTES } from "@/lib/services/quote-media";

/** Photos et croquis du devis. */
export const GET = api<{ id: string }>(async ({ ctx, params }) => ({ media: await listQuoteMedia(ctx, params.id) }));

/** Ajout d'une photo annotée ou d'un croquis (envoi multipart : image, type, légende). */
export const POST = api<{ id: string }>(async ({ req, ctx, params }) => {
  const length = Number(req.headers.get("content-length") ?? 0);
  if (length > MEDIA_MAX_BYTES + 100_000) throw badRequest("Image trop lourde (1,5 Mo au plus)");
  await hitRate(ctx.db, "job.photo", ctx.orgId);
  const form = await req.formData().catch(() => {
    throw badRequest("Envoi illisible");
  });
  const file = form.get("image");
  if (!(file instanceof File) || !file.size) throw badRequest("Image manquante");
  const id = await addQuoteMedia(
    ctx,
    params.id,
    { kind: form.get("kind"), caption: form.get("caption") ?? "" },
    new Uint8Array(await file.arrayBuffer()),
  );
  return { id };
});
