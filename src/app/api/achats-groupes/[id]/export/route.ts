import { hitRate } from "@/lib/rate-limit";
import { api } from "@/lib/server/session";
import { exportCommitments } from "@/lib/services/group-buying";

/** Engagements d'un achat groupé, à transmettre au fournisseur. */
export const GET = api<{ id: string }>(async ({ ctx, params }) => {
  await hitRate(ctx.db, "files.transfer", ctx.orgId);
  const r = await exportCommitments(ctx, params.id);
  return new Response(r.csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${encodeURIComponent(r.fileName)}"`,
      "cache-control": "no-store",
    },
  });
});
