import { api } from "@/lib/server/session";
import { einvoiceFile } from "@/lib/services/einvoice";

/** Facture au format structuré : ?format=facturx (PDF avec XML joint), cii ou ubl. */
export const GET = api<{ id: string }>(async ({ req, ctx, params }) => {
  const r = await einvoiceFile(ctx, params.id, new URL(req.url).searchParams.get("format") ?? "facturx");
  return new Response(Buffer.from(r.body), {
    headers: {
      "content-type": r.contentType,
      "content-disposition": `attachment; filename="${r.filename}"`,
      "cache-control": "private, no-store",
    },
  });
});
