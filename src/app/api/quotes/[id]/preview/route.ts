import { api, readJson } from "@/lib/server/session";
import { previewQuote } from "@/lib/services/quotes";

export const POST = api<{ id: string }>(async ({ req, ctx, params }) => {
  const body = await readJson(req);
  return previewQuote(ctx, params.id, body.quote ?? undefined);
});
