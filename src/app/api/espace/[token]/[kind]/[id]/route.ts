import { getDb } from "@/lib/db";
import { errorResponse, requestMeta } from "@/lib/server/session";
import { portalPdf } from "@/lib/services/client-space";

/** Documents de l'espace client : devis, facture ou procès-verbal de réception, en PDF. */
export async function GET(_: Request, context: { params: Promise<{ token: string; kind: string; id: string }> }) {
  try {
    const { token, kind, id } = await context.params;
    const r = await portalPdf(await getDb(), token, kind, id, await requestMeta());
    return new Response(Buffer.from(r.pdf), {
      headers: {
        "content-type": "application/pdf",
        "content-disposition": `inline; filename="${r.name.replace(/[^\w.-]/g, "_")}"`,
        "cache-control": "private, no-store",
        "x-robots-tag": "noindex",
      },
    });
  } catch (e) {
    return errorResponse(e);
  }
}
