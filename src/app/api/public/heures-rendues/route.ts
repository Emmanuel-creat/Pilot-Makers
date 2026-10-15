import { getDb } from "@/lib/db";
import { publicTimeSaved } from "@/lib/services/time-saved";
import { PUBLIC_MIN_ORGS, TIME_SOURCES } from "@/lib/time-saved";

export const dynamic = "force-dynamic";

/** Heures rendues aux artisans depuis le début de l'année, en données ouvertes (JSON). */
export async function GET() {
  const r = await publicTimeSaved(await getDb());
  return Response.json(
    {
      name: "Heures rendues aux artisans",
      license: { name: "Licence Ouverte 2.0", url: "https://www.etalab.gouv.fr/licence-ouverte-open-licence/" },
      method: `Chaque tâche faite par l'application est comptée avec une durée prudente de ce qu'elle aurait pris à la main ; total de toutes les entreprises, publié à partir de ${PUBLIC_MIN_ORGS} entreprises.`,
      durations: TIME_SOURCES.map(({ key, label, minutes, how }) => ({ key, label, minutes, how })),
      ...r,
    },
    { headers: { "cache-control": "public, max-age=3600", "access-control-allow-origin": "*" } },
  );
}
