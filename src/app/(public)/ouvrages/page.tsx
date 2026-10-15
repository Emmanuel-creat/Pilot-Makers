import Link from "next/link";
import { getDb } from "@/lib/db";
import { LICENSE, WORK_TRADES } from "@/lib/open-works";
import { listWorks } from "@/lib/services/open-works";

export const metadata = {
  title: "Base ouverte des ouvrages du bâtiment",
  description: "Fiches techniques partagées par des artisans, sous Licence Ouverte 2.0.",
};
export const dynamic = "force-dynamic";

export default async function PublicWorksPage({ searchParams }: { searchParams: Promise<{ metier?: string; q?: string }> }) {
  const sp = await searchParams;
  const works = await listWorks(await getDb(), { trade: sp.metier, search: sp.q });
  return (
    <div className="mx-auto max-w-4xl px-4 py-12">
      <h1 className="text-3xl font-semibold text-balance">Base ouverte des ouvrages du bâtiment</h1>
      <p className="mt-2 text-muted">
        Fiches techniques rédigées par des artisans : mode opératoire, composition par unité, temps de pose, normes. Sans prix. Réutilisables librement sous{" "}
        <a href={LICENSE.url} className="link" rel="noopener">
          {LICENSE.name}
        </a>
        , avec mention de la source. Export complet :{" "}
        <a href="/api/public/ouvrages" className="link">
          fichier JSON
        </a>
        .
      </p>
      <form className="mt-6 flex flex-wrap items-end gap-2 text-sm" role="search">
        <div>
          <label className="label" htmlFor="po-q">
            Rechercher
          </label>
          <input id="po-q" name="q" defaultValue={sp.q ?? ""} className="field" />
        </div>
        <div>
          <label className="label" htmlFor="po-metier">
            Corps d&apos;état
          </label>
          <select id="po-metier" name="metier" defaultValue={sp.metier ?? ""} className="field">
            <option value="">Tous</option>
            {WORK_TRADES.map((t) => (
              <option key={t.key} value={t.key}>
                {t.label}
              </option>
            ))}
          </select>
        </div>
        <button className="btn-secondary">Filtrer</button>
      </form>
      {works.length ? (
        <ul className="card mt-6 divide-y divide-line">
          {works.map((w) => (
            <li key={w.id} className="px-4 py-3 text-sm">
              <Link href={`/ouvrages/${w.id}`} className="link font-medium">
                {w.title}
              </Link>
              <span className="block text-xs text-muted">{[w.tradeLabel, `par ${w.unit}`, w.author].join(" · ")}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-6 text-sm text-muted">Aucune fiche pour ces critères.</p>
      )}
      <p className="mt-6 text-sm">
        Artisan ?{" "}
        <Link href="/inscription" className="link">
          Créez votre compte
        </Link>{" "}
        pour publier vos fiches et les reprendre dans votre catalogue.
      </p>
    </div>
  );
}
