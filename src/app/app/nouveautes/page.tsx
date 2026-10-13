import Link from "next/link";
import { Icon } from "@/components/Icon";
import { PageHeader } from "@/components/ui";
import { requirePageCtx } from "@/lib/server/session";
import { listNews, markNewsSeen } from "@/lib/services/news";

export const metadata = { title: "Nouveautés" };

const day = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });

export default async function NewsPage() {
  const ctx = await requirePageCtx();
  const news = await listNews(ctx);
  // Ouvrir la page vaut lecture : le compteur du menu repart à zéro.
  if (news.some((n) => n.unread) && !ctx.supportAccess) await markNewsSeen(ctx);
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Nouveautés"
        subtitle="Ce qui change dans Pilot-Makers, du plus récent au plus ancien."
        actions={
          <Link href="/app/feuille-de-route" className="btn-secondary">
            <Icon name="up" size={16} /> Voter pour la suite
          </Link>
        }
      />
      {news.length ? (
        <ol className="space-y-3">
          {news.map((n) => (
            <li key={n.id} className="card p-4">
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
                <time dateTime={n.date}>{day(n.date)}</time>
                {n.unread ? <span className="rounded-full bg-accent-soft px-2 py-0.5 font-medium text-accent">Nouveau</span> : null}
              </div>
              <h2 className="mt-1 font-semibold">{n.title}</h2>
              <p className="mt-1 text-sm whitespace-pre-line text-muted">{n.text}</p>
              {n.href ? (
                <Link href={n.href} className="link mt-2 inline-flex items-center gap-1 text-sm">
                  Découvrir <Icon name="right" size={14} />
                </Link>
              ) : null}
            </li>
          ))}
        </ol>
      ) : (
        <p className="text-sm text-muted">Aucune nouveauté pour l'instant.</p>
      )}
    </div>
  );
}
