import { api, readJson } from "@/lib/server/session";
import { getCustomer, updateCustomer } from "@/lib/services/customers";

export const GET = api<{ id: string }>(async ({ ctx, params }) => ({ customer: await getCustomer(ctx, params.id) }));

export const PATCH = api<{ id: string }>(async ({ req, ctx, params }) => {
  await updateCustomer(ctx, params.id, await readJson(req));
  return { ok: true };
});
