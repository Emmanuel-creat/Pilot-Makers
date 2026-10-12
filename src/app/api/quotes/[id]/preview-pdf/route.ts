import { api } from "@/lib/server/session";
import { previewPdf } from "@/lib/services/quotes";

export const GET = api<{ id: string }>(async ({ ctx, params }) => {
  const pdf = await previewPdf(ctx, params.id);
  return new Response(Buffer.from(pdf), {
    headers: { "content-type": "application/pdf", "content-disposition": 'inline; filename="apercu.pdf"', "cache-control": "no-store" },
  });
});
