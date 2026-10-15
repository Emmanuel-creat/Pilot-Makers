import { DATASETS, OPEN_LICENSE, OPEN_MIN_ORGS } from "@/lib/open-data";

export const metadata = {
  title: "Données ouvertes de l'artisanat du bâtiment",
  description: "Données anonymes agrégées ouvertes à la recherche et aux pouvoirs publics : activité, prix, délais de paiement, ouvrages.",
};

/** Portail des données ouvertes : jeux de données anonymes agrégés, libres de réutilisation. */
export default function OpenDataPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-8 px-4 py-12">
      <header className="space-y-2">
        <h1 className="text-3xl font-semibold text-balance">Données ouvertes de l&apos;artisanat du bâtiment</h1>
        <p className="text-muted">
          Des données anonymes et agrégées, pour la recherche, les collectivités, les fédérations et les pouvoirs publics. Réutilisation libre sous{" "}
          <a href={OPEN_LICENSE.url} className="link" rel="noopener">
            {OPEN_LICENSE.name}
          </a>
          , avec mention de la source.
        </p>
      </header>

      <ul className="space-y-4">
        {DATASETS.map((d) => (
          <li key={d.id} className="card space-y-2 p-5">
            <h2 className="text-lg font-semibold">{d.title}</h2>
            <p className="text-muted">{d.text}</p>
            <p className="flex flex-wrap gap-4 text-sm">
              <a href={d.json} className="link">
                JSON
              </a>
              {"csv" in d ? (
                <a href={d.csv} className="link">
                  CSV
                </a>
              ) : null}
              {"page" in d ? (
                <a href={d.page} className="link">
                  Consulter en ligne
                </a>
              ) : null}
            </p>
          </li>
        ))}
      </ul>

      <section className="space-y-2" aria-labelledby="do-garanties">
        <h2 id="do-garanties" className="text-xl font-semibold">
          Garanties d&apos;anonymat
        </h2>
        <ul className="list-disc space-y-1 pl-5">
          <li>Seules les entreprises qui ont choisi de contribuer aux repères anonymes sont comptées ; elles peuvent se retirer à tout moment.</li>
          <li>Chaque valeur publiée résume au moins {OPEN_MIN_ORGS} entreprises ; en dessous, rien n&apos;est publié.</li>
          <li>Aucun nom, aucune adresse, aucun client, aucun montant individuel : seulement des quartiles, des médianes, des taux et des indices.</li>
          <li>Les données sont recalculées à chaque consultation, à partir des chiffres du moment.</li>
        </ul>
      </section>
    </div>
  );
}
