import { hitRate } from "@/lib/rate-limit";
import { api, readJson } from "@/lib/server/session";
import { prepareVoice } from "@/lib/services/voice-assistant";

/** Assistant vocal : compréhension de la demande et préparation de l'action, sans rien modifier. */
export const POST = api(async ({ req, ctx }) => {
  await hitRate(ctx.db, "assistant.burst", ctx.orgId);
  const body = await readJson(req);
  return prepareVoice(ctx, typeof body.text === "string" ? body.text : "");
});
