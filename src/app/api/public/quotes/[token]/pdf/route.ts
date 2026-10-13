import { getDb, num } from "@/lib/db";
import { hitRate } from "@/lib/rate-limit";
import { errorResponse, requestMeta } from "@/lib/server/session";
import { acceptedCopy, resolveShareToken } from "@/lib/services/quotes";
import { renderQuotePdf } from "@/lib/pdf/quote-pdf";
import { isLang } from "@/lib/pdf/i18n";
import { notModified, pdfCache } from "@/lib/cache";

/** PDF accessible avec le lien temporaire et révocable transmis au client. */
export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await params;
    const db = await getDb();
    await hitRate(db, "public.view", (await requestMeta()).ip);
    const r = await resolveShareToken(db, token);
    if (!r) return new Response("Lien invalide ou expiré", { status: 404 });
    // Exemplaire accepté : seulement pour la version que le client a acceptée.
    if (new URL(req.url).searchParams.get("signe") && r.status === "accepted" && num(r.quote.accepted_version) === r.version.version) {
      // L'exemplaire accepté est toujours identique : calculé une fois par version.
      const number = r.version.number;
      const pdf = await pdfCache.remember(`accepte:${r.version.id}`, async () => (await acceptedCopy(db, r.link.org_id, r.link.quote_id)).pdf);
      return new Response(Buffer.from(pdf), {
        headers: {
          "content-type": "application/pdf",
          "content-disposition": `attachment; filename="Devis-${number}-accepte.pdf"`,
          "cache-control": "private, no-store",
          "x-robots-tag": "noindex",
        },
      });
    }
    const lang = new URL(req.url).searchParams.get("langue");
    if (isLang(lang) && lang !== "fr") {
      const pdf = await pdfCache.remember(`langue:${r.version.id}:${lang}`, () => renderQuotePdf(r.version.snapshot, undefined, undefined, { lang }));
      return new Response(Buffer.from(pdf), {
        headers: {
          "content-type": "application/pdf",
          "content-disposition": `inline; filename="Devis-${r.version.number}-${lang}.pdf"`,
          "cache-control": "private, no-store",
          "x-robots-tag": "noindex",
        },
      });
    }
    // Le PDF émis est figé : le navigateur qui l'a déjà le garde (réponse 304, rien n'est renvoyé).
    const headers = { "cache-control": "private, no-cache", "x-robots-tag": "noindex" };
    const etag = `"${r.version.pdfSha256}"`;
    const cached = notModified(req, etag, headers);
    if (cached) return cached;
    return new Response(Buffer.from(r.version.pdf), {
      headers: {
        ...headers,
        etag,
        "content-type": "application/pdf",
        "content-disposition": `inline; filename="Devis-${r.version.number}.pdf"`,
      },
    });
  } catch (e) {
    return errorResponse(e);
  }
}
