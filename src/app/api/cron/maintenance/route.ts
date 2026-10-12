import { getDb } from "@/lib/db";
import { errorResponse } from "@/lib/server/session";
import { safeEqual } from "@/lib/security";
import { purgeDeletedAccounts } from "@/lib/services/accounts";
import { runBillingMaintenance } from "@/lib/services/billing";
import { expireQuotes } from "@/lib/services/quotes";

/** Maintenance quotidienne : expirations, renouvellements, suppressions de comptes arrivées à échéance. */
export async function POST(req: Request) {
  try {
    const secret = process.env.CRON_SECRET ?? "";
    const given = (req.headers.get("authorization") ?? "").replace(/^Bearer /, "");
    if (!secret || !safeEqual(given, secret)) return new Response("Non autorisé", { status: 401 });
    const db = await getDb();
    return Response.json({
      expired: await expireQuotes(db),
      billing: await runBillingMaintenance(db),
      accounts: await purgeDeletedAccounts(db),
    });
  } catch (e) {
    return errorResponse(e);
  }
}
