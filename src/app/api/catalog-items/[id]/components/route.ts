import { api, readJson } from "@/lib/server/session";
import { getItem } from "@/lib/services/catalog";
import { listComponents, setComponents } from "@/lib/services/ouvrages";

export const GET = api<{ id: string }>(async ({ ctx, params }) => {
  await getItem(ctx, params.id);
  return { components: await listComponents(ctx.db, ctx.orgId, params.id) };
});

/** Remplace la composition : { components: [{ itemId, quantity }] } */
export const PUT = api<{ id: string }>(async ({ req, ctx, params }) => {
  const body = await readJson(req);
  const components = await setComponents(ctx, params.id, body.components);
  return { components, item: await getItem(ctx, params.id) };
});
