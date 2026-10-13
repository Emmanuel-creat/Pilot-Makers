import { hitRate } from "@/lib/rate-limit";
import { api } from "@/lib/server/session";
import { vatReturn, vatReturnCsv } from "@/lib/services/finance";

/** TVA préparée d'une période : /api/reports/tva?du=AAAA-MM-JJ&au=AAAA-MM-JJ */
export const GET = api(async ({ req, ctx }) => {
  await hitRate(ctx.db, "files.transfer", ctx.orgId);
  const u = new URL(req.url);
  const from = u.searchParams.get("du") ?? "";
  const to = u.searchParams.get("au") ?? "";
  const csv = vatReturnCsv(await vatReturn(ctx, from, to));
  return new Response(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="tva-${from}-${to}.csv"`,
      "cache-control": "no-store",
    },
  });
});
