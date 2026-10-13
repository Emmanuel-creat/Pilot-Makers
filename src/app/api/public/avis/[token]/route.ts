import { getDb } from "@/lib/db";
import { errorResponse, readJson, requestMeta } from "@/lib/server/session";
import { submitReview } from "@/lib/services/reviews";

/** Avis déposé par le client depuis le lien reçu après son chantier. */
export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await params;
    await submitReview(await getDb(), token, await readJson(req), await requestMeta());
    return Response.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
