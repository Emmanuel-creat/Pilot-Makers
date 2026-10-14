import { api } from "@/lib/server/session";
import { safetyPdf } from "@/lib/services/safety";

/** Plan de prévention du chantier, à afficher et à faire signer. */
export const GET = api<{ id: string }>(async ({ ctx, params }) => {
  const pdf = await safetyPdf(ctx, params.id);
  return new Response(Buffer.from(pdf), {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": 'inline; filename="plan-de-prevention.pdf"',
      "cache-control": "private, no-store",
    },
  });
});
