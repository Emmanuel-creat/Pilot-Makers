import { badRequest } from "@/lib/http";
import { hitRate } from "@/lib/rate-limit";
import { importTable } from "@/lib/server/import-body";
import { api, readJson } from "@/lib/server/session";
import { parseCsv } from "@/lib/csv";
import { importSupplierPrices } from "@/lib/services/supplier-prices";

/** Fichier de prix d'un fournisseur : aperçu des prix d'achat modifiés, puis application après confirmation. */
export const POST = api(async ({ req, ctx }) => {
  const body = await readJson(req);
  const raw = importTable(body);
  const table = typeof raw === "string" ? parseCsv(raw) : raw;
  if (!table.length) throw badRequest("Fichier vide");
  if (body.commit === true) await hitRate(ctx.db, "files.transfer", ctx.orgId);
  return importSupplierPrices(ctx, { supplier: body.supplier, minMarginPercent: body.minMarginPercent }, table, body.commit === true);
});
