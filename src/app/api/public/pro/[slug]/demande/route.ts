import { getDb } from "@/lib/db";
import { errorResponse, readJson, requestMeta } from "@/lib/server/session";
import { requestFromShowcase } from "@/lib/services/showcase";

/** Demande de devis déposée sur la page vitrine d'une entreprise. */
export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await params;
    const r = await requestFromShowcase(await getDb(), slug, await readJson(req), await requestMeta());
    return Response.json(r);
  } catch (e) {
    return errorResponse(e);
  }
}
