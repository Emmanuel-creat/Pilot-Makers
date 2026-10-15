import { getDb } from "@/lib/db";
import { errorResponse } from "@/lib/server/session";
import { safeEqual } from "@/lib/security";
import { runInvoiceReminders } from "@/lib/services/invoices";
import { runReminders } from "@/lib/services/reminders";
import { runSubcontractorReminders } from "@/lib/services/subcontractors";
import { runWarrantyReminders } from "@/lib/services/warranties";
import { runCertificationReminders } from "@/lib/services/certifications";
import { runFleetReminders } from "@/lib/services/fleet";
import { runMonthlyReports } from "@/lib/services/monthly-report";
import { runMaintenanceNotices } from "@/lib/services/maintenance";
import { runDelayNotices } from "@/lib/services/delays";
import { runDayCloseReminders } from "@/lib/services/day-close";

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
      certifications: await runCertificationReminders(db),
      fleet: await runFleetReminders(db),
      monthlyReports: await runMonthlyReports(db),
      maintenance: await runMaintenanceNotices(db),
      delays: await runDelayNotices(db),
      dayClose: await runDayCloseReminders(db),
    });
  } catch (e) {
    return errorResponse(e);
  }
}
