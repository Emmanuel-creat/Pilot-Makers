import { api } from "@/lib/server/session";
import { getShareLink } from "@/lib/services/quotes";

export const POST = api<{ id: string }>(async ({ ctx, params }) => {
  const l = await getShareLink(ctx, params.id);
  return { url: l.url, expiresAt: l.expiresAt };
});
