import { getDb } from "@/lib/db";
import { errorResponse } from "@/lib/server/session";
import { safeEqual } from "@/lib/security";
import { purgeRateLimits } from "@/lib/rate-limit";
import { resetDemo } from "@/lib/seed";
import { purgeDeletedAccounts } from "@/lib/services/accounts";
import { runBillingMaintenance } from "@/lib/services/billing";
import { expireQuotes } from "@/lib/services/quotes";
import { purgeWebhookDeliveries } from "@/lib/services/webhooks";
import { purgeJobs } from "@/lib/services/task-queue";
import { sendAlert } from "@/lib/monitoring";
import { verifySealed } from "@/lib/services/sealed-journal";

/** Maintenance quotidienne : expirations, renouvellements, suppressions de comptes arrivées à échéance,
 * remise à zéro de la démonstration si DEMO_RESET=1. */
export async function POST(req: Request) {
  try {
    const secret = process.env.CRON_SECRET ?? "";
    const given = (req.headers.get("authorization") ?? "").replace(/^Bearer /, "");
    if (!secret || !safeEqual(given, secret)) return new Response("Non autorisé", { status: 401 });
    const db = await getDb();
    const journal = await verifySealed(db);
    if (!journal.ok) await sendAlert(`Pilot-Makers : journal scellé rompu à l'entrée ${journal.brokenAt} (${journal.reason}).`);
    return Response.json({
      sealedJournal: { ok: journal.ok, count: journal.count, brokenAt: journal.brokenAt ?? null },
      expired: await expireQuotes(db),
      billing: await runBillingMaintenance(db),
      accounts: await purgeDeletedAccounts(db),
      rateLimits: await purgeRateLimits(db),
      webhooks: await purgeWebhookDeliveries(db),
      jobs: await purgeJobs(db),
      // Instance de démonstration publique uniquement : le compte de démonstration repart de zéro chaque nuit.
      demo: process.env.DEMO_RESET === "1" ? await resetDemo(db) : null,
    });
  } catch (e) {
    return errorResponse(e);
  }
}
