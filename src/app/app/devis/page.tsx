import Link from "next/link";
import { Icon } from "@/components/Icon";
import { Empty, PageHeader, StatusBadge, fmtDate } from "@/components/ui";
import { formatEuros } from "@/lib/calc/format";
import { requirePageCtx } from "@/lib/server/session";
import { listQuotes } from "@/lib/services/quotes";
import { duplicateQuoteAction, archiveQuoteAction } from "@/app/actions";

export const metadata = { title: "Devis" };

const TABS = [
  { key: "", label: "Tous" },
  { key: "drafts", label: "Brouillons" },
  { key: "ready", label: "À envoyer" },
  { key: "pending", label: "En attente" },
  { key: "accepted", label: "Acceptés" },
  { key: "refused", label: "Refusés" },
  { key: "expired", label: "Expirés" },
];

type SP = Record<string, string | undefined>;

export default async function QuotesPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const ctx = await requirePageCtx();
  const page = Math.max(Number(sp.page ?? 1), 1);
  const res = await listQuotes(ctx, {
    status: sp.status || undefined,
    q: sp.q,
    from: sp.from || undefined,
    to: sp.to || undefined,
    minTtc: sp.min ? Number(sp.min.replace(",", ".")) : undefined,
    maxTtc: sp.max ? Number(sp.max.replace(",", ".")) : undefined,
    customerId: sp.client || undefined,
    agencyId: sp.agence || undefined,
    archived: sp.archives === "1",
    sort: (sp.sort as never) ?? "updated",
    dir: (sp.dir as never) ?? "desc",
    page,
    pageSize: 25,
  });
  const qs = (patch: SP) => {
    const u = new URLSearchParams(Object.entries({ ...sp, ...patch }).filter(([, v]) => v) as [string, string][]);
    return `/app/devis?${u.toString()}`;
  };
  const sortLink = (key: string, label: string) => {
    const active = (sp.sort ?? "updated") === key;
    const dir = active && (sp.dir ?? "desc") === "desc" ? "asc" : "desc";
    return (
      <Link href={qs({ sort: key, dir, page: "1" })} className={`inline-flex items-center gap-1 ${active ? "text-ink" : ""}`}>
        {label}
        {active ? <Icon name={(sp.dir ?? "desc") === "desc" ? "down" : "up"} size={14} /> : null}
      </Link>
    );
  };
  const pages = Math.max(1, Math.ceil(res.total / res.pageSize));
  return (
    <>
      <PageHeader
        title="Devis"
        subtitle={`${res.total} devis${sp.archives === "1" ? " archivés" : ""}`}
        actions={
          <>
            <Link href="/app/devis/marches" className="btn-secondary">
              <Icon name="building" /> Marchés publics
            </Link>
            <Link href="/app/devis/diagnostic-energetique" className="btn-secondary">
              <Icon name="sun" /> Diagnostic énergétique
            </Link>
            <Link href="/app/devis/importer" className="btn-secondary">
              <Icon name="download" /> Importer
            </Link>
            <Link href="/app/devis/nouveau" className="btn-primary">
              <Icon name="plus" /> Créer un devis
            </Link>
          </>
        }
      />
      {sp.agence ? (
        <p className="mb-3 flex flex-wrap items-center gap-2 text-sm" data-testid="filtre-agence">
          <Icon name="building" size={16} /> Devis {sp.agence === "aucune" ? "sans agence" : "de l'agence choisie"}.
          <Link href={qs({ agence: "", page: "1" })} className="link">
            Voir tous les devis
          </Link>
        </p>
      ) : null}
      <div className="mb-4 flex gap-1 overflow-x-auto pb-1" role="tablist">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={qs({ status: t.key, page: "1" })}
            role="tab"
            aria-selected={(sp.status ?? "") === t.key}
            className={`rounded-full px-3 py-1.5 text-sm whitespace-nowrap ${(sp.status ?? "") === t.key ? "bg-accent text-white dark:text-[#0d1520]" : "bg-surface text-muted hover:text-ink"}`}
          >
            {t.label}
          </Link>
        ))}
      </div>
      <form className="card mb-4 grid gap-3 p-3 sm:grid-cols-2 lg:grid-cols-6" action="/app/devis">
        <input type="hidden" name="status" value={sp.status ?? ""} />
        {sp.agence ? <input type="hidden" name="agence" value={sp.agence} /> : null}
        <input name="q" defaultValue={sp.q} placeholder="Numéro, objet ou client" className="field lg:col-span-2" aria-label="Recherche" />
        <input name="from" type="date" defaultValue={sp.from} className="field" aria-label="Créé à partir du" />
        <input name="to" type="date" defaultValue={sp.to} className="field" aria-label="Créé jusqu'au" />
        <div className="flex gap-2">
          <input name="min" inputMode="decimal" defaultValue={sp.min} placeholder="TTC min" className="field" aria-label="Montant TTC minimum" />
          <input name="max" inputMode="decimal" defaultValue={sp.max} placeholder="TTC max" className="field" aria-label="Montant TTC maximum" />
        </div>
        <div className="flex gap-2">
          <button className="btn-secondary flex-1">
            <Icon name="search" size={16} /> Filtrer
          </button>
          <Link href={sp.archives === "1" ? "/app/devis" : "/app/devis?archives=1"} className="btn-ghost" title="Archives">
            <Icon name="archive" size={16} />
          </Link>
        </div>
      </form>
      {res.items.length === 0 ? (
        <Empty icon="quote" title="Aucun devis ne correspond">
          Modifiez les filtres ou créez un nouveau devis.
        </Empty>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="table-head">
              <tr>
                <th className="px-4 py-2">{sortLink("number", "Numéro")}</th>
                <th className="px-4 py-2">{sortLink("customer", "Client")}</th>
                <th className="hidden px-4 py-2 md:table-cell">Objet</th>
                <th className="hidden px-4 py-2 lg:table-cell">{sortLink("created", "Date")}</th>
                <th className="px-4 py-2 text-right">{sortLink("amount", "TTC")}</th>
                <th className="px-4 py-2">Statut</th>
                <th className="hidden px-4 py-2 xl:table-cell">{sortLink("updated", "Modifié")}</th>
                <th className="px-2 py-2">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {res.items.map((q) => (
                <tr key={q.id} className="border-b border-line last:border-0 hover:bg-surface-2/60">
                  <td className="px-4 py-2.5 font-medium whitespace-nowrap">
                    <Link href={`/app/devis/${q.id}`} className="hover:text-accent">
                      {q.number ?? "Brouillon"}
                    </Link>
                  </td>
                  <td className="max-w-40 truncate px-4 py-2.5">{q.customerName || <span className="text-muted">Sans client</span>}</td>
                  <td className="hidden max-w-64 truncate px-4 py-2.5 md:table-cell">
                    <Link href={`/app/devis/${q.id}`} className="hover:text-accent">
                      {q.title || <span className="text-muted">Sans objet</span>}
                    </Link>
                  </td>
                  <td className="hidden px-4 py-2.5 whitespace-nowrap text-muted lg:table-cell">{fmtDate(q.issuedAt ?? q.createdAt)}</td>
                  <td className="tabular px-4 py-2.5 text-right whitespace-nowrap">{formatEuros(q.totalTtcCents)}</td>
                  <td className="px-4 py-2.5">
                    <StatusBadge status={q.status} />
                  </td>
                  <td className="hidden px-4 py-2.5 whitespace-nowrap text-muted xl:table-cell">{fmtDate(q.updatedAt, true)}</td>
                  <td className="px-2 py-2.5">
                    <div className="flex justify-end gap-1">
                      {q.currentVersion > 0 ? (
                        <a href={`/api/quotes/${q.id}/pdf?download=1`} className="btn-ghost min-h-8 px-2" title="Télécharger le PDF">
                          <Icon name="download" size={16} />
                        </a>
                      ) : null}
                      <form action={duplicateQuoteAction}>
                        <input type="hidden" name="id" value={q.id} />
                        <button className="btn-ghost min-h-8 px-2" title="Dupliquer">
                          <Icon name="copy" size={16} />
                        </button>
                      </form>
                      <form action={archiveQuoteAction}>
                        <input type="hidden" name="id" value={q.id} />
                        <input type="hidden" name="archived" value={sp.archives === "1" ? "0" : "1"} />
                        <button className="btn-ghost min-h-8 px-2" title={sp.archives === "1" ? "Désarchiver" : "Archiver"}>
                          <Icon name="archive" size={16} />
                        </button>
                      </form>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {pages > 1 ? (
        <nav className="mt-4 flex items-center justify-between text-sm" aria-label="Pagination">
          <span className="text-muted">
            Page {page} sur {pages}
          </span>
          <div className="flex gap-2">
            {page > 1 ? (
              <Link className="btn-secondary" href={qs({ page: String(page - 1) })}>
                Précédente
              </Link>
            ) : null}
            {page < pages ? (
              <Link className="btn-secondary" href={qs({ page: String(page + 1) })}>
                Suivante
              </Link>
            ) : null}
          </div>
        </nav>
      ) : null}
    </>
  );
}
