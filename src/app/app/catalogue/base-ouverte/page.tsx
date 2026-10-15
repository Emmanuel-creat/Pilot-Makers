import Link from "next/link";
import { Empty, PageHeader, Section } from "@/components/ui";
import { LICENSE, WORK_TRADES } from "@/lib/open-works";
import { requirePageCtx } from "@/lib/server/session";
import { listWorks } from "@/lib/services/open-works";
import { WorkForm } from "./WorkForm";

export const metadata = { title: "Base ouverte des ouvrages" };

export default async function OpenWorksPage({ searchParams }: { searchParams: Promise<{ metier?: string; q?: string }> }) {
  const sp = await searchParams;
  const ctx = await requirePageCtx();
  const works = await listWorks(ctx.db, { trade: sp.metier, search: sp.q });
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageHeader
        title="Base ouverte des ouvrages"
        back={{ href: "/app/catalogue", label: "Catalogue" }}
        subtitle={`Fiches techniques partagées entre artisans : mode opératoire, composition, temps de pose, normes. Sans prix, sous ${LICENSE.name}, consultables par tous.`}
      />
      <form className="flex flex-wrap items-end gap-2 text-sm" role="search">
        <div>
          <label className="label" htmlFor="bo-q">
            Rechercher
          </label>
          <input id="bo-q" name="q" defaultValue={sp.q ?? ""} className="field" />
        </div>
        <div>
          <label className="label" htmlFor="bo-metier">
            Corps d&apos;état
          </label>
          <select id="bo-metier" name="metier" defaultValue={sp.metier ?? ""} className="field">
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
      {works.length === 0 ? (
        <Empty icon="box" title="Aucune fiche pour ces critères">
          Publiez la première : votre façon de faire servira à d&apos;autres artisans.
        </Empty>
      ) : (
        <ul className="card divide-y divide-line" data-testid="fiches-ouvertes">
          {works.map((w) => (
            <li key={w.id} className="flex flex-wrap items-baseline justify-between gap-2 px-4 py-3 text-sm">
              <span className="min-w-0">
                <Link href={`/app/catalogue/base-ouverte/${w.id}`} className="link font-medium">
                  {w.title}
                </Link>
                <span className="block text-xs text-muted">{[w.tradeLabel, `par ${w.unit}`, w.author].join(" · ")}</span>
              </span>
              <span className="text-xs text-muted">
                {w.votes} utile{w.votes > 1 ? "s" : ""}, {w.imports} reprise{w.imports > 1 ? "s" : ""}
              </span>
            </li>
          ))}
        </ul>
      )}
      <Section title="Publier une fiche">
        <WorkForm mode="publier" />
      </Section>
    </div>
  );
}
