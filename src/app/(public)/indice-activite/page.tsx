import Link from "next/link";
import { MIN_CONTRIBUTORS, monthLabel } from "@/lib/activity-index";
import { getDb } from "@/lib/db";
import { publicActivityIndex } from "@/lib/services/activity-index";

export const metadata = {
  title: "Indice de l'activité artisanale du bâtiment",
  description: "Chiffre d'affaires facturé, commandes signées et taux d'acceptation des devis des artisans, chaque mois, en données ouvertes.",
};
export const dynamic = "force-dynamic";

const fmt = (v: number | null, unit = "") => (v == null ? "non publié" : `${v.toLocaleString("fr-FR", { maximumFractionDigits: 1 })}${unit}`);

/** Indice national de l'activité artisanale, publié à partir des données agrégées des entreprises volontaires. */
export default async function ActivityIndexPage() {
  const r = await publicActivityIndex(await getDb());
  const max = Math.max(100, ...r.points.map((p) => p.invoiced ?? 0));
  return (
    <div className="mx-auto max-w-4xl space-y-8 px-4 py-12">
      <header className="space-y-2">
        <h1 className="text-3xl font-semibold text-balance">Indice de l&apos;activité artisanale du bâtiment</h1>
        <p className="text-muted">
          Chaque mois, l&apos;activité des artisans qui ont choisi de contribuer aux repères anonymes : chiffre d&apos;affaires facturé, commandes signées et
          part des devis acceptés. Aucune donnée d&apos;entreprise n&apos;est publiée, seulement des médianes et des taux calculés sur au moins{" "}
          {MIN_CONTRIBUTORS} entreprises.
        </p>
      </header>

      {r.latest ? (
        <section className="grid gap-4 sm:grid-cols-3" aria-label="Dernier mois publié">
          <div className="card p-5">
            <p className="text-sm text-muted">Chiffre d&apos;affaires, {monthLabel(r.latest.month)}</p>
            <p className="text-3xl font-semibold tabular-nums" data-testid="indice-dernier">
              {fmt(r.latest.invoiced)}
            </p>
            <p className="text-sm text-muted">
              {r.change == null ? `base 100 en ${monthLabel(r.base!)}` : `${r.change > 0 ? "+" : ""}${fmt(r.change, " %")} sur un mois`}
            </p>
          </div>
          <div className="card p-5">
            <p className="text-sm text-muted">Commandes signées</p>
            <p className="text-3xl font-semibold tabular-nums">{fmt(r.latest.orders)}</p>
            <p className="text-sm text-muted">base 100 en {monthLabel(r.base!)}</p>
          </div>
          <div className="card p-5">
            <p className="text-sm text-muted">Devis acceptés</p>
            <p className="text-3xl font-semibold tabular-nums">{fmt(r.latest.acceptRate, " %")}</p>
            <p className="text-sm text-muted">{r.latest.contributors} entreprises contributrices</p>
          </div>
        </section>
      ) : (
        <section className="card p-6" data-testid="indice-attente">
          <h2 className="font-semibold">Premières publications en préparation</h2>
          <p className="mt-1 text-muted">
            L&apos;indice sera publié dès qu&apos;au moins {MIN_CONTRIBUTORS} entreprises contribueront sur un même mois. Les artisans qui utilisent
            Pilot-Makers peuvent contribuer depuis Rapports, Repères anonymes.
          </p>
        </section>
      )}

      <section className="space-y-3" aria-labelledby="ia-serie">
        <h2 id="ia-serie" className="text-xl font-semibold">
          Les {r.points.length} derniers mois
        </h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left">
                <th className="py-2 pr-4 font-medium">Mois</th>
                <th className="py-2 pr-4 font-medium">Chiffre d&apos;affaires (indice)</th>
                <th className="py-2 pr-4 font-medium">Commandes (indice)</th>
                <th className="py-2 pr-4 font-medium">Devis acceptés</th>
                <th className="py-2 font-medium">Entreprises</th>
              </tr>
            </thead>
            <tbody>
              {r.points.map((p) => (
                <tr key={p.month} className="border-b border-line">
                  <td className="py-2 pr-4">{monthLabel(p.month)}</td>
                  <td className="py-2 pr-4 tabular-nums">
                    <span className="flex items-center gap-2">
                      {p.invoiced != null ? (
                        <span aria-hidden className="inline-block h-2 rounded bg-accent" style={{ width: `${Math.round((60 * p.invoiced) / max)}px` }} />
                      ) : null}
                      {fmt(p.invoiced)}
                    </span>
                  </td>
                  <td className="py-2 pr-4 tabular-nums">{fmt(p.orders)}</td>
                  <td className="py-2 pr-4 tabular-nums">{fmt(p.acceptRate, " %")}</td>
                  <td className="py-2 tabular-nums">{p.contributors || "moins de " + MIN_CONTRIBUTORS}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="space-y-2" aria-labelledby="ia-methode">
        <h2 id="ia-methode" className="text-xl font-semibold">
          Méthode
        </h2>
        <ul className="list-disc space-y-1 pl-5">
          <li>Chiffre d&apos;affaires : montant HT facturé dans le mois par chaque entreprise, avoirs déduits ; on publie l&apos;indice de la médiane.</li>
          <li>Commandes : montant HT des devis émis dans le mois et acceptés depuis ; indice de la médiane.</li>
          <li>Devis acceptés : nombre de devis acceptés rapporté au nombre de devis émis dans le mois, toutes entreprises confondues.</li>
          <li>
            Seules les entreprises qui ont choisi de contribuer aux repères anonymes sont comptées. Le mois en cours n&apos;est publié qu&apos;une fois terminé.
          </li>
          <li>
            Données ouvertes sous Licence Ouverte 2.0 :{" "}
            <a href="/api/public/indice-activite" className="link">
              fichier JSON
            </a>
            . Les chercheurs et administrations peuvent les réutiliser librement, avec mention de la source.
          </li>
        </ul>
        <p className="text-sm text-muted">
          Autres données ouvertes :{" "}
          <Link href="/ouvrages" className="link">
            base des ouvrages
          </Link>
          ,{" "}
          <Link href="/format-devis-ouvert" className="link">
            format Devis ouvert
          </Link>
          .
        </p>
      </section>
    </div>
  );
}
