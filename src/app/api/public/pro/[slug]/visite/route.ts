import { getDb } from "@/lib/db";
import { errorResponse, readJson, requestMeta } from "@/lib/server/session";
import { bookVisit } from "@/lib/services/visits";

/** Rendez-vous de visite réservé depuis la vitrine d'une entreprise. */
export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await params;
    const r = await bookVisit(await getDb(), slug, await readJson(req), await requestMeta());
    return Response.json(r);
  } catch (e) {
    return errorResponse(e);
  }
}
