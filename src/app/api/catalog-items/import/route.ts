import { api, readJson } from "@/lib/server/session";
import { importCatalogCsv } from "@/lib/services/catalog";
import { badRequest } from "@/lib/http";

export const POST = api(async ({ req, ctx }) => {
  const body = await readJson(req);
  const csv = typeof body.csv === "string" ? body.csv : "";
  if (csv.length > 5_000_000) throw badRequest("Fichier trop volumineux (5 Mo maximum)");
  return importCatalogCsv(ctx, csv, body.commit !== true);
});
