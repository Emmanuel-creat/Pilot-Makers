import Link from "next/link";
import { benchmarkOptinAction } from "@/app/actions";
import { ActionForm } from "@/components/forms/ActionForm";
import { Submit } from "@/components/forms/Submit";
import { PageHeader, Section } from "@/components/ui";
import type { Band, Position } from "@/lib/benchmark";
import { formatEuros } from "@/lib/calc/format";
import { requirePageCtx } from "@/lib/server/session";
import { benchmarkBoard } from "@/lib/services/benchmark";
import { can } from "@/lib/services/context";

export const metadata = { title: "Repères anonymes" };

const POSITION: Record<Position, { label: string; tone: string }> = {
  bas: { label: "En dessous", tone: "text-accent" },
  dans: { label: "Dans la fourchette", tone: "text-success" },
  haut: { label: "Au-dessus", tone: "text-warning" },
};

const fmt = (v: number, unit: string) =>
  unit === "€ HT" ? `${formatEuros(Math.round(v * 100))} HT` : `${v.toLocaleString("fr-FR", { maximumFractionDigits: unit === "%" ? 0 : 1 })} ${unit}`;

function BandText({ b, f }: { b: Band; f: (v: number) => string }) {
  return (
    <>
      {f(b.low)} à {f(b.high)}
      <span className="block text-xs text-muted">médiane {f(b.median)}</span>
    </>
  );
}

export default async function BenchmarkPage() {
  const ctx = await requirePageCtx();
  const b = await benchmarkBoard(ctx);
  const canSet = can(ctx, "settings") && !ctx.entitlements.readOnly && !ctx.supportAccess;
  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title="Repères anonymes"
        subtitle="Situez vos prix et vos résultats par rapport à des entreprises semblables, sans qu'aucune donnée individuelle ne soit visible."
        back={{ href: "/app/rapports", label: "Rapports" }}
      />
      <div className="space-y-6">
        <Section
          title="Participation"
          description={`${b.participants} entreprise${b.participants > 1 ? "s" : ""} participe${b.participants > 1 ? "nt" : ""} aujourd'hui.`}
        >
          <div className="space-y-3 text-sm">
            <p>
              En participant, les prix de vente de vos prestations comparables (articles de la bibliothèque commune ou avec un code-barres) et trois indicateurs
              de l&apos;année écoulée entrent dans des moyennes. Les autres participants ne voient que des fourchettes calculées sur au moins {b.minOrgs}{" "}
              entreprises, jamais votre nom, vos clients ni un montant isolé. Vous voyez les repères seulement si vous participez.
            </p>
            {canSet ? (
              <ActionForm action={benchmarkOptinAction} className="flex flex-wrap items-center gap-3">
                <input type="hidden" name="optin" value={b.optedIn ? "0" : "1"} />
                <Submit className={b.optedIn ? "btn-secondary" : "btn-primary"}>{b.optedIn ? "Arrêter de participer" : "Participer aux repères"}</Submit>
              </ActionForm>
            ) : (
              <p className="text-muted">{b.optedIn ? "Votre entreprise participe." : "Seul un administrateur peut activer la participation."}</p>
            )}
          </div>
        </Section>

        {b.optedIn ? (
          <>
            <Section
              title="Vos prix face au marché"
              description={
                b.region
                  ? `Fourchette des autres entreprises en ${b.region}, sinon en France si elles sont trop peu nombreuses.`
                  : "Fourchette des autres entreprises en France."
              }
            >
              {b.prices.length ? (
                <div className="overflow-x-auto" tabIndex={0} role="region" aria-label="Vos prix face au marché">
                  <table className="w-full text-left text-sm" data-testid="indice-prix">
                    <thead className="text-xs text-muted">
                      <tr>
                        <th className="py-2 pr-3 font-medium">Prestation</th>
                        <th className="py-2 pr-3 text-right font-medium">Votre prix HT</th>
                        <th className="py-2 pr-3 text-right font-medium">Fourchette</th>
                        <th className="py-2 font-medium">Position</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-line">
                      {b.prices.map((p) => (
                        <tr key={p.id} className="align-top">
                          <td className="py-2 pr-3">
                            <Link href={`/app/catalogue/${p.id}`} className="link">
                              {p.name}
                            </Link>
                            <span className="block text-xs text-muted">par {p.unit}</span>
                          </td>
                          <td className="tabular py-2 pr-3 text-right">{formatEuros(p.priceCents)}</td>
                          <td className="tabular py-2 pr-3 text-right">
                            {p.band ? <BandText b={p.band} f={(v) => formatEuros(v)} /> : <span className="text-muted">Pas assez de données</span>}
                          </td>
                          <td className="py-2">
                            {p.position ? (
                              <span className={POSITION[p.position].tone}>
                                {POSITION[p.position].label}
                                <span className="block text-xs text-muted">{p.scope === "region" ? "dans la région" : "en France"}</span>
                              </span>
                            ) : null}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-sm text-muted">
                  Aucune prestation comparable : ajoutez une{" "}
                  <Link href="/app/catalogue/bibliotheques" className="link">
                    bibliothèque de prestations
                  </Link>{" "}
                  ou des codes-barres à vos articles.
                </p>
              )}
            </Section>

            {b.peers ? (
              <Section title="Entreprises semblables" description={`Comparaison sur les 12 derniers mois : ${b.peers.label}.`}>
                <ul className="divide-y divide-line text-sm" data-testid="comparaison">
                  {b.peers.metrics.map((m) => (
                    <li key={m.key} className="grid gap-2 py-3 sm:grid-cols-[minmax(0,1fr)_10rem_12rem_10rem]">
                      <span className="font-medium">{m.label}</span>
                      <span className="tabular sm:text-right">
                        <span className="text-xs text-muted sm:hidden">Vous : </span>
                        {m.mine !== null ? fmt(m.mine, m.unit) : <span className="text-muted">pas encore mesuré</span>}
                      </span>
                      <span className="tabular sm:text-right">
                        {m.band ? <BandText b={m.band} f={(v) => fmt(v, m.unit)} /> : <span className="text-muted">Pas assez d&apos;entreprises</span>}
                      </span>
                      <span>
                        {m.position ? (
                          <span
                            className={
                              m.better === null
                                ? ""
                                : (m.position === "haut") === (m.better === "high")
                                  ? "text-success"
                                  : m.position === "dans"
                                    ? ""
                                    : "text-warning"
                            }
                          >
                            {POSITION[m.position].label}
                          </span>
                        ) : null}
                      </span>
                    </li>
                  ))}
                </ul>
              </Section>
            ) : null}
          </>
        ) : null}
      </div>
    </div>
  );
}
