import { getDb } from "@/lib/db";
import { OPEN_LICENSE, OPEN_MIN_ORGS, toCsv } from "@/lib/open-data";
import { openPaymentDelays } from "@/lib/services/open-data";

export const dynamic = "force-dynamic";

/** Données ouvertes : Délais de paiement des factures réglées, par mois de facture. */
export async function GET(req: Request) {
  const rows = await openPaymentDelays(await getDb());
  const headers = { "cache-control": "public, max-age=3600", "access-control-allow-origin": "*" };
  if (new URL(req.url).searchParams.get("format") === "csv") {
    return new Response(toCsv(rows), {
      headers: { ...headers, "content-type": "text/csv; charset=utf-8", "content-disposition": 'attachment; filename="delais-paiement.csv"' },
    });
  }
  return Response.json(
    {
      name: "Délais de paiement des factures réglées, par mois de facture",
      license: OPEN_LICENSE,
      method: `Entreprises volontaires des repères anonymes uniquement ; chaque valeur résume au moins ${OPEN_MIN_ORGS} entreprises.`,
      rows,
    },
    { headers },
  );
}
