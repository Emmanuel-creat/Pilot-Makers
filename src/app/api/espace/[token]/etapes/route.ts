import { getDb } from "@/lib/db";
import { api, readJson, requestMeta } from "@/lib/server/session";
import { decideStage } from "@/lib/services/payment-stages";

/** Décision du client sur une étape de paiement : validation ou contestation motivée. */
export const POST = api<{ token: string }>(
  async ({ req, params }) => {
    const body = await readJson(req);
    return { decision: await decideStage(await getDb(), params.token, String(body.stageId ?? ""), body, await requestMeta()) };
  },
  { auth: false },
);
