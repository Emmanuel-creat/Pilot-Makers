import Link from "next/link";
import { Icon } from "@/components/Icon";
import { Empty, PageHeader, fmtDate } from "@/components/ui";
import { num } from "@/lib/db";
import { requirePageCtx } from "@/lib/server/session";
import { CUSTOMER_TYPES, customerDisplayName, listTags, searchCustomers } from "@/lib/services/customers";

export const metadata = { title: "Clients" };

export default async function CustomersPage({ searchParams }: { searchParams: Promise<{ q?: string; tag?: string; archives?: string }> }) {
  const sp = await searchParams;
  const ctx = await requirePageCtx();
  const archived = sp.archives === "1";
  const [rows, tags] = await Promise.all([searchCustomers(ctx, { q: sp.q, tag: sp.tag || undefined, archived, limit: 300 }), listTags(ctx)]);
  return (
    <>
      <PageHeader
        title="Clients"
        subtitle={`${rows.length} client${rows.length > 1 ? "s" : ""}${archived ? " archivé(s)" : ""}`}
        actions={
          <>
            <a href="/api/customers/export" className="btn-secondary">
              <Icon name="download" size={16} /> Exporter
            </a>
            <Link href="/app/clients/import" className="btn-secondary">
              <Icon name="upload" size={16} /> Importer
            </Link>
            <Link href="/app/clients/nouveau" className="btn-primary">
              <Icon name="plus" size={16} /> Nouveau client
            </Link>
          </>
        }
      />
      <form className="mb-4 flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <Icon name="search" size={16} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted" />
          <input name="q" defaultValue={sp.q} placeholder="Nom, ville, e-mail, téléphone, SIREN" className="field pl-9" aria-label="Rechercher" />
        </div>
        {tags.length ? (
          <select name="tag" defaultValue={sp.tag ?? ""} className="field sm:w-48" aria-label="Étiquette">
            <option value="">Toutes les étiquettes</option>
            {tags.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
        ) : null}
        {archived ? <input type="hidden" name="archives" value="1" /> : null}
        <button className="btn-secondary">Filtrer</button>
      </form>
      {rows.length === 0 ? (
        <Empty
          icon="users"
          title={sp.q || sp.tag ? "Aucun client trouvé" : archived ? "Aucun client archivé" : "Aucun client pour le moment"}
          action={
            <Link href="/app/clients/nouveau" className="btn-primary">
              Créer un client
            </Link>
          }
        >
          Vous pouvez aussi importer votre fichier clients au format CSV.
        </Empty>
      ) : (
        <div className="card overflow-hidden">
          <ul className="divide-y divide-line">
            {rows.map((c) => (
              <li key={c.id}>
                <Link href={`/app/clients/${c.id}`} className="flex items-center gap-4 px-4 py-3 hover:bg-surface-2">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent-soft text-sm font-semibold text-accent">
                    {customerDisplayName(c).replace(/^(Mme|M\.)\s+/, "").slice(0, 1).toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">{customerDisplayName(c)}</div>
                    <div className="truncate text-sm text-muted">
                      {[CUSTOMER_TYPES[c.type], c.billing_city, c.email || c.phone].filter(Boolean).join(" - ")}
                    </div>
                  </div>
                  <div className="hidden flex-wrap gap-1 md:flex">
                    {c.tags.slice(0, 3).map((t) => (
                      <span key={t} className="rounded bg-surface-2 px-2 py-0.5 text-xs">
                        {t}
                      </span>
                    ))}
                  </div>
                  <div className="hidden text-right text-sm sm:block">
                    <div>{num(c.quote_count)} devis</div>
                    <div className="text-xs text-muted">{fmtDate(c.last_activity_at)}</div>
                  </div>
                  <Icon name="right" size={16} className="text-muted" />
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
      <p className="mt-4 text-sm">
        <Link href={archived ? "/app/clients" : "/app/clients?archives=1"} className="link">
          {archived ? "Voir les clients actifs" : "Voir les clients archivés"}
        </Link>
      </p>
    </>
  );
}
