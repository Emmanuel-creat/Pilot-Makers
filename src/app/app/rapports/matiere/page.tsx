import { notFound } from "next/navigation";
import { Empty, PageHeader, Section } from "@/components/ui";
import { formatEuros } from "@/lib/calc/format";
import { FATES, type Fate, formatQuantity } from "@/lib/material-balance";
import { requirePageCtx } from "@/lib/server/session";
import { can } from "@/lib/services/context";
import { materialSummary } from "@/lib/services/material-balance";

export const metadata = { title: "Matière et réemploi" };

/** Douze derniers mois : matériaux commandés en trop et devenir des restes. */
export default async function MaterialSummaryPage() {
  const ctx = await requirePageCtx();
  if (!can(ctx, "costs")) notFound();
  const s = await materialSummary(ctx);
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader
        title="Matière et réemploi"
        subtitle="Sur douze mois, la matière commandée en trop et ce que deviennent les restes : commander juste, c'est moins de déchets et plus de marge."
        back={{ href: "/app/rapports", label: "Rapports" }}
      />
      {s.jobs ? (
        <>
          <Section title={`Surplus : ${formatEuros(s.surplusCents)}`} description={`Sur ${s.jobs} chantier${s.jobs > 1 ? "s" : ""} avec commandes.`}>
            {s.top.length ? (
              <ul className="divide-y divide-line text-sm" data-testid="matiere-surplus">
                {s.top.map((r) => (
                  <li key={r.key} className="flex justify-between gap-3 py-2">
                    <span>
                      {r.label}{" "}
                      <span className="text-muted">
                        ({formatQuantity(r.returnedMilli + r.leftoverMilli)} {r.unit} en trop)
                      </span>
                    </span>
                    <span className="tabular shrink-0">{formatEuros(r.surplusCents)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted">Aucun surplus noté : vos commandes sont au plus juste.</p>
            )}
          </Section>
          <Section title="Devenir des restes">
            <dl className="grid gap-3 text-sm sm:grid-cols-3">
              {(Object.keys(FATES) as Fate[]).map((f) => (
                <div key={f}>
                  <dt className="text-muted">{FATES[f]}</dt>
                  <dd className="text-lg font-semibold">{formatEuros(s.fates[f])}</dd>
                </div>
              ))}
            </dl>
          </Section>
        </>
      ) : (
        <Empty icon="box" title="Pas encore de commande fournisseur">
          Le bilan se remplit avec les commandes passées depuis les chantiers et les restes notés en fin de chantier.
        </Empty>
      )}
    </div>
  );
}
