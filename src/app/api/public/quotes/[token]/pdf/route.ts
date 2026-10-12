import { getDb, num } from "@/lib/db";
import { errorResponse } from "@/lib/server/session";
import { acceptedCopy, resolveShareToken } from "@/lib/services/quotes";

/** PDF accessible avec le lien temporaire et révocable transmis au client. */
export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await params;
    const db = await getDb();
    const r = await resolveShareToken(db, token);
    if (!r) return new Response("Lien invalide ou expiré", { status: 404 });
    // Exemplaire accepté : seulement pour la version que le client a acceptée.
    if (new URL(req.url).searchParams.get("signe") && r.status === "accepted" && num(r.quote.accepted_version) === r.version.version) {
      const c = await acceptedCopy(db, r.link.org_id, r.link.quote_id);
      return new Response(Buffer.from(c.pdf), {
        headers: {
          "content-type": "application/pdf",
          "content-disposition": `attachment; filename="Devis-${c.number}-accepte.pdf"`,
          "cache-control": "private, no-store",
          "x-robots-tag": "noindex",
        },
      });
    }
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
