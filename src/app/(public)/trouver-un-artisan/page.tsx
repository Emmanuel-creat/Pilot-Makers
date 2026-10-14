import { getDb } from "@/lib/db";
import { MATCH_TRADES, MAX_ARTISANS, TIMEFRAMES } from "@/lib/matching";
import { matchingStats } from "@/lib/services/matching";
import { MatchForm } from "./MatchForm";

export const metadata = {
  title: "Trouver un artisan",
  description: "Décrivez vos travaux : trois artisans identifiés et assurés de votre département vous recontactent, sans frais.",
};
export const dynamic = "force-dynamic";

export default async function FindArtisanPage() {
  const stats = await matchingStats(await getDb());
  return (
    <div className="mx-auto max-w-3xl px-4 py-12">
      <h1 className="text-3xl font-semibold text-balance">Trouver un artisan près de chez vous</h1>
      <p className="mt-2 text-muted">
        Décrivez vos travaux : votre demande est transmise à {MAX_ARTISANS} artisans au plus de votre département, identifiés par leur SIREN et assurés. Gratuit
        et sans engagement. Les artisans ne paient pas vos coordonnées : les demandes sont réparties équitablement.
      </p>
      {stats.artisans ? (
        <p className="mt-2 text-sm text-muted">
          {stats.artisans} entreprise{stats.artisans > 1 ? "s" : ""} inscrite{stats.artisans > 1 ? "s" : ""}, {stats.requests} demande
          {stats.requests > 1 ? "s" : ""} transmise{stats.requests > 1 ? "s" : ""}.
        </p>
      ) : null}
      <div className="card mt-6 p-5">
        <MatchForm trades={MATCH_TRADES.map((t) => ({ key: t.key, label: t.label }))} timeframes={TIMEFRAMES} />
      </div>
      <p className="mt-4 text-xs text-muted">
        Vos coordonnées ne sont transmises qu&apos;aux artisans retenus et ne servent qu&apos;à vous recontacter au sujet de cette demande. Sans artisan
        disponible, rien n&apos;est conservé.
      </p>
    </div>
  );
}
