import { api, readJson } from "@/lib/server/session";
import { badRequest } from "@/lib/http";
import { getDraft, saveDraft } from "@/lib/services/quotes";

export const GET = api<{ id: string }>(async ({ ctx, params }) => ({ quote: await getDraft(ctx, params.id) }));

export const PATCH = api<{ id: string }>(async ({ req, ctx, params }) => {
  const body = await readJson(req);
  const revision = Number(body.draftRevision);
  if (!Number.isInteger(revision)) throw badRequest("Révision du brouillon manquante");
  return saveDraft(ctx, params.id, body.quote ?? body, revision);
});
