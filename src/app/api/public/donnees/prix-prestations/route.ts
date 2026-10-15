import { getDb } from "@/lib/db";
import { OPEN_LICENSE, OPEN_MIN_ORGS, toCsv } from "@/lib/open-data";
import { openPrices } from "@/lib/services/open-data";

export const dynamic = "force-dynamic";

/** Données ouvertes : Prix HT des prestations courantes, quartiles par région. */
export async function GET(req: Request) {
  const rows = await openPrices(await getDb());
  const headers = { "cache-control": "public, max-age=3600", "access-control-allow-origin": "*" };
  if (new URL(req.url).searchParams.get("format") === "csv") {
    return new Response(toCsv(rows), {
      headers: { ...headers, "content-type": "text/csv; charset=utf-8", "content-disposition": 'attachment; filename="prix-prestations.csv"' },
    });
  }
  return Response.json(
    {
      name: "Prix HT des prestations courantes, quartiles par région",
      license: OPEN_LICENSE,
      method: `Entreprises volontaires des repères anonymes uniquement ; chaque valeur résume au moins ${OPEN_MIN_ORGS} entreprises.`,
      rows,
    },
    { headers },
  );
}
