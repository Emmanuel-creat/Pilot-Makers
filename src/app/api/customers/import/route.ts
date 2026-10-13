import { HttpError } from "@/lib/http";
import { hitRate } from "@/lib/rate-limit";
import { applyMapping, asTable, describeColumns, importTable, looksLikeOther } from "@/lib/server/import-body";
import { api, readJson } from "@/lib/server/session";
import { catalogImportField } from "@/lib/services/catalog";
import { commitCustomerImport, customerImportField, previewCustomerImport } from "@/lib/services/customers";

export const POST = api(async ({ req, ctx }) => {
  const body = await readJson(req);
  const original = asTable(importTable(body));
  const table = applyMapping(original, body.mapping, "customers");
  if (body.commit === true) await hitRate(ctx.db, "files.transfer", ctx.orgId);
  if (body.commit === true) return commitCustomerImport(ctx, table, { skipDuplicates: body.skipDuplicates !== false });
  const columns = describeColumns(original, table, customerImportField);
  const other = looksLikeOther(original[0] ?? [], customerImportField, catalogImportField);
  try {
    return { columns, looksLikeOther: other, rows: await previewCustomerImport(ctx, table) };
  } catch (e) {
    // Colonnes non reconnues : l'écran de correspondance permet de les désigner à la main.
    if (e instanceof HttpError && e.status === 400 && original.length > 1) return { columns, looksLikeOther: other, rows: [], problem: e.message };
    throw e;
  }
});
