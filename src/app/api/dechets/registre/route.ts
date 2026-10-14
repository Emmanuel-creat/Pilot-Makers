import { hitRate } from "@/lib/rate-limit";
import { api } from "@/lib/server/session";
import { wasteRegisterCsv } from "@/lib/services/waste";

/** Registre chronologique des déchets sortants d'une année, pour un contrôle ou l'éco-organisme. */
export const GET = api(async ({ req, ctx }) => {
  await hitRate(ctx.db, "files.transfer", ctx.orgId);
  const year = Number(new URL(req.url).searchParams.get("annee"));
  const csv = await wasteRegisterCsv(ctx, year);
  return new Response(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="registre-dechets-${year}.csv"`,
      "cache-control": "no-store",
    },
  });
});
