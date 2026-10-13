import { api } from "@/lib/server/session";
import { sessionCalendar } from "@/lib/services/support-desk";

/** Invitation d'agenda d'une séance de prise en main, pour les inscrits. */
export const GET = api<{ id: string }>(async ({ ctx, params }) => {
  const ics = await sessionCalendar(ctx, params.id);
  return new Response(ics, {
    headers: {
      "content-type": "text/calendar; charset=utf-8",
      "content-disposition": 'attachment; filename="seance-pilot-makers.ics"',
      "cache-control": "private, no-store",
    },
  });
});
