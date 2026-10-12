import { api, readJson } from "@/lib/server/session";
import { customerDisplayName, findDuplicates } from "@/lib/services/customers";

export const POST = api(async ({ req, ctx }) => {
  const body = await readJson(req);
  const dups = await findDuplicates(ctx, body as never, typeof body.excludeId === "string" ? body.excludeId : undefined);
  return { duplicates: dups.map((d) => ({ id: d.customer.id, name: customerDisplayName(d.customer), reason: d.reason })) };
});
