import { hitRate } from "@/lib/rate-limit";
import { api, readJson } from "@/lib/server/session";
import { commitCustomerImport, previewCustomerImport } from "@/lib/services/customers";
import { badRequest } from "@/lib/http";

export const POST = api(async ({ req, ctx }) => {
  const body = await readJson(req);
  const csv = typeof body.csv === "string" ? body.csv : "";
  if (csv.length > 5_000_000) throw badRequest("Fichier trop volumineux (5 Mo maximum)");
  if (body.commit === true) await hitRate(ctx.db, "files.transfer", ctx.orgId);
  if (body.commit === true) return commitCustomerImport(ctx, csv, { skipDuplicates: body.skipDuplicates !== false });
  return { rows: await previewCustomerImport(ctx, csv) };
});
