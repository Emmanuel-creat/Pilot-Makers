import Link from "next/link";
import { Empty, PageHeader, fmtDate } from "@/components/ui";
import { formatEuros } from "@/lib/calc/format";
import { requirePageCtx } from "@/lib/server/session";
import { listWarranties } from "@/lib/services/warranties";
import { WarrantySummary } from "./WarrantySummary";

export const metadata = { title: "Garanties" };

export default async function WarrantiesPage() {
  const ctx = await requirePageCtx();
  const rows = await listWarranties(ctx);
  const canEdit = !ctx.entitlements.readOnly && !ctx.supportAccess;
  const toClaim = rows.filter((r) => r.retention.state === "liberable");
  const held = rows.filter((r) => r.retention.state === "retenue" || r.retention.state === "liberable").reduce((s, r) => s + r.retention.cents, 0);
  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title="Garanties"
        subtitle="Parfait achèvement, bon fonctionnement et décennale de chaque chantier réceptionné, et retenues de garantie à récupérer."
        back={{ href: "/app/chantiers", label: "Chantiers" }}
      />
      {rows.length ? (
        <>
          <p className="mb-4 text-sm text-muted" data-testid="retention-total">
            {held ? `${formatEuros(held)} de retenues encore gardées par vos clients` : "Aucune retenue de garantie en attente"}
            {toClaim.length ? `, dont ${toClaim.length} à réclamer dès maintenant.` : "."}
          </p>
          <ul className="grid gap-3">
            {rows.map((w) => (
              <li key={w.jobId} className="card p-4">
                <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <Link href={`/app/chantiers/${w.jobId}`} className="font-medium hover:underline">
                      {w.title}
                    </Link>
                    <div className="text-sm text-muted">{[w.customerName, `réception le ${fmtDate(w.receptionDate)}`].filter(Boolean).join(", ")}</div>
                  </div>
                  {w.openReserves ? (
                    <span className="rounded-full bg-surface-2 px-2.5 py-0.5 text-xs font-medium whitespace-nowrap text-warning">
                      {w.openReserves} réserve{w.openReserves > 1 ? "s" : ""} à lever
                    </span>
                  ) : null}
                </div>
                <WarrantySummary w={w} canEdit={canEdit} />
              </li>
            ))}
          </ul>
        </>
      ) : (
        <Empty icon="shield" title="Aucun chantier réceptionné">
          Signez le procès-verbal de réception depuis la fiche du chantier : les garanties et la retenue de garantie sont suivies ici, avec un rappel avant
          chaque échéance.
        </Empty>
      )}
    </div>
  );
}
