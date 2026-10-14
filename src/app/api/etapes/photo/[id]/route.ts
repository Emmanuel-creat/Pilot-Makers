import { api } from "@/lib/server/session";
import { stagePhotoForOrg } from "@/lib/services/payment-stages";

/** Photo d'une étape de paiement, réservée à l'entreprise. */
export const GET = api<{ id: string }>(async ({ ctx, params }) => {
  const f = await stagePhotoForOrg(ctx, params.id);
  return new Response(Buffer.from(f.bytes), {
    headers: { "content-type": f.type, "x-content-type-options": "nosniff", "cache-control": "private, max-age=3600" },
  });
});
