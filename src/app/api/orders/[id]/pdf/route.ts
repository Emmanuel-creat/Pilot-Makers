import { api } from "@/lib/server/session";
import { orderPdf } from "@/lib/services/purchase-orders";

/** Bon de commande fournisseur (PDF). */
export const GET = api<{ id: string }>(async ({ ctx, params }) => {
  const r = await orderPdf(ctx, params.id);
  return new Response(Buffer.from(r.pdf), {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `inline; filename="${r.number}.pdf"`,
      "cache-control": "private, no-store",
    },
  });
});
