import { apiV1 } from "@/lib/server/api-v1";
import { apiQuotePdf } from "@/lib/services/public-api";

export const GET = apiV1<{ id: string }>(async ({ ctx, params, url }) => {
  const v = url.searchParams.get("version");
  const r = await apiQuotePdf(ctx, params.id, v ? Number(v) || undefined : undefined);
  return new Response(new Uint8Array(r.pdf), {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `attachment; filename="${r.number.replace(/[^\w.-]+/g, "-")}-v${r.version}.pdf"`,
      "x-content-sha256": r.pdfSha256,
      "cache-control": "no-store",
    },
  });
});
