import { num } from "@/lib/db";
import { notFound } from "@/lib/http";
import { api } from "@/lib/server/session";
import { mergedDocuments } from "@/lib/services/datasheets";
import { getQuoteRow, getVersion } from "@/lib/services/quotes";

/** Documents joints à une version émise, réunis en un PDF : /api/quotes/[id]/documents?version=N */
export const GET = api<{ id: string }>(async ({ req, ctx, params }) => {
  const row = await getQuoteRow(ctx.db, ctx, params.id);
  const requested = new URL(req.url).searchParams.get("version");
  const version = requested ? Number(requested) : num(row.current_version);
  if (!version) throw notFound("Ce devis n'a pas encore été émis");
  const v = await getVersion(ctx.db, ctx.orgId, params.id, version);
  const pdf = await mergedDocuments(ctx.db, ctx.orgId, v.number, v.snapshot.documents ?? []);
  return new Response(Buffer.from(pdf), {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `inline; filename="Devis-${v.number}-documents.pdf"`,
      "cache-control": "private, no-store",
    },
  });
});
