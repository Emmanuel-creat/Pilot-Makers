import { api } from "@/lib/server/session";
import { subQuoteFile } from "@/lib/services/subcontractor-quotes";

/** Devis joint par un sous-traitant à sa réponse, ouvert dans le navigateur. */
export const GET = api<{ id: string }>(async ({ ctx, params }) => {
  const f = await subQuoteFile(ctx, params.id);
  return new Response(Buffer.from(f.bytes), {
    headers: {
      "content-type": f.type,
      "content-disposition": `inline; filename="${f.name.replace(/"/g, "")}"`,
      "x-content-type-options": "nosniff",
      "cache-control": "private, no-store",
    },
  });
});
