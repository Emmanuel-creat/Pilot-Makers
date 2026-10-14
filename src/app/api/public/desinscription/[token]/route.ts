import { getDb } from "@/lib/db";
import { errorResponse } from "@/lib/server/session";
import { unsubscribe } from "@/lib/services/campaigns";

/** Désinscription des offres de l'entreprise, confirmée depuis la page du lien reçu. */
export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await params;
    await unsubscribe(await getDb(), token);
    return Response.redirect(new URL(`/desinscription/${token}?fait=1`, req.url), 303);
  } catch (e) {
    return errorResponse(e);
  }
}
