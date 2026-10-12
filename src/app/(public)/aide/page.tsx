import Link from "next/link";
import { Icon, type IconName } from "@/components/Icon";
import { HELP_ARTICLES, HELP_CATEGORIES, searchHelp, type HelpCategory } from "@/lib/help";

export const metadata = { title: "Centre d'aide", description: "Guides pas à pas pour préparer, envoyer et facturer vos devis avec Pilot-Makers." };

export default async function HelpPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const q = ((await searchParams).q ?? "").slice(0, 100);
  const found = q ? searchHelp(q) : HELP_ARTICLES;
  return (
    <div className="mx-auto max-w-4xl px-4 py-12">
      <h1 className="text-3xl font-semibold tracking-tight">Centre d'aide</h1>
      <p className="mt-2 text-muted">Des guides courts, étape par étape, avec les mots de l'application.</p>
      <form className="mt-6 flex gap-2" role="search">
        <input name="q" defaultValue={q} className="field" placeholder="Ex. : acompte, TVA, relance" aria-label="Rechercher dans l'aide" />
        <button className="btn-primary">
          <Icon name="search" size={16} /> Rechercher
        </button>
      </form>
      {q ? (
        <p className="mt-4 text-sm text-muted">
          {found.length} guide{found.length > 1 ? "s" : ""} pour « {q} ».{" "}
          <Link href="/aide" className="link">
            Tout afficher
          </Link>
        </p>
      ) : null}
      <div className="mt-8 space-y-8">
        {(Object.entries(HELP_CATEGORIES) as [HelpCategory, (typeof HELP_CATEGORIES)[HelpCategory]][]).map(([code, cat]) => {
          const list = found.filter((a) => a.category === code);
          if (!list.length) return null;
          return (
            <section key={code}>
              <h2 className="flex items-center gap-2 text-lg font-semibold">
                <Icon name={cat.icon as IconName} size={18} className="text-accent" /> {cat.label}
              </h2>
              <ul className="mt-3 grid gap-3 sm:grid-cols-2">
                {list.map((a) => (
                  <li key={a.slug}>
                    <Link href={`/aide/${a.slug}`} className="card block h-full p-4 hover:border-accent">
                      <span className="font-medium">{a.title}</span>
                      <span className="mt-1 block text-sm text-muted">{a.summary}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
        {!found.length ? (
          <p className="text-sm text-muted">Aucun guide ne correspond. Essayez un autre mot, ou écrivez-nous depuis la page Assistance.</p>
        ) : null}
      </div>
    </div>
  );
}
