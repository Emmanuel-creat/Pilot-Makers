import { api } from "@/lib/server/session";
import { groupPdf } from "@/lib/services/order-groups";

/** Bon de commande groupée (PDF), avec la répartition par chantier. */
export const GET = api<{ id: string }>(async ({ ctx, params }) => {
  const r = await groupPdf(ctx, params.id);
  return new Response(Buffer.from(r.pdf), {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `inline; filename="${r.number}.pdf"`,
      "cache-control": "private, no-store",
    },
  });
});
