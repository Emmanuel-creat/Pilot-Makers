import { api } from "@/lib/server/session";
import { num } from "@/lib/db";
import { notFound } from "@/lib/http";
import { acceptedCopy, getQuoteRow, getVersion } from "@/lib/services/quotes";
import { renderQuotePdf } from "@/lib/pdf/quote-pdf";
import { isLang } from "@/lib/pdf/i18n";

/** PDF d'une version émise : seulement pour les membres de l'entreprise, jamais par URL publique permanente. */
export const GET = api<{ id: string }>(async ({ req, ctx, params }) => {
  const row = await getQuoteRow(ctx.db, ctx, params.id);
  const sp = new URL(req.url).searchParams;
  if (sp.get("signe")) {
    const c = await acceptedCopy(ctx.db, ctx.orgId, params.id);
    return new Response(Buffer.from(c.pdf), {
      headers: {
        "content-type": "application/pdf",
        "content-disposition": `${sp.get("download") ? "attachment" : "inline"}; filename="Devis-${c.number}-v${c.version}-accepte.pdf"`,
        "cache-control": "private, no-store",
      },
    });
  }
  const requested = new URL(req.url).searchParams.get("version");
  const version = requested ? Number(requested) : num(row.current_version);
  if (!version) throw notFound("Ce devis n'a pas encore été émis");
  const v = await getVersion(ctx.db, ctx.orgId, params.id, version);
  // Copie traduite pour un client étranger : rendue à la demande, la version française archivée fait foi.
  const lang = sp.get("langue");
  if (isLang(lang) && lang !== "fr") {
    return new Response(Buffer.from(await renderQuotePdf(v.snapshot, undefined, undefined, { lang })), {
      headers: {
        "content-type": "application/pdf",
        "content-disposition": `inline; filename="Devis-${v.number}-v${v.version}-${lang}.pdf"`,
        "cache-control": "private, no-store",
      },
    });
  }
  return new Response(Buffer.from(v.pdf), {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `${new URL(req.url).searchParams.get("download") ? "attachment" : "inline"}; filename="Devis-${v.number}-v${v.version}.pdf"`,
      "cache-control": "private, no-store",
      "x-content-sha256": v.pdfSha256,
    },
  });
});
