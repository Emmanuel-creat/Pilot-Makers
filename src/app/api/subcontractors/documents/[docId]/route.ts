import { api } from "@/lib/server/session";
import { documentFile } from "@/lib/services/subcontractors";

/** Document d'un sous-traitant, ouvert dans le navigateur. */
export const GET = api<{ docId: string }>(async ({ ctx, params }) => {
  const f = await documentFile(ctx, params.docId);
  return new Response(Buffer.from(f.bytes), {
    headers: {
      "content-type": f.type,
      "content-disposition": `inline; filename="${f.name.replace(/"/g, "")}"`,
      "x-content-type-options": "nosniff",
      "cache-control": "private, no-store",
    },
  });
});
