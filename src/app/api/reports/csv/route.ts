import { hitRate } from "@/lib/rate-limit";
import { api } from "@/lib/server/session";
import { getReport, reportCsv } from "@/lib/services/reports";

/** Rapport mensuel des 12 derniers mois, au format tableur. */
export const GET = api(async ({ ctx }) => {
  await hitRate(ctx.db, "files.transfer", ctx.orgId);
  const csv = reportCsv(await getReport(ctx));
  return new Response(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": 'attachment; filename="rapport-mensuel.csv"',
      "cache-control": "no-store",
    },
  });
});
