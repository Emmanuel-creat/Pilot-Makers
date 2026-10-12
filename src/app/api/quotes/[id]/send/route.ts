import { api, readJson } from "@/lib/server/session";
import { sendQuote } from "@/lib/services/quotes";

export const POST = api<{ id: string }>(async ({ req, ctx, params }) => {
  const body = await readJson(req);
  const key = req.headers.get("idempotency-key") ?? (typeof body.idempotencyKey === "string" ? body.idempotencyKey : undefined);
  return sendQuote(ctx, params.id, { ...body, idempotencyKey: key });
});
