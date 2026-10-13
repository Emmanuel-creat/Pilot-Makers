import { api, readJson } from "@/lib/server/session";
import { quoteMediaFile, removeQuoteMedia, updateQuoteMedia } from "@/lib/services/quote-media";

/** Image jointe à un devis, réservée à l'entreprise. */
export const GET = api<{ id: string }>(async ({ ctx, params }) => {
  const f = await quoteMediaFile(ctx, params.id);
  return new Response(Buffer.from(f.bytes), {
    headers: { "content-type": f.type, "x-content-type-options": "nosniff", "cache-control": "private, max-age=3600" },
  });
});

/** Légende ou ordre : { caption } ou { move: "up" | "down" }. */
export const PATCH = api<{ id: string }>(async ({ req, ctx, params }) => {
  const body = await readJson(req);
  await updateQuoteMedia(ctx, params.id, { caption: body.caption, move: body.move });
  return { ok: true };
});

export const DELETE = api<{ id: string }>(async ({ ctx, params }) => {
  await removeQuoteMedia(ctx, params.id);
  return { ok: true };
});
