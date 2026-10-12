import Link from "next/link";
import { Empty, PageHeader, StatusBadge } from "@/components/ui";
import { formatEuros, formatUnitPrice } from "@/lib/calc/format";
import { requirePageCtx } from "@/lib/server/session";
import { searchItems } from "@/lib/services/catalog";
import { customerDisplayName, searchCustomers } from "@/lib/services/customers";
import { listQuotes } from "@/lib/services/quotes";

export const metadata = { title: "Recherche" };

export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q = "" } = await searchParams;
  const ctx = await requirePageCtx();
  const term = q.trim();
  const [quotes, customers, items] = term
    ? await Promise.all([listQuotes(ctx, { q: term, pageSize: 10 }), searchCustomers(ctx, { q: term, limit: 10 }), searchItems(ctx, { q: term, limit: 10 })])
    : [null, [], []];
  const total = (quotes?.items.length ?? 0) + customers.length + items.length;
  return (
    <>
      <PageHeader title="Recherche" subtitle={term ? `Résultats pour « ${term} »` : undefined} />
      <form className="mb-6">
        <input name="q" defaultValue={term} autoFocus placeholder="Numéro de devis, client, prestation" className="field" aria-label="Rechercher" />
      </form>
      {term && total === 0 ? <Empty icon="search" title="Aucun résultat" /> : null}
      <div className="space-y-6">
        {quotes?.items.length ? (
          <section>
            <h2 className="mb-2 text-sm font-semibold text-muted">Devis</h2>
            <ul className="card divide-y divide-line">
              {quotes.items.map((x) => (
                <li key={x.id}>
                  <Link href={`/app/devis/${x.id}`} className="flex items-center justify-between gap-3 px-4 py-3 text-sm hover:bg-surface-2">
                    <span className="min-w-0">
                      <span className="block font-medium">{x.number ?? "Brouillon"}</span>
                      <span className="block truncate text-muted">
                        {x.title} {x.customerName ? `- ${x.customerName}` : ""}
                      </span>
                    </span>
                    <span className="flex shrink-0 items-center gap-2">
                      <span className="tabular">{formatEuros(x.totalTtcCents)}</span>
                      <StatusBadge status={x.status} />
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
        {customers.length ? (
          <section>
            <h2 className="mb-2 text-sm font-semibold text-muted">Clients</h2>
            <ul className="card divide-y divide-line">
              {customers.map((c) => (
                <li key={c.id}>
                  <Link href={`/app/clients/${c.id}`} className="block px-4 py-3 text-sm hover:bg-surface-2">
                    <span className="font-medium">{customerDisplayName(c)}</span>
                    <span className="block text-muted">{[c.billing_city, c.email].filter(Boolean).join(" - ")}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
        {items.length ? (
          <section>
            <h2 className="mb-2 text-sm font-semibold text-muted">Catalogue</h2>
            <ul className="card divide-y divide-line">
              {items.map((it) => (
                <li key={it.id}>
                  <Link href={`/app/catalogue/${it.id}`} className="flex justify-between gap-3 px-4 py-3 text-sm hover:bg-surface-2">
                    <span className="font-medium">{it.name}</span>
                    <span className="tabular text-muted">
                      {formatUnitPrice(it.unit_price4)} / {it.unit}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </div>
    </>
  );
}
