import { getDb } from "@/lib/db";
import { isUuid } from "@/lib/http";
import { errorResponse } from "@/lib/server/session";
import { publicShowcasePhoto } from "@/lib/services/showcase";

/** Photo de la galerie d'une vitrine, publiée sans ses métadonnées. */
export async function GET(_req: Request, { params }: { params: Promise<{ slug: string; id: string }> }) {
  try {
    const { slug, id } = await params;
    if (!isUuid(id)) return new Response("Photo introuvable", { status: 404 });
    const p = await publicShowcasePhoto(await getDb(), slug, id);
    return new Response(Buffer.from(p.bytes), {
      headers: { "content-type": p.type, "cache-control": "public, max-age=3600", "x-content-type-options": "nosniff" },
    });
  } catch (e) {
    return errorResponse(e);
  }
}
