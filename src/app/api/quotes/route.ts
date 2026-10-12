import { api, readJson } from "@/lib/server/session";
import { createQuote, listQuotes } from "@/lib/services/quotes";

export const GET = api(async ({ req, ctx }) => {
  const u = new URL(req.url);
  const p = (k: string) => u.searchParams.get(k) ?? undefined;
  return listQuotes(ctx, {
    status: p("status"),
    customerId: p("customer"),
    q: p("q"),
    from: p("from"),
    to: p("to"),
    minTtc: p("min") ? Number(p("min")) : undefined,
    maxTtc: p("max") ? Number(p("max")) : undefined,
    archived: p("archived") === "1",
    sort: p("sort") as never,
    dir: p("dir") as never,
    page: Number(p("page") ?? 1),
    pageSize: Number(p("pageSize") ?? 25),
  });
});

export const POST = api(async ({ req, ctx }) => {
  const body = await readJson(req);
  const id = await createQuote(ctx, {
    customerId: typeof body.customerId === "string" ? body.customerId : null,
    title: typeof body.title === "string" ? body.title : "",
    description: typeof body.description === "string" ? body.description : "",
  });
  return { id };
});
