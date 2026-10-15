import { getDb } from "@/lib/db";
import { hitRate } from "@/lib/rate-limit";
import { errorResponse, requestMeta } from "@/lib/server/session";
import { checkKey, dbStore, verifyFileLink } from "@/lib/storage";

/** Lecture d'un fichier rangé en base par son lien signé ; un lien expiré ou modifié répond comme un fichier absent. */
export async function GET(req: Request, context: { params: Promise<{ key: string[] }> }) {
  try {
    const db = await getDb();
    await hitRate(db, "public.view", (await requestMeta()).ip);
    const key = checkKey((await context.params).key.join("/"));
    const u = new URL(req.url);
    const file = verifyFileLink(key, u.searchParams.get("exp"), u.searchParams.get("sig")) ? await dbStore(db).get(key) : null;
    if (!file) return new Response("Fichier introuvable ou lien expiré", { status: 404 });
    return new Response(Buffer.from(file.bytes), {
      headers: {
        "content-type": file.contentType,
        "cache-control": "private, max-age=300",
        "x-content-type-options": "nosniff",
        "content-disposition": "inline",
        "x-robots-tag": "noindex",
      },
    });
  } catch (e) {
    return errorResponse(e);
  }
}
