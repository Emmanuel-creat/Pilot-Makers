import { api } from "@/lib/server/session";
import { verifyVersion } from "@/lib/services/quotes";

export const GET = api<{ id: string }>(async ({ req, ctx, params }) => {
  const v = Number(new URL(req.url).searchParams.get("version") ?? 1);
  return verifyVersion(ctx, params.id, v);
});
