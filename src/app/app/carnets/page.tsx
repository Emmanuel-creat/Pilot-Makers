import Link from "next/link";
import { Icon } from "@/components/Icon";
import { Empty, PageHeader } from "@/components/ui";
import { requirePageCtx } from "@/lib/server/session";
import { listHomeRecords } from "@/lib/services/home-records";

export const metadata = { title: "Carnets de logement" };

export default async function HomeRecordsPage({ searchParams }: { searchParams: Promise<{ client?: string }> }) {
  const sp = await searchParams;
  const ctx = await requirePageCtx();
  const list = await listHomeRecords(ctx, sp.client);
  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title="Carnets de logement"
        subtitle="Un carnet par adresse de chantier : travaux, équipements, entretiens, diagnostics et garanties, transmissible au propriétaire suivant."
        back={{ href: "/app/clients", label: "Clients" }}
        actions={
          <Link href="/app/carnets/entretiens" className="btn-secondary">
            <Icon name="calendar" size={16} /> Entretiens
          </Link>
        }
      />
      {list.length ? (
        <ul className="card divide-y divide-border text-sm" data-testid="carnets">
          {list.map((h) => (
            <li key={h.id}>
              <Link href={`/app/carnets/${h.id}`} className="flex flex-wrap items-center gap-3 p-4 hover:bg-surface-2">
                <Icon name="home" className="text-accent" />
                <span className="min-w-0 flex-1">
                  <span className="block font-medium">{h.address}</span>
                  <span className="block text-muted">
                    {h.customer}
                    {h.entries ? `, ${h.entries} entrée${h.entries > 1 ? "s" : ""}` : ""}
                    {h.shared ? ", lien de transmission actif" : ""}
                  </span>
                </span>
                <Icon name="right" />
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <Empty icon="home" title="Aucun carnet pour l'instant">
          Un carnet se crée pour chaque adresse de chantier renseignée.
        </Empty>
      )}
    </div>
  );
}
