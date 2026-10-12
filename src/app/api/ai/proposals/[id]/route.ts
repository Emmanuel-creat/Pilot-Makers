import { api, readJson } from "@/lib/server/session";
import { markProposalAdded } from "@/lib/services/assistant";

/** Lignes d'une proposition ajoutées au devis, pour mesurer ce qui en est gardé à l'émission. */
export const POST = api<{ id: string }>(async ({ req, ctx, params }) => {
  await markProposalAdded(ctx, params.id, await readJson(req));
  return { ok: true };
});
