import { api, readJson } from "@/lib/server/session";
import { executeVoice } from "@/lib/services/voice-assistant";

/** Assistant vocal : exécution de l'action relue et confirmée par l'utilisateur. */
export const POST = api(async ({ req, ctx }) => {
  const body = await readJson(req);
  return executeVoice(ctx, typeof body.action === "string" ? body.action : "", body.values);
});
