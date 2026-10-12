import { hitRate } from "@/lib/rate-limit";
import { api } from "@/lib/server/session";
import { catalogCsv } from "@/lib/services/catalog";

export const GET = api(async ({ ctx }) => {
  await hitRate(ctx.db, "files.transfer", ctx.orgId);
  return new Response(await catalogCsv(ctx), {
    headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": 'attachment; filename="catalogue.csv"', "cache-control": "no-store" },
  });
});
