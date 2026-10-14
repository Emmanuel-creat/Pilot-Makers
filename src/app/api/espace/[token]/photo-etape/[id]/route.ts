import { getDb } from "@/lib/db";
import { errorResponse, requestMeta } from "@/lib/server/session";
import { stagePhotoForPortal } from "@/lib/services/payment-stages";

/** Photo d'une étape de paiement, depuis l'espace client. */
export async function GET(_: Request, context: { params: Promise<{ token: string; id: string }> }) {
  try {
    const { token, id } = await context.params;
    const f = await stagePhotoForPortal(await getDb(), token, id, await requestMeta());
    return new Response(Buffer.from(f.bytes), {
      headers: { "content-type": f.type, "x-content-type-options": "nosniff", "cache-control": "private, no-store", "x-robots-tag": "noindex" },
    });
  } catch (e) {
    return errorResponse(e);
  }
}
