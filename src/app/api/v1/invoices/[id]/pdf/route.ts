import { isUuid, notFound } from "@/lib/http";
import { apiV1 } from "@/lib/server/api-v1";
import { apiInvoicePdf } from "@/lib/services/public-api";

export const GET = apiV1<{ id: string }>(async ({ ctx, params }) => {
  if (!isUuid(params.id)) throw notFound("Facture introuvable");
  const r = await apiInvoicePdf(ctx, params.id);
  return new Response(new Uint8Array(r.pdf), {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `attachment; filename="${r.number.replace(/[^\w.-]+/g, "-")}.pdf"`,
      "x-content-sha256": r.pdf_sha256,
      "cache-control": "no-store",
    },
  });
});
