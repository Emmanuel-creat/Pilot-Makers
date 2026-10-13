import { hitRate } from "@/lib/rate-limit";
import { api } from "@/lib/server/session";
import { expensesCsv } from "@/lib/services/expenses";

/** Notes de frais d'un mois, pour la comptabilité. */
export const GET = api(async ({ req, ctx }) => {
  await hitRate(ctx.db, "files.transfer", ctx.orgId);
  const month = new URL(req.url).searchParams.get("mois") ?? "";
  const csv = await expensesCsv(ctx, month);
  return new Response(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="notes-de-frais-${month.replace(/[^\d-]/g, "")}.csv"`,
      "cache-control": "no-store",
    },
  });
});
