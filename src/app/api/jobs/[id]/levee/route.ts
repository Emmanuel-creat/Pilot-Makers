import { api } from "@/lib/server/session";
import { liftingPdf } from "@/lib/services/job-site";

/** Procès-verbal de levée des réserves, quand toutes sont levées. */
export const GET = api<{ id: string }>(async ({ ctx, params }) => {
  const pdf = await liftingPdf(ctx, params.id);
  return new Response(Buffer.from(pdf), {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": 'inline; filename="proces-verbal-levee-des-reserves.pdf"',
      "cache-control": "private, no-store",
    },
  });
});
