import { api, readJson } from "@/lib/server/session";
import { heartbeat, leave } from "@/lib/services/presence";

/** Signal de présence de l'éditeur ouvert : renvoie les autres personnes présentes et la révision enregistrée. */
export const POST = api<{ id: string }>(async ({ req, ctx, params }) => {
  const body = await readJson(req);
  return heartbeat(ctx, params.id, String(body.sectionId ?? ""));
});

export const DELETE = api<{ id: string }>(async ({ ctx, params }) => {
  await leave(ctx, params.id);
  return { ok: true };
});
