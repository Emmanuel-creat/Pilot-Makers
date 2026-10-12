import Link from "next/link";
import { notFound } from "next/navigation";
import { Icon } from "@/components/Icon";
import { HELP_ARTICLES, HELP_CATEGORIES, helpArticle } from "@/lib/help";

export function generateStaticParams() {
  return HELP_ARTICLES.map((a) => ({ slug: a.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const a = helpArticle((await params).slug);
  return a ? { title: a.title, description: a.summary } : { title: "Aide" };
}

export default async function HelpArticlePage({ params }: { params: Promise<{ slug: string }> }) {
  const a = helpArticle((await params).slug);
  if (!a) notFound();
  const related = HELP_ARTICLES.filter((x) => x.category === a.category && x.slug !== a.slug);
  return (
    <article className="mx-auto max-w-3xl px-4 py-12">
      <Link href="/aide" className="link inline-flex items-center gap-1 text-sm">
        <Icon name="left" size={14} /> Centre d'aide
      </Link>
      <p className="mt-4 text-sm text-muted">{HELP_CATEGORIES[a.category].label}</p>
      <h1 className="mt-1 text-2xl font-semibold tracking-tight">{a.title}</h1>
      <p className="mt-2 text-muted">{a.summary}</p>
      <ol className="mt-6 space-y-3">
        {a.steps.map((s, i) => (
          <li key={s} className="flex gap-3">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent-soft text-sm font-semibold text-accent">
              {i + 1}
            </span>
            <span className="pt-0.5">{s}</span>
          </li>
        ))}
      </ol>
      {a.notes?.length ? (
        <ul className="mt-6 space-y-2 rounded-md bg-surface-2 p-4 text-sm">
          {a.notes.map((n) => (
            <li key={n} className="flex gap-2">
              <Icon name="info" size={16} className="mt-0.5 shrink-0 text-accent" /> {n}
            </li>
          ))}
        </ul>
      ) : null}
      {a.link ? (
        <Link href={a.link.href} className="btn-primary mt-6 inline-flex">
          {a.link.label}
        </Link>
      ) : null}
      {related.length ? (
        <section className="mt-10 border-t border-line pt-6">
          <h2 className="font-semibold">Dans la même rubrique</h2>
          <ul className="mt-2 space-y-1 text-sm">
            {related.map((r) => (
              <li key={r.slug}>
                <Link href={`/aide/${r.slug}`} className="link">
                  {r.title}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </article>
  );
}
