import Link from "next/link";
import { Icon } from "@/components/Icon";
import { PageHeader } from "@/components/ui";
import { formatEuros } from "@/lib/calc/format";
import { requirePageCtx } from "@/lib/server/session";
import { todaySummary } from "@/lib/services/today";

export const metadata = { title: "Aujourd'hui" };

const longDate = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
const shortDate = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString("fr-FR", { day: "numeric", month: "short", timeZone: "UTC" });

/** Vue compacte du jour, ouverte par le raccourci de l'application installée. */
export default async function TodayPage() {
  const ctx = await requirePageCtx();
  const s = await todaySummary(ctx);
  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="Aujourd'hui" subtitle={longDate(s.date)} />
      <div className="space-y-6">
        <section className="card p-4" aria-labelledby="jour-chantiers">
          <h2 id="jour-chantiers" className="mb-3 flex items-center gap-2 font-semibold">
            <Icon name="truck" size={18} />{" "}
            {s.jobs.length ? `${s.jobs.length} chantier${s.jobs.length > 1 ? "s" : ""} aujourd'hui` : "Aucun chantier planifié aujourd'hui"}
          </h2>
          {s.jobs.length ? (
            <ul className="divide-y divide-line" data-testid="jour-chantiers">
              {s.jobs.map((j) => (
                <li key={j.id} className="py-3">
                  <Link href={`/app/chantiers/${j.id}`} className="link text-base font-medium">
                    {j.title}
                  </Link>
                  <div className="text-sm text-muted">{[j.customer, [j.address, j.city].filter(Boolean).join(", ")].filter(Boolean).join(" · ")}</div>
                  {j.team.length || j.vehicles.length ? (
                    <div className="mt-1 text-sm">
                      {j.team.join(", ")}
                      {j.vehicles.length ? `${j.team.length ? ", " : ""}${j.vehicles.join(", ")}` : ""}
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : (
            <Link href="/app/planning" className="link text-sm">
              Ouvrir le planning
            </Link>
          )}
        </section>

        <section className="card p-4" aria-labelledby="jour-devis">
          <h2 id="jour-devis" className="mb-3 flex items-center gap-2 font-semibold">
            <Icon name="quote" size={18} />
            {s.quotes.count ? `${s.quotes.count} devis en attente de réponse` : "Aucun devis en attente"}
            {s.quotes.totalTtcCents ? <span className="font-normal text-muted">, {formatEuros(s.quotes.totalTtcCents)} TTC</span> : null}
          </h2>
          {s.quotes.items.length ? (
            <ul className="divide-y divide-line" data-testid="jour-devis">
              {s.quotes.items.map((q) => (
                <li key={q.id} className="flex flex-wrap items-baseline justify-between gap-2 py-2 text-sm">
                  <span className="min-w-0">
                    <Link href={`/app/devis/${q.id}`} className="link font-medium">
                      {q.title || q.number}
                    </Link>
                    <span className="block text-xs text-muted">
                      {[q.number, q.customer, q.viewed ? "consulté" : "pas encore ouvert"].filter(Boolean).join(" · ")}
                    </span>
                  </span>
                  <span className={`tabular text-right ${q.expiresSoon ? "text-warning" : ""}`}>
                    {q.totalTtcCents !== null ? formatEuros(q.totalTtcCents) : ""}
                    {q.validUntil ? (
                      <span className="block text-xs">
                        {q.expiresSoon ? "expire le " : "valable jusqu'au "}
                        {shortDate(q.validUntil)}
                      </span>
                    ) : null}
                  </span>
                </li>
              ))}
            </ul>
          ) : null}
          {s.quotes.count > s.quotes.items.length ? (
            <Link href="/app/devis?status=pending" className="link mt-2 inline-flex min-h-6 items-center text-sm">
              Voir les {s.quotes.count} devis en attente
            </Link>
          ) : null}
        </section>
        <p className="text-sm">
          <Link href="/app/ma-journee" className="link inline-flex min-h-6 items-center">
            Ma journée pour les équipes de chantier, en huit langues
          </Link>
        </p>
        <p className="text-xs text-muted">
          Installez l&apos;application sur votre téléphone : un appui long sur son icône ouvre directement cette page. Pour un widget d&apos;écran
          d&apos;accueil, voir{" "}
          <Link href="/aide/widgets-ecran-accueil" className="link">
            l&apos;aide
          </Link>
          .
        </p>
      </div>
    </div>
  );
}
