import Link from "next/link";
import { PageHeader, Section } from "@/components/ui";
import { requirePageCtx } from "@/lib/server/session";
import { myTimeSaved } from "@/lib/services/time-saved";
import { formatDuration } from "@/lib/time-saved";

export const metadata = { title: "Temps gagné" };

/** Le temps que l'application a rendu à l'entreprise, ce mois-ci et depuis janvier. */
export default async function TimeSavedPage() {
  const ctx = await requirePageCtx();
  const t = await myTimeSaved(ctx);
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader
        title="Temps gagné"
        subtitle="Ce que l'application a fait à votre place, avec une durée prudente de ce que chaque tâche aurait pris à la main."
        back={{ href: "/app/rapports", label: "Rapports" }}
      />
      <dl className="grid gap-4 sm:grid-cols-2" data-testid="temps-gagne">
        <div className="card p-5">
          <dt className="text-sm text-muted">Ce mois-ci</dt>
          <dd className="text-3xl font-semibold">{formatDuration(t.month.totalMinutes)}</dd>
        </div>
        <div className="card p-5">
          <dt className="text-sm text-muted">Depuis le 1er janvier</dt>
          <dd className="text-3xl font-semibold">{formatDuration(t.year.totalMinutes)}</dd>
        </div>
      </dl>
      <Section title="Détail depuis janvier">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="table-head">
                <th className="px-2 py-2">Tâche</th>
                <th className="px-2 py-2 text-right">Nombre</th>
                <th className="px-2 py-2 text-right">Durée à la main</th>
                <th className="px-2 py-2 text-right">Temps gagné</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {t.year.lines.map((l) => (
                <tr key={l.key}>
                  <td className="px-2 py-2">{l.label}</td>
                  <td className="tabular px-2 py-2 text-right">{l.count}</td>
                  <td className="tabular px-2 py-2 text-right">{l.minutes} min</td>
                  <td className="tabular px-2 py-2 text-right">{formatDuration(l.savedMinutes)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>
      <p className="text-sm text-muted">
        Le total de toutes les entreprises est publié sur la page{" "}
        <Link href="/heures-rendues" className="link">
          Heures rendues aux artisans
        </Link>
        , sans aucun chiffre de votre entreprise.
      </p>
    </div>
  );
}
