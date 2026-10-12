import { api } from "@/lib/server/session";
import { num } from "@/lib/db";
import { notFound } from "@/lib/http";
import { getQuoteRow, getVersion } from "@/lib/services/quotes";

/** PDF d'une version émise : seulement pour les membres de l'entreprise, jamais par URL publique permanente. */
export const GET = api<{ id: string }>(async ({ req, ctx, params }) => {
  const row = await getQuoteRow(ctx.db, ctx, params.id);
  const requested = new URL(req.url).searchParams.get("version");
  const version = requested ? Number(requested) : num(row.current_version);
  if (!version) throw notFound("Ce devis n'a pas encore été émis");
  const v = await getVersion(ctx.db, ctx.orgId, params.id, version);
  return new Response(Buffer.from(v.pdf), {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `${new URL(req.url).searchParams.get("download") ? "attachment" : "inline"}; filename="Devis-${v.number}-v${v.version}.pdf"`,
      "cache-control": "private, no-store",
      "x-content-sha256": v.pdfSha256,
    },
  });
});
