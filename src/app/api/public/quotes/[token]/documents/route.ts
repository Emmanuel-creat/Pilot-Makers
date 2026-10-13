import { getDb } from "@/lib/db";
import { hitRate } from "@/lib/rate-limit";
import { errorResponse, requestMeta } from "@/lib/server/session";
import { mergedDocuments } from "@/lib/services/datasheets";
import { resolveShareToken } from "@/lib/services/quotes";

/** Fiches techniques et certificats joints au devis, pour le client qui a le lien. */
export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await params;
    const db = await getDb();
    await hitRate(db, "public.view", (await requestMeta()).ip);
    const r = await resolveShareToken(db, token);
    if (!r) return new Response("Lien invalide ou expiré", { status: 404 });
    const pdf = await mergedDocuments(db, r.link.org_id, r.version.number, r.version.snapshot.documents ?? []);
    return new Response(Buffer.from(pdf), {
      headers: {
        "content-type": "application/pdf",
        "content-disposition": `inline; filename="Devis-${r.version.number}-documents.pdf"`,
        "cache-control": "private, no-store",
        "x-robots-tag": "noindex",
      },
    });
  } catch (e) {
    return errorResponse(e);
  }
}
