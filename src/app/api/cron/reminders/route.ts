import { getDb } from "@/lib/db";
import { errorResponse } from "@/lib/server/session";
import { safeEqual } from "@/lib/security";
import { runInvoiceReminders } from "@/lib/services/invoices";
import { runReminders } from "@/lib/services/reminders";
import { runSubcontractorReminders } from "@/lib/services/subcontractors";
import { runWarrantyReminders } from "@/lib/services/warranties";

/** À appeler régulièrement par une tâche planifiée, avec l'en-tête Authorization: Bearer CRON_SECRET. */
export async function POST(req: Request) {
  try {
    const secret = process.env.CRON_SECRET ?? "";
    const given = (req.headers.get("authorization") ?? "").replace(/^Bearer /, "");
    if (!secret || !safeEqual(given, secret)) return new Response("Non autorisé", { status: 401 });
    const db = await getDb();
    return Response.json({
      quotes: await runReminders(db),
      invoices: await runInvoiceReminders(db),
      subcontractors: await runSubcontractorReminders(db),
      warranties: await runWarrantyReminders(db),
    });
  } catch (e) {
    return errorResponse(e);
  }
}
