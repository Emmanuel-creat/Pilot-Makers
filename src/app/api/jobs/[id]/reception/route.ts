import { api } from "@/lib/server/session";
import { receptionPdf } from "@/lib/services/job-site";

/** Procès-verbal de réception signé (PDF figé). */
export const GET = api<{ id: string }>(async ({ ctx, params }) => {
  const r = await receptionPdf(ctx, params.id);
  return new Response(Buffer.from(r.pdf), {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": 'inline; filename="proces-verbal-reception.pdf"',
      "x-content-sha256": r.pdf_sha256,
      "cache-control": "private, no-store",
    },
  });
});
