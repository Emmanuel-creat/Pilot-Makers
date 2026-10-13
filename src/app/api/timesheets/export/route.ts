import { hitRate } from "@/lib/rate-limit";
import { api } from "@/lib/server/session";
import { payrollCsv, timesheetDetailCsv } from "@/lib/services/timesheets";

/** Export des heures validées d'un mois : récapitulatif pour la paie, ou détail par pointage. */
export const GET = api(async ({ req, ctx }) => {
  await hitRate(ctx.db, "files.transfer", ctx.orgId);
  const url = new URL(req.url);
  const month = url.searchParams.get("mois") ?? "";
  const detail = url.searchParams.get("type") === "detail";
  const csv = detail ? await timesheetDetailCsv(ctx, month) : await payrollCsv(ctx, month);
  return new Response(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="heures-${detail ? "detail" : "paie"}-${month.replace(/[^\d-]/g, "")}.csv"`,
      "cache-control": "no-store",
    },
  });
});
