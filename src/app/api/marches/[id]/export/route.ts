import { hitRate } from "@/lib/rate-limit";
import { api } from "@/lib/server/session";
import { exportTender } from "@/lib/services/tenders";

/** Tableau de l'acheteur rempli avec les prix du devis, à reporter dans la réponse au marché. */
export const GET = api<{ id: string }>(async ({ ctx, params }) => {
  await hitRate(ctx.db, "files.transfer", ctx.orgId);
  const r = await exportTender(ctx, params.id);
  return new Response(r.csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${encodeURIComponent(r.fileName)}"`,
      "cache-control": "no-store",
    },
  });
});
