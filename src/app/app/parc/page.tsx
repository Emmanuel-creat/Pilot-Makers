import Link from "next/link";
import { Empty, Notice, PageHeader, Section, fmtDate } from "@/components/ui";
import { requirePageCtx } from "@/lib/server/session";
import { listResources } from "@/lib/services/planning";
import { listChecks, listTools } from "@/lib/services/fleet";
import { CHECK_STATES, type CheckState } from "@/lib/fleet";
import { CheckDone, CheckForm, ToolForm } from "./FleetForms";

export const metadata = { title: "Véhicules et outillage" };

const TONE: Record<CheckState, string> = { a_jour: "text-success", a_prevoir: "text-warning", en_retard: "text-danger", sans_echeance: "text-muted" };

export default async function FleetPage() {
  const ctx = await requirePageCtx();
  const [resources, tools, checks] = await Promise.all([listResources(ctx), listTools(ctx), listChecks(ctx)]);
  const canEdit = !ctx.entitlements.readOnly && !ctx.supportAccess;
  const vehicles = resources.filter((r) => r.type === "vehicle");
  const assets = [
    ...vehicles.map((v) => ({ value: `vehicle:${v.id}`, label: `${v.name}${v.detail !== "Véhicule" ? ` (${v.detail})` : ""}`, type: "vehicle" as const })),
    ...tools.map((t) => ({ value: `tool:${t.id}`, label: t.name, type: "tool" as const })),
  ];
  const late = checks.filter((c) => c.state === "en_retard");
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageHeader
        title="Véhicules et outillage"
        subtitle="Contrôles techniques, entretiens et vérifications périodiques, avec un rappel quinze jours avant chaque échéance."
      />
      {late.length ? (
        <Notice tone="warning" title="Contrôles en retard">
          {late.map((c) => `${c.assetName} : ${c.label.toLowerCase()}`).join(", ")}.
        </Notice>
      ) : null}
      <Section title="Contrôles">
        {checks.length ? (
          <ul className="divide-y divide-line text-sm" aria-label="Contrôles du parc">
            {checks.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <div className="min-w-0">
                  <div>
                    <span className="font-medium">{c.assetName}</span> : {c.label}
                    {c.intervalMonths ? <span className="text-muted">, tous les {c.intervalMonths} mois</span> : null}
                    {c.note ? <span className="text-muted"> ({c.note})</span> : null}
                  </div>
                  <div className={`text-xs ${TONE[c.state]}`}>
                    {CHECK_STATES[c.state]}
                    {c.dueDate ? `, avant le ${fmtDate(c.dueDate)}` : ""}
                    {c.lastDone ? <span className="text-muted">, dernier le {fmtDate(c.lastDone)}</span> : null}
                  </div>
                </div>
                {canEdit ? <CheckDone id={c.id} label={`${c.label} de ${c.assetName}`} /> : null}
              </li>
            ))}
          </ul>
        ) : (
          <Empty icon="truck" title="Aucun contrôle suivi">
            Ajoutez vos véhicules dans le planning et votre outillage ci-dessous, puis les contrôles à suivre.
          </Empty>
        )}
        {canEdit && assets.length ? (
          <div className="mt-4 border-t border-line pt-4">
            <CheckForm assets={assets} />
          </div>
        ) : null}
      </Section>
      <div className="grid gap-6 md:grid-cols-2">
        <Section title="Véhicules" description="Ajoutés et affectés depuis le planning.">
          {vehicles.length ? (
            <ul className="divide-y divide-line text-sm">
              {vehicles.map((v) => (
                <li key={v.id} className="py-1.5">
                  {v.name} <span className="text-muted">{v.detail}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted">Aucun véhicule.</p>
          )}
          <Link href="/app/planning" className="link mt-2 inline-flex min-h-6 items-center text-sm">
            Gérer les véhicules dans le planning
          </Link>
        </Section>
        <Section title="Outillage et engins">
          {canEdit ? (
            <ToolForm tools={tools} />
          ) : (
            <ul className="text-sm">
              {tools.map((t) => (
                <li key={t.id}>{t.name}</li>
              ))}
            </ul>
          )}
        </Section>
      </div>
    </div>
  );
}
