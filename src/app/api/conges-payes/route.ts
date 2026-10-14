import { hitRate } from "@/lib/rate-limit";
import { api } from "@/lib/server/session";
import { declarationCsv } from "@/lib/services/leave-fund";

/** Déclaration de congés payés d'un mois, à reporter sur le site de la caisse. */
export const GET = api(async ({ req, ctx }) => {
  await hitRate(ctx.db, "files.transfer", ctx.orgId);
  const period = new URL(req.url).searchParams.get("periode") ?? "";
  const csv = await declarationCsv(ctx, period);
  return new Response(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="conges-payes-${period}.csv"`,
      "cache-control": "no-store",
    },
  });
});
