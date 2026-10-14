import Link from "next/link";
import { notFound } from "next/navigation";
import { diagnosisQuoteAction } from "@/app/actions";
import { PrintButton } from "@/app/app/rapports/ReportActions";
import { ActionForm } from "@/components/forms/ActionForm";
import { Submit } from "@/components/forms/Submit";
import { fmtDate, Notice, PageHeader, Section } from "@/components/ui";
import { HEATINGS, INCOMES, INSULATION, PERIODS, VENTILATION, WINDOWS, type Performance } from "@/lib/energy-diagnosis";
import { requirePageCtx } from "@/lib/server/session";
import { getDiagnosis } from "@/lib/services/energy-diagnoses";

export const metadata = { title: "Diagnostic énergétique" };

const eur = (n: number) => `${n.toLocaleString("fr-FR")} €`;

function Label({ title, p }: { title: string; p: Performance }) {
  return (
    <div className="card flex items-center gap-4 p-4">
      <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-md border-2 border-accent text-3xl font-bold" aria-hidden="true">
        {p.energyClass}
      </span>
      <div className="text-sm">
        <div className="font-semibold">
          {title} : étiquette {p.energyClass}
        </div>
        <div className="text-muted">
          {p.primaryKwhM2} kWh d&apos;énergie primaire et {p.co2KgM2} kg de CO2 par m² et par an, facture d&apos;environ {eur(p.yearlyBill)} par an
        </div>
      </div>
    </div>
  );
}

export default async function DiagnosisPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requirePageCtx();
  const r = await getDiagnosis(ctx, id).catch(() => null);
  if (!r) notFound();
  const d = r.diagnosis;
  const i = r.input;
  const writable = !ctx.entitlements.readOnly && !ctx.supportAccess;
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageHeader
        title="Diagnostic énergétique"
        back={{ href: "/app/devis/diagnostic-energetique", label: "Diagnostics" }}
        subtitle={`${r.customer_name ?? "Sans client"}, ${fmtDate(r.created_at)} : ${i.housing === "maison" ? "maison" : "appartement"} de ${i.surface} m², ${PERIODS[i.period].toLowerCase()}, zone climatique ${d.zone}.`}
        actions={<PrintButton />}
      />
      {d.sieve ? (
        <Notice tone="warning">
          Passoire thermique : un logement classé {d.current.energyClass} ne peut plus être mis en location (G depuis 2025, F en 2028). Les travaux proposés
          répondent à cette obligation.
        </Notice>
      ) : null}
      <div className="grid gap-3 sm:grid-cols-2" data-testid="etiquettes">
        <Label title="Aujourd'hui" p={d.current} />
        <Label title="Après tous les travaux" p={d.after} />
      </div>
      <Section title="État relevé">
        <dl className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
          <div>
            <dt className="inline text-muted">Chauffage : </dt>
            <dd className="inline">{HEATINGS[i.heating]}</dd>
          </div>
          <div>
            <dt className="inline text-muted">Combles et toiture : </dt>
            <dd className="inline">{INSULATION[i.roof]}</dd>
          </div>
          <div>
            <dt className="inline text-muted">Murs : </dt>
            <dd className="inline">{INSULATION[i.walls]}</dd>
          </div>
          <div>
            <dt className="inline text-muted">Plancher bas : </dt>
            <dd className="inline">{INSULATION[i.floor]}</dd>
          </div>
          <div>
            <dt className="inline text-muted">Fenêtres : </dt>
            <dd className="inline">{WINDOWS[i.windows]}</dd>
          </div>
          <div>
            <dt className="inline text-muted">Ventilation : </dt>
            <dd className="inline">{VENTILATION[i.ventilation]}</dd>
          </div>
        </dl>
      </Section>
      <Section title="Travaux proposés, du plus rentable au moins rentable">
        {d.works.length ? (
          <ActionForm action={diagnosisQuoteAction} className="space-y-4">
            <input type="hidden" name="id" value={id} />
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-xs text-muted">
                  <tr>
                    <th className="py-1 pr-2 font-medium">Travaux</th>
                    <th className="px-2 py-1 text-right font-medium">Coût TTC estimé</th>
                    <th className="px-2 py-1 text-right font-medium">Aide par geste</th>
                    <th className="px-2 py-1 text-right font-medium">Économie par an</th>
                    <th className="py-1 pl-2 text-right font-medium">Étiquette seule</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {d.works.map((w) => (
                    <tr key={w.key}>
                      <td className="py-1.5 pr-2">
                        <label className="flex items-start gap-2">
                          <input type="checkbox" name="works" value={w.key} defaultChecked disabled={!writable} className="mt-0.5" />
                          <span>
                            {w.label}
                            <span className="block text-xs text-muted">
                              {w.quantity} {w.unit}
                            </span>
                          </span>
                        </label>
                      </td>
                      <td className="tabular px-2 py-1.5 text-right">
                        {eur(w.costMin)} à {eur(w.costMax)}
                      </td>
                      <td className="tabular px-2 py-1.5 text-right">{w.aid ? eur(w.aid) : "Certificats d'économies d'énergie"}</td>
                      <td className="tabular px-2 py-1.5 text-right">{eur(w.yearlySaving)}</td>
                      <td className="tabular py-1.5 pl-2 text-right">{w.classAfter}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <dl className="grid gap-2 text-sm sm:grid-cols-2" data-testid="bilan-diagnostic">
              <div>
                <dt className="text-muted">Tous les travaux</dt>
                <dd className="font-semibold">
                  {eur(d.costMin)} à {eur(d.costMax)}, gain de {d.classGain} classe{d.classGain > 1 ? "s" : ""}
                </dd>
              </div>
              <div>
                <dt className="text-muted">Économie annuelle</dt>
                <dd className="font-semibold">{eur(d.yearlySaving)}</dd>
              </div>
              <div>
                <dt className="text-muted">Aides MaPrimeRénov&apos; estimées</dt>
                <dd className="font-semibold">
                  {d.income === null
                    ? "Renseignez les ressources du foyer pour les estimer"
                    : `${eur(d.bestAid)} (ressources ${INCOMES[d.income].toLowerCase()})`}
                </dd>
                {d.ampleurAid !== null ? (
                  <dd className="text-xs text-muted">
                    Par geste : {eur(d.gestureAid)}. Rénovation d&apos;ampleur : {eur(d.ampleurAid)}, avec un accompagnateur Mon Accompagnateur Rénov&apos;
                    obligatoire.
                  </dd>
                ) : null}
              </div>
              <div>
                <dt className="text-muted">Reste à charge</dt>
                <dd className="font-semibold">
                  {eur(d.remainingMin)} à {eur(d.remainingMax)}
                </dd>
              </div>
            </dl>
            <p className="text-xs text-muted">
              Estimation indicative fondée sur des valeurs moyennes et le barème MaPrimeRénov&apos; 2025 ; les certificats d&apos;économies d&apos;énergie
              s&apos;y ajoutent. Les aides exigent une entreprise qualifiée RGE pour chaque domaine et un devis signé après la visite.
            </p>
            {r.quote_id ? (
              <Notice tone="info">
                Un devis a déjà été créé depuis ce diagnostic :{" "}
                <Link className="link" href={`/app/devis/${r.quote_id}`}>
                  {r.quote_number ?? "brouillon"}
                </Link>
                .
              </Notice>
            ) : null}
            {writable ? <Submit className="btn-primary">Créer le devis des travaux cochés</Submit> : null}
          </ActionForm>
        ) : (
          <Notice tone="success">Rien d&apos;utile à proposer : le logement est déjà bien isolé et bien chauffé.</Notice>
        )}
      </Section>
    </div>
  );
}
