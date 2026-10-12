import { api, readJson } from "@/lib/server/session";
import { createCustomer, searchCustomers } from "@/lib/services/customers";

export const GET = api(async ({ req, ctx }) => {
  const u = new URL(req.url);
  const items = await searchCustomers(ctx, {
    q: u.searchParams.get("q") ?? "",
    archived: u.searchParams.get("archived") === "1",
    tag: u.searchParams.get("tag") ?? undefined,
    limit: Number(u.searchParams.get("limit") ?? 50),
  });
  return { items };
});

export const POST = api(async ({ req, ctx }) => {
  const body = await readJson(req);
  const r = await createCustomer(ctx, body.customer ?? body, { allowDuplicate: body.allowDuplicate === true });
  return r.id ? { id: r.id } : new Response(JSON.stringify({ error: "Doublon probable", code: "duplicate", duplicates: r.duplicates }), { status: 409, headers: { "content-type": "application/json" } });
});
