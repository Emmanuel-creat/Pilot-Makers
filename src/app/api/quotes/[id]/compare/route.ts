import { api } from "@/lib/server/session";
import { compareVersions } from "@/lib/services/quotes";

export const GET = api<{ id: string }>(async ({ req, ctx, params }) => {
  const u = new URL(req.url);
  return compareVersions(ctx, params.id, Number(u.searchParams.get("a") ?? 1), Number(u.searchParams.get("b") ?? 2));
});
