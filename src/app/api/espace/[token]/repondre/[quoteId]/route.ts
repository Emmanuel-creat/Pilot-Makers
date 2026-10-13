import { getDb } from "@/lib/db";
import { errorResponse, requestMeta } from "@/lib/server/session";
import { portalAnswerLink } from "@/lib/services/client-space";

/** Depuis l'espace client : ouvre le devis en attente sur sa page de réponse. */
export async function GET(_: Request, context: { params: Promise<{ token: string; quoteId: string }> }) {
  try {
    const { token, quoteId } = await context.params;
    const url = await portalAnswerLink(await getDb(), token, quoteId, await requestMeta());
    return new Response(null, { status: 303, headers: { location: new URL(url).pathname, "cache-control": "no-store" } });
  } catch (e) {
    return errorResponse(e);
  }
}
