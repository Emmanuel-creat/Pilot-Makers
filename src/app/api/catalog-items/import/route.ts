import { HttpError } from "@/lib/http";
import { hitRate } from "@/lib/rate-limit";
import { applyMapping, asTable, describeColumns, importTable, looksLikeOther } from "@/lib/server/import-body";
import { api, readJson } from "@/lib/server/session";
import { catalogImportField, importCatalogCsv } from "@/lib/services/catalog";
import { customerImportField } from "@/lib/services/customers";

export const POST = api(async ({ req, ctx }) => {
  const body = await readJson(req);
  const original = asTable(importTable(body));
  const table = applyMapping(original, body.mapping, "catalog");
  if (body.commit === true) await hitRate(ctx.db, "files.transfer", ctx.orgId);
  if (body.commit === true) return importCatalogCsv(ctx, table, false);
  const columns = describeColumns(original, table, catalogImportField);
  const other = looksLikeOther(original[0] ?? [], catalogImportField, customerImportField);
  try {
    return { ...(await importCatalogCsv(ctx, table, true)), columns, looksLikeOther: other };
  } catch (e) {
    // Colonne de la désignation non reconnue : l'écran de correspondance permet de la désigner à la main.
    if (e instanceof HttpError && e.status === 400 && original.length > 1) return { results: [], columns, looksLikeOther: other, problem: e.message };
    throw e;
  }
});
