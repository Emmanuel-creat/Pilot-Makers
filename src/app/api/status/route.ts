import { getDb } from "@/lib/db";
import { serviceStatus } from "@/lib/services/status";

export const dynamic = "force-dynamic";

/** État public du service, au format JSON (page /statut). */
export async function GET() {
  const s = await serviceStatus(getDb);
  return Response.json(
    {
      status: s.overall,
      label: s.label,
      checkedAt: s.checkedAt,
      components: s.components.map((c) => ({ name: c.name, status: c.level })),
      incidents: s.active.map((i) => ({ title: i.title, severity: i.severity, startedAt: i.started_at })),
    },
    { status: s.overall === "panne" ? 503 : 200, headers: { "cache-control": "no-store" } },
  );
}
