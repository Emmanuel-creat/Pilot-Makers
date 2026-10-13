import { badRequest } from "@/lib/http";
import { hitRate } from "@/lib/rate-limit";
import { api } from "@/lib/server/session";
import { addJournalEntry, PHOTO_MAX_BYTES } from "@/lib/services/job-site";

/** Ajout au journal de chantier : note et photo (envoi multipart), avec la date et la position de la prise de vue. */
export const POST = api<{ id: string }>(async ({ req, ctx, params }) => {
  const length = Number(req.headers.get("content-length") ?? 0);
  if (length > PHOTO_MAX_BYTES + 200_000) throw badRequest("Photo trop lourde (2,5 Mo au plus)");
  await hitRate(ctx.db, "job.photo", ctx.orgId);
  const form = await req.formData().catch(() => {
    throw badRequest("Envoi illisible");
  });
  const file = form.get("photo");
  const photo = file instanceof File && file.size ? new Uint8Array(await file.arrayBuffer()) : null;
  const id = await addJournalEntry(ctx, params.id, {
    note: String(form.get("note") ?? ""),
    photo,
    takenAt: String(form.get("takenAt") ?? "") || undefined,
    latitude: String(form.get("latitude") ?? ""),
    longitude: String(form.get("longitude") ?? ""),
  });
  return { id };
});
