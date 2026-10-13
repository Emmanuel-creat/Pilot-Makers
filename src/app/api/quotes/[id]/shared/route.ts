import { api, readJson } from "@/lib/server/session";
import { markSharedByMessage } from "@/lib/services/quotes";

/** Le lien de consultation vient d'être ouvert dans Messages ou WhatsApp pour être envoyé au client. */
export const POST = api<{ id: string }>(async ({ req, ctx, params }) => {
  const body = await readJson(req);
  await markSharedByMessage(ctx, params.id, String(body.channel ?? ""));
  return { ok: true };
});
