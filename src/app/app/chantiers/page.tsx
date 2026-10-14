import Link from "next/link";
import { Icon } from "@/components/Icon";
import { Empty, PageHeader, fmtDate } from "@/components/ui";
import { requirePageCtx } from "@/lib/server/session";
import { JOB_STATUSES, listJobs } from "@/lib/services/jobs";
import { pct } from "@/lib/services/jobs-labels";
import { unreadJobMessages } from "@/lib/services/job-chat";

export const metadata = { title: "Chantiers" };

export default async function JobsPage({ searchParams }: { searchParams: Promise<{ statut?: string }> }) {
  const { statut } = await searchParams;
  const ctx = await requirePageCtx();
  const [jobs, unread] = await Promise.all([listJobs(ctx, { status: statut }), unreadJobMessages(ctx)]);
  const filters: [string, string][] = [["", "Tous"], ...Object.entries(JOB_STATUSES)];
  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title="Chantiers"
        subtitle="Créés depuis les devis acceptés : tâches, avancement et informations d'accès."
        actions={
          <>
            <Link href="/app/avis" className="btn-secondary">
              <Icon name="star" size={16} /> Avis clients
            </Link>
            <Link href="/app/chantiers/garanties" className="btn-secondary">
              <Icon name="shield" size={16} /> Garanties
            </Link>
            <Link href="/app/chantiers/dechets" className="btn-secondary">
              <Icon name="trash" size={16} /> Registre des déchets
            </Link>
          </>
        }
      />
      <nav className="mb-4 flex gap-1 overflow-x-auto" aria-label="Filtrer par état">
        {filters.map(([k, l]) => (
          <Link
            key={k}
            href={k ? `/app/chantiers?statut=${k}` : "/app/chantiers"}
            aria-current={(statut ?? "") === k ? "page" : undefined}
            className={`rounded-full px-3 py-1 text-sm whitespace-nowrap ${(statut ?? "") === k ? "bg-accent-soft font-medium text-accent" : "text-muted hover:bg-surface-2"}`}
          >
            {l}
          </Link>
        ))}
      </nav>
      {jobs.length ? (
        <ul className="grid gap-3 sm:grid-cols-2">
          {jobs.map((j) => (
            <li key={j.id}>
              <Link href={`/app/chantiers/${j.id}`} className="card block p-4 hover:bg-surface-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate font-medium">{j.title}</div>
                    <div className="truncate text-sm text-muted">
                      {[j.customer_name, j.site_city].filter(Boolean).join(", ")}
                      {j.quote_number ? ` (devis ${j.quote_number})` : ""}
                    </div>
                  </div>
                  <span className="rounded-full bg-surface-2 px-2.5 py-0.5 text-xs font-medium whitespace-nowrap text-muted">{JOB_STATUSES[j.status]}</span>
                </div>
                <div className="mt-3 flex items-center gap-3">
                  <progress className="h-2 flex-1 accent-accent" max={10000} value={j.progressBp} aria-label={`Avancement de ${j.title}`} />
                  <span className="tabular text-sm font-medium">{pct(j.progressBp)} %</span>
                </div>
                {unread.get(j.id) ? (
                  <div className="mt-2 flex items-center gap-1 text-xs font-medium text-accent">
                    <Icon name="mail" size={14} /> {unread.get(j.id)} message{unread.get(j.id)! > 1 ? "s" : ""} non lu{unread.get(j.id)! > 1 ? "s" : ""}
                  </div>
                ) : null}
                {j.start_date ? (
                  <div className="mt-2 text-xs text-muted">
                    Du {fmtDate(j.start_date)}
                    {j.end_date ? ` au ${fmtDate(j.end_date)}` : ""}
                  </div>
                ) : null}
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <Empty icon="hammer" title="Aucun chantier">
          Ouvrez un devis accepté et cliquez sur « Créer le chantier » : ses lignes deviennent les tâches à suivre.
        </Empty>
      )}
    </div>
  );
}
