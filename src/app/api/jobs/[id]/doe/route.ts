import { api } from "@/lib/server/session";
import { doePdf } from "@/lib/services/doe";

/** Dossier des ouvrages exécutés du chantier, documents annexés. */
export const GET = api<{ id: string }>(async ({ ctx, params }) => {
  const pdf = await doePdf(ctx, params.id);
  return new Response(Buffer.from(pdf), {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": 'inline; filename="dossier-ouvrages-executes.pdf"',
      "cache-control": "private, no-store",
    },
  });
});
