import { api } from "@/lib/server/session";
import { financingPdf } from "@/lib/services/financing";

/** Dossier de demande de financement, à joindre à l'envoi au financeur. */
export const GET = api<{ id: string }>(async ({ ctx, params }) => {
  const pdf = await financingPdf(ctx, params.id);
  return new Response(Buffer.from(pdf), {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": 'inline; filename="demande-de-financement.pdf"',
      "cache-control": "private, no-store",
    },
  });
});
