import { hitRate } from "@/lib/rate-limit";
import { api } from "@/lib/server/session";
import { yearEndCsv } from "@/lib/services/year-end";

/** Dossier de clôture de l'exercice, à transmettre à l'expert-comptable. */
export const GET = api(async ({ req, ctx }) => {
  await hitRate(ctx.db, "files.transfer", ctx.orgId);
  const year = Number(new URL(req.url).searchParams.get("annee"));
  const csv = await yearEndCsv(ctx, year);
  return new Response(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="cloture-${year}.csv"`,
      "cache-control": "no-store",
    },
  });
});
