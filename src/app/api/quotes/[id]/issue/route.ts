import { api, readJson } from "@/lib/server/session";
import { issueQuote } from "@/lib/services/quotes";

export const POST = api<{ id: string }>(async ({ req, ctx, params }) => {
  const body = await readJson(req);
  if (body.confirm !== true) return Response.json({ error: "Confirmation requise", code: "confirm_required" }, { status: 400 });
  return issueQuote(ctx, params.id, typeof body.draftRevision === "number" ? body.draftRevision : undefined);
});
