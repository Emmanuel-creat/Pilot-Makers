import { hitRate } from "@/lib/rate-limit";
import { importTable } from "@/lib/server/import-body";
import { api, readJson } from "@/lib/server/session";
import { commitCustomerImport, previewCustomerImport } from "@/lib/services/customers";

export const POST = api(async ({ req, ctx }) => {
  const body = await readJson(req);
  const table = importTable(body);
  if (body.commit === true) await hitRate(ctx.db, "files.transfer", ctx.orgId);
  if (body.commit === true) return commitCustomerImport(ctx, table, { skipDuplicates: body.skipDuplicates !== false });
  return { rows: await previewCustomerImport(ctx, table) };
});
