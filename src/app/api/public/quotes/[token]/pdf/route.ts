import { getDb } from "@/lib/db";
import { errorResponse } from "@/lib/server/session";
import { resolveShareToken } from "@/lib/services/quotes";

/** PDF accessible avec le lien temporaire et révocable transmis au client. */
export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await params;
    const r = await resolveShareToken(await getDb(), token);
    if (!r) return new Response("Lien invalide ou expiré", { status: 404 });
    return new Response(Buffer.from(r.version.pdf), {
      headers: {
        "content-type": "application/pdf",
        "content-disposition": `inline; filename="Devis-${r.version.number}.pdf"`,
        "cache-control": "private, no-store",
        "x-robots-tag": "noindex",
      },
    });
  } catch (e) {
    return errorResponse(e);
  }
}
