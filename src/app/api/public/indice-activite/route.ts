import { getDb } from "@/lib/db";
import { MIN_CONTRIBUTORS } from "@/lib/activity-index";
import { publicActivityIndex } from "@/lib/services/activity-index";

export const dynamic = "force-dynamic";

/** Indice national de l'activité artisanale en données ouvertes (JSON). */
export async function GET() {
  const r = await publicActivityIndex(await getDb());
  return Response.json(
    {
      name: "Indice de l'activité artisanale du bâtiment",
      license: { name: "Licence Ouverte 2.0", url: "https://www.etalab.gouv.fr/licence-ouverte-open-licence/" },
      method: `Médianes mensuelles des entreprises contributrices volontaires, base 100 au premier mois publié ; un mois n'est publié qu'à partir de ${MIN_CONTRIBUTORS} entreprises.`,
      base: r.base,
      points: r.points,
    },
    { headers: { "cache-control": "public, max-age=3600", "access-control-allow-origin": "*" } },
  );
}
