import { hitRate } from "@/lib/rate-limit";
import { api } from "@/lib/server/session";
import { customersCsv } from "@/lib/services/customers";

export const GET = api(async ({ ctx }) => {
  await hitRate(ctx.db, "files.transfer", ctx.orgId);
  return new Response(await customersCsv(ctx), {
    headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": 'attachment; filename="clients.csv"', "cache-control": "no-store" },
  });
});
