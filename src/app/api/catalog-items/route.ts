import { api, readJson } from "@/lib/server/session";
import { createItem, getItem, searchItems } from "@/lib/services/catalog";

export const GET = api(async ({ req, ctx }) => {
  const u = new URL(req.url);
  const items = await searchItems(ctx, {
    q: u.searchParams.get("q") ?? "",
    category: u.searchParams.get("category") ?? undefined,
    includeArchived: u.searchParams.get("archived") === "1",
    favorites: u.searchParams.get("favorites") === "1",
    sort: (u.searchParams.get("sort") as "name" | "usage" | "recent") ?? "name",
    limit: Number(u.searchParams.get("limit") ?? 500),
  });
  return { items };
});

export const POST = api(async ({ req, ctx }) => {
  const id = await createItem(ctx, await readJson(req));
  return { id, item: await getItem(ctx, id) };
});
