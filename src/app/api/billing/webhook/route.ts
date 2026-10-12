import { getDb } from "@/lib/db";
import { errorResponse } from "@/lib/server/session";
import { handleWebhookEvent, verifyWebhook, type WebhookEvent } from "@/lib/services/billing";

/** Webhook du prestataire de paiement : signature vérifiée, traitement idempotent. */
export async function POST(req: Request) {
  try {
    const payload = await req.text();
    verifyWebhook(payload, req.headers.get("x-signature"));
    const event = JSON.parse(payload) as WebhookEvent;
    const r = await handleWebhookEvent(await getDb(), req.headers.get("x-provider") ?? "simulated", event);
    return Response.json({ received: true, duplicate: r.duplicate });
  } catch (e) {
    return errorResponse(e);
  }
}
