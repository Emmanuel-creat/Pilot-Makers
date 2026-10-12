import { getDb } from "@/lib/db";
import { forbidden, notFound } from "@/lib/http";
import { safeEqual } from "@/lib/security";
import { errorResponse } from "@/lib/server/session";
import { applyMailEvent } from "@/lib/services/mail";
import { normalizeMailEvent } from "@/lib/services/mail-providers";

/**
 * Suivi des e-mails envoyé par le prestataire (rejets, plaintes, remises).
 * URL à déclarer chez le prestataire : /api/mail/webhook/<prestataire>?cle=<MAIL_WEBHOOK_SECRET>
 */
export async function POST(req: Request, { params }: { params: Promise<{ provider: string }> }) {
  try {
    const { provider } = await params;
    if (!["brevo", "postmark", "resend"].includes(provider)) throw notFound();
    const secret = process.env.MAIL_WEBHOOK_SECRET ?? "";
    const given = new URL(req.url).searchParams.get("cle") ?? "";
    if (!secret || !safeEqual(given, secret)) throw forbidden("Clé de suivi invalide");
    const db = await getDb();
    let applied = 0;
    for (const ev of normalizeMailEvent(provider, await req.json())) if (await applyMailEvent(db, provider, ev)) applied++;
    return Response.json({ received: true, applied });
  } catch (e) {
    return errorResponse(e);
  }
}
