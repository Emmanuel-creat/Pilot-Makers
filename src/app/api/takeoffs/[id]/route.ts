import { api } from "@/lib/server/session";
import { takeoffImage } from "@/lib/services/takeoffs";

/** Image du plan d'un métré, réservée à l'entreprise. */
export const GET = api<{ id: string }>(async ({ ctx, params }) => {
  const f = await takeoffImage(ctx, params.id);
  return new Response(Buffer.from(f.bytes), {
    headers: { "content-type": f.type, "x-content-type-options": "nosniff", "cache-control": "private, max-age=3600" },
  });
});
