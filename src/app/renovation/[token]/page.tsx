import { Icon } from "@/components/Icon";
import { Notice } from "@/components/ui";
import { formatEuros } from "@/lib/calc/format";
import { getDb } from "@/lib/db";
import { publicRenovation } from "@/lib/services/renovation";

export const dynamic = "force-dynamic";
export const metadata = { title: "Votre rénovation", robots: { index: false, follow: false } };

const fr = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
const QUOTE_STATUS: Record<string, string> = { accepted: "Accepté", sent: "Envoyé", viewed: "Envoyé", refused: "Refusé", expired: "Expiré" };

/** Dossier de rénovation vu par le client : toutes les entreprises, un seul interlocuteur. */
export default async function PublicRenovationPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const r = await publicRenovation(await getDb(), token);
  if (!r) {
    return (
      <main className="min-h-screen bg-bg px-4 py-8">
        <div className="card mx-auto max-w-xl p-6">
          <Notice tone="warning" title="Lien invalide ou remplacé">
            Ce lien ne permet plus de consulter le dossier. Demandez le nouveau lien à l&apos;entreprise qui pilote vos travaux.
          </Notice>
        </div>
      </main>
    );
  }
  const s = r.summary;
  return (
    <main className="min-h-screen bg-bg px-4 py-8">
      <div className="mx-auto max-w-3xl space-y-6">
        <header className="space-y-1">
          <h1 className="text-2xl font-semibold">{r.title}</h1>
          {r.site ? <p className="text-muted">{r.site}</p> : null}
        </header>

        <section className="card space-y-2 p-5" aria-labelledby="pr-pilote">
          <h2 id="pr-pilote" className="flex items-center gap-2 font-semibold">
            <Icon name="user" size={18} /> Votre interlocuteur unique
          </h2>
          <p className="font-medium">{r.pilot.name}</p>
          <p className="text-sm text-muted">
            Il coordonne les entreprises et l&apos;enchaînement des travaux. Chaque entreprise reste responsable de son lot et de son devis.
          </p>
          {r.pilot.phone ? <p className="text-sm">Téléphone : {r.pilot.phone}</p> : null}
          {r.pilot.email ? <p className="text-sm">E-mail : {r.pilot.email}</p> : null}
        </section>

        <section className="card grid gap-4 p-5 sm:grid-cols-2" aria-label="Synthèse">
          <div>
            <p className="text-sm text-muted">Total TTC des devis reçus</p>
            <p className="text-2xl font-semibold tabular-nums" data-testid="renovation-total-client">
              {formatEuros(s.totalTtcCents)}
            </p>
            {!s.complete ? <p className="text-sm text-muted">Des devis sont encore attendus.</p> : null}
          </div>
          <div>
            <p className="text-sm text-muted">Période prévue</p>
            <p className="font-medium">{s.from && s.to ? `Du ${fr(s.from)} au ${fr(s.to)}` : "Dates en cours de calage"}</p>
          </div>
        </section>

        <section className="card p-5" aria-labelledby="pr-lots">
          <h2 id="pr-lots" className="mb-3 font-semibold">
            Les entreprises, dans l&apos;ordre des travaux
          </h2>
          <ol className="divide-y divide-line">
            {r.participants.map((p, i) => (
              <li key={p.id} className="flex flex-wrap items-baseline justify-between gap-2 py-3">
                <div className="min-w-0">
                  <p className="font-medium">
                    {i + 1}. {p.tradeLabel}
                  </p>
                  <p className="text-sm text-muted">
                    {p.name}
                    {p.startDate && p.endDate ? `, du ${fr(p.startDate)} au ${fr(p.endDate)}` : ""}
                  </p>
                </div>
                <p className="text-sm tabular-nums">
                  {p.amountTtcCents != null ? formatEuros(p.amountTtcCents) : "Devis à venir"}
                  {p.quoteStatus && QUOTE_STATUS[p.quoteStatus] ? ` (${QUOTE_STATUS[p.quoteStatus]})` : ""}
                </p>
              </li>
            ))}
          </ol>
        </section>
      </div>
    </main>
  );
}
