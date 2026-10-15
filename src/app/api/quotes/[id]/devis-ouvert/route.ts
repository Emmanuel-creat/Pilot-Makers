import { api } from "@/lib/server/session";
import { EXCHANGE_FORMAT } from "@/lib/quote-exchange";
import { exportQuoteExchange } from "@/lib/services/quote-exchange";

/** Devis au format ouvert Devis ouvert (JSON), pour un autre logiciel ou un confrère. */
export const GET = api<{ id: string }>(async ({ ctx, params }) => {
  const { doc, filename } = await exportQuoteExchange(ctx, params.id);
  return new Response(JSON.stringify(doc, null, 2), {
    headers: {
      "content-type": `${EXCHANGE_FORMAT.mediaType}; charset=utf-8`,
      "content-disposition": `attachment; filename="${encodeURIComponent(filename)}"`,
      "cache-control": "private, no-store",
    },
  });
});
