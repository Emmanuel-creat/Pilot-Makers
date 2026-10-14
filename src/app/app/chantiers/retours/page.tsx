import Link from "next/link";
import { notFound } from "next/navigation";
import { Empty, PageHeader, Section, fmtDate } from "@/components/ui";
import { formatEuros } from "@/lib/calc/format";
import { requirePageCtx } from "@/lib/server/session";
import { can } from "@/lib/services/context";
import { openReturns } from "@/lib/services/supplier-returns";
import { RETURN_REASONS, RETURN_STATUSES } from "@/lib/supplier-returns";

export const metadata = { title: "Retours fournisseurs" };

export default async function ReturnsPage() {
  const ctx = await requirePageCtx();
  if (!can(ctx, "costs")) notFound();
  const { list, expectedCents } = await openReturns(ctx);
  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title="Retours fournisseurs"
        back={{ href: "/app/chantiers", label: "Chantiers" }}
        subtitle={
          list.length
            ? `${list.length} retour${list.length > 1 ? "s" : ""} en attente d'avoir, ${formatEuros(expectedCents)} HT à récupérer.`
            : "Tous les retours ont reçu leur avoir."
        }
      />
      {list.length ? (
        <Section title="Avoirs attendus" description="Les plus anciens en premier. Notez la reprise et l'avoir depuis la commande.">
          <ul className="divide-y divide-line text-sm" data-testid="retours-en-attente">
            {list.map((r) => (
              <li key={r.id} className="flex flex-wrap items-start justify-between gap-2 py-2">
                <div className="min-w-0">
                  <p className="font-medium">
                    {r.label}, {r.quantity.replace(".", ",")} {r.unit}
                    <span className="font-normal text-muted">{`, ${r.supplier || "fournisseur à préciser"}`}</span>
                  </p>
                  <p className="text-xs text-muted">
                    <Link className="link" href={`/app/chantiers/${r.jobId}/commandes/${r.orderId}`}>
                      {r.orderNumber}
                    </Link>
                    , {r.jobTitle}, {RETURN_REASONS[r.reason].toLowerCase()}, déclaré le {fmtDate(r.createdAt)}
                  </p>
                </div>
                <div className="text-right">
                  <p className={`text-xs font-medium ${r.status === "repris" ? "text-accent" : "text-muted"}`}>{RETURN_STATUSES[r.status]}</p>
                  <p className="tabular">{formatEuros(r.expectedCents)} HT</p>
                </div>
              </li>
            ))}
          </ul>
        </Section>
      ) : (
        <Empty icon="undo" title="Aucun retour en attente">
          Déclarez un retour (casse, erreur, défaut, surplus) depuis la commande concernée : la reprise et l&apos;avoir y sont suivis.
        </Empty>
      )}
    </div>
  );
}
