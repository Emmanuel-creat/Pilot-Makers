import { getDb } from "@/lib/db";
import { safeEqual } from "@/lib/security";

export const dynamic = "force-dynamic";

const startedAt = Date.now();

/**
 * État du service, pour une sonde de disponibilité (toutes les minutes par exemple).
 * Public : état, version et temps de réponse de la base.
 * Avec l'en-tête Authorization: Bearer HEALTH_TOKEN : aussi les erreurs de la dernière heure,
 * les e-mails en échec et le mode d'envoi des e-mails.
 */
export async function GET(req: Request) {
  const version = process.env.APP_VERSION ?? process.env.npm_package_version ?? "dev";
  const t0 = performance.now();
  try {
    const db = await getDb();
    await db.query("SELECT 1");
    const dbMs = Math.round(performance.now() - t0);
    const body: Record<string, unknown> = {
      status: "ok",
      version,
      time: new Date().toISOString(),
      uptimeSeconds: Math.round((Date.now() - startedAt) / 1000),
      database: { ok: true, latencyMs: dbMs },
    };
    const token = process.env.HEALTH_TOKEN ?? "";
    const given = (req.headers.get("authorization") ?? "").replace(/^Bearer /, "");
    if (token && safeEqual(given, token)) {
      const [errors] = await db.query<{ n: unknown }>("SELECT count(*) AS n FROM error_events WHERE created_at > now() - interval '1 hour'");
      const [mails] = await db.query<{ n: unknown }>(
        "SELECT count(*) AS n FROM emails WHERE status='failed' AND created_at > now() - interval '1 day'",
      );
      body.errorsLastHour = Number(errors.n);
      body.failedEmailsLastDay = Number(mails.n);
      body.mail = process.env.MAIL_PROVIDER && process.env.MAIL_API_KEY ? process.env.MAIL_PROVIDER : "boite d'envoi simulée";
    }
    return Response.json(body, { headers: { "cache-control": "no-store" } });
  } catch {
    return Response.json({ status: "error", version, database: { ok: false } }, { status: 503, headers: { "cache-control": "no-store" } });
  }
}
