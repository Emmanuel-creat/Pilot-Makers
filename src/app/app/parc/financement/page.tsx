import Link from "next/link";
import { Empty, PageHeader, Section } from "@/components/ui";
import { formatEuros } from "@/lib/calc/format";
import { FINANCING_KINDS, FINANCING_STATUSES } from "@/lib/financing";
import { requirePageCtx } from "@/lib/server/session";
import { can } from "@/lib/services/context";
import { listFinancing } from "@/lib/services/financing";
import { FinancingForm } from "./FinancingForm";

export const metadata = { title: "Financement d'équipement" };

export default async function FinancingPage() {
  const ctx = await requirePageCtx();
  if (!can(ctx, "settings")) {
    return (
      <div className="mx-auto max-w-3xl">
        <PageHeader title="Financement d'équipement" back={{ href: "/app/parc", label: "Véhicules et outillage" }} />
        <p className="text-sm text-muted">Seul un administrateur prépare les demandes de financement.</p>
      </div>
    );
  }
  const list = await listFinancing(ctx);
  const canEdit = !ctx.entitlements.readOnly && !ctx.supportAccess;
  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title="Financement d'équipement"
        subtitle="Simulez les mensualités puis préparez le dossier à envoyer à votre banque ou à un loueur."
        back={{ href: "/app/parc", label: "Véhicules et outillage" }}
      />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Section title="Demandes">
          {list.length ? (
            <ul className="divide-y divide-line text-sm" data-testid="financements">
              {list.map((f) => (
                <li key={f.id} className="flex flex-wrap justify-between gap-2 py-2">
                  <span>
                    <Link href={`/app/parc/financement/${f.id}`} className="link font-medium">
                      {f.label}
                    </Link>
                    <span className="block text-xs text-muted">
                      {FINANCING_KINDS[f.kind]}, {f.months} mois{f.lender ? `, ${f.lender}` : ""}
                    </span>
                  </span>
                  <span className="text-right">
                    <span className="tabular">{formatEuros(f.amountCents)} HT</span>
                    <span className="block text-xs text-muted">{FINANCING_STATUSES[f.status]}</span>
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <Empty icon="truck" title="Aucune demande">
              Un véhicule, un engin ou une machine à acheter : estimez la mensualité avant d&apos;en parler à votre banque.
            </Empty>
          )}
        </Section>
        {canEdit ? (
          <Section title="Nouvelle demande">
            <FinancingForm />
          </Section>
        ) : null}
      </div>
    </div>
  );
}
