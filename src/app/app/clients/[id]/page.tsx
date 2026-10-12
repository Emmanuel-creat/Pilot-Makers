import Link from "next/link";
import { notFound } from "next/navigation";
import { Icon } from "@/components/Icon";
import { Notice, PageHeader, StatusBadge, fmtDate } from "@/components/ui";
import { formatEuros } from "@/lib/calc/format";
import { num } from "@/lib/db";
import { requirePageCtx } from "@/lib/server/session";
import { customerDisplayName, getCustomer } from "@/lib/services/customers";
import type { QuoteStatus } from "@/lib/services/quote-types";
import { archiveCustomerAction } from "@/app/actions";
import { EditCustomer } from "./EditCustomer";

export const metadata = { title: "Client" };

export default async function CustomerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requirePageCtx();
  const c = await getCustomer(ctx, id).catch(() => notFound());
  const quotes = await ctx.db.query<{ id: string; number: string | null; title: string; status: QuoteStatus; total_ttc_cents: unknown; updated_at: Date }>(
    "SELECT id, number, title, status, total_ttc_cents, updated_at FROM quotes WHERE customer_id=$1 AND org_id=$2 ORDER BY updated_at DESC",
    [id, ctx.orgId],
  );
  const accepted = quotes.filter((q) => q.status === "accepted").reduce((n, q) => n + num(q.total_ttc_cents), 0);
  const { id: _id, org_id: _o, archived_at, created_at: _c, updated_at: _u, last_activity_at: _l, ...form } = c;
  return (
    <>
      <PageHeader
        title={customerDisplayName(c)}
        back={{ href: "/app/clients", label: "Clients" }}
        subtitle={`Client depuis le ${fmtDate(c.created_at)}`}
        actions={
          <>
            <Link href={`/app/devis/nouveau?client=${c.id}`} className="btn-primary">
              <Icon name="plus" size={16} /> Nouveau devis
            </Link>
            <form action={archiveCustomerAction}>
              <input type="hidden" name="id" value={c.id} />
              <input type="hidden" name="archived" value={archived_at ? "0" : "1"} />
              <button className="btn-secondary">
                <Icon name="archive" size={16} /> {archived_at ? "Désarchiver" : "Archiver"}
              </button>
            </form>
          </>
        }
      />
      {archived_at ? (
        <div className="mb-4">
          <Notice tone="info">Ce client est archivé : il n'apparaît plus dans les recherches. Ses devis sont conservés.</Notice>
        </div>
      ) : null}
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <section className="card p-5">
          <h2 className="mb-4 font-semibold">Coordonnées</h2>
          <EditCustomer id={c.id} initial={{ ...form, tags: c.tags ?? [] }} />
        </section>
        <aside className="space-y-4">
          <section className="card p-4">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <div className="text-muted">Devis</div>
                <div className="text-xl font-semibold">{quotes.length}</div>
              </div>
              <div>
                <div className="text-muted">Accepté TTC</div>
                <div className="tabular text-xl font-semibold">{formatEuros(accepted)}</div>
              </div>
            </div>
          </section>
          <section className="card p-4">
            <h2 className="mb-2 text-sm font-semibold">Historique des devis</h2>
            {quotes.length === 0 ? <p className="text-sm text-muted">Aucun devis pour ce client.</p> : null}
            <ul className="divide-y divide-line">
              {quotes.map((q) => (
                <li key={q.id}>
                  <Link href={`/app/devis/${q.id}`} className="flex items-center justify-between gap-2 py-2.5 text-sm hover:text-accent">
                    <span className="min-w-0">
                      <span className="block truncate font-medium">{q.number ?? "Brouillon"}</span>
                      <span className="block truncate text-xs text-muted">
                        {q.title || "Sans objet"} - {fmtDate(q.updated_at)}
                      </span>
                    </span>
                    <span className="shrink-0 text-right">
                      <span className="tabular block">{formatEuros(num(q.total_ttc_cents))}</span>
                      <StatusBadge status={q.status} />
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        </aside>
      </div>
    </>
  );
}
