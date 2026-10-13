import { hitRate } from "@/lib/rate-limit";
import { importTable } from "@/lib/server/import-body";
import { api, readJson } from "@/lib/server/session";
import { importCatalogCsv } from "@/lib/services/catalog";

export const POST = api(async ({ req, ctx }) => {
  const body = await readJson(req);
  const table = importTable(body);
  if (body.commit === true) await hitRate(ctx.db, "files.transfer", ctx.orgId);
  return importCatalogCsv(ctx, table, body.commit !== true);
});
