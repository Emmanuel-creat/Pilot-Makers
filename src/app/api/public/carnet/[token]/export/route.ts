import { getDb } from "@/lib/db";
import { hitRate } from "@/lib/rate-limit";
import { errorResponse, requestMeta } from "@/lib/server/session";
import { exportSharedHomeRecord } from "@/lib/services/home-records";

/** Fichier du carnet pour le propriétaire qui a reçu le lien : il le garde et peut le confier à tout artisan ou logiciel. */
export async function GET(_req: Request, context: { params: Promise<{ token: string }> }) {
  try {
    const db = await getDb();
    await hitRate(db, "public.view", (await requestMeta()).ip);
    const data = await exportSharedHomeRecord(db, (await context.params).token);
    if (!data) return new Response("Lien inconnu, expiré ou révoqué", { status: 404 });
    return new Response(JSON.stringify(data, null, 2), {
      headers: {
        "content-type": "application/json; charset=utf-8",
        "content-disposition": 'attachment; filename="carnet-logement.json"',
        "cache-control": "no-store",
        "x-robots-tag": "noindex",
      },
    });
  } catch (e) {
    return errorResponse(e);
  }
}
