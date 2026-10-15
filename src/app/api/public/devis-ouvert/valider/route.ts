import { getDb } from "@/lib/db";
import { badRequest } from "@/lib/http";
import { validateExchange } from "@/lib/quote-exchange";
import { hitRate } from "@/lib/rate-limit";
import { errorResponse, requestMeta } from "@/lib/server/session";

const CORS = { "access-control-allow-origin": "*", "access-control-allow-methods": "POST, OPTIONS", "access-control-allow-headers": "content-type" };
const MAX_BYTES = 1_000_000;

/** Validateur public du format Devis ouvert, ouvert à tous les logiciels de la filière (sans compte, sans conservation). */
export async function POST(req: Request) {
  try {
    const db = await getDb();
    const meta = await requestMeta();
    await hitRate(db, "public.validate", meta.ip);
    const text = await req.text();
    if (text.length > MAX_BYTES) throw badRequest("Fichier trop volumineux (1 Mo au plus)");
    let raw: unknown;
    try {
      raw = JSON.parse(text);
    } catch {
      return Response.json({ valid: false, errors: ["Le contenu n'est pas un JSON valide"], warnings: [], summary: null }, { headers: CORS });
    }
    return Response.json(validateExchange(raw), { headers: { ...CORS, "cache-control": "no-store" } });
  } catch (e) {
    const r = errorResponse(e);
    for (const [k, v] of Object.entries(CORS)) r.headers.set(k, v);
    return r;
  }
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}
