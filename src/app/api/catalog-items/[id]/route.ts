import { api, readJson } from "@/lib/server/session";
import { getItem, priceHistory, updateItem } from "@/lib/services/catalog";

export const GET = api<{ id: string }>(async ({ ctx, params }) => ({ item: await getItem(ctx, params.id), history: await priceHistory(ctx, params.id) }));

export const PATCH = api<{ id: string }>(async ({ req, ctx, params }) => {
  await updateItem(ctx, params.id, await readJson(req));
  return { item: await getItem(ctx, params.id) };
});
