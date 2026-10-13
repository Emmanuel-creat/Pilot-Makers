import { getDb } from "@/lib/db";
import { hitRate } from "@/lib/rate-limit";
import { errorResponse, requestMeta } from "@/lib/server/session";
import { feedCalendar } from "@/lib/services/calendar";
import { appUrl } from "@/lib/services/mail";

/** Agenda au format iCalendar, lu sans session par Google Agenda, Outlook ou Apple Calendrier. */
export async function GET(_: Request, context: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await context.params;
    const db = await getDb();
    const meta = await requestMeta();
    await hitRate(db, "api.ip", meta.ip);
    const ics = await feedCalendar(db, token, meta, appUrl());
    return new Response(ics, {
      headers: {
        "content-type": "text/calendar; charset=utf-8",
        "content-disposition": 'inline; filename="pilot-makers.ics"',
        "cache-control": "private, max-age=300",
        "x-robots-tag": "noindex",
      },
    });
  } catch (e) {
    return errorResponse(e);
  }
}
