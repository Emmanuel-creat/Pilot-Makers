import Link from "next/link";
import { diagnosisCreateAction } from "@/app/actions";
import { ActionForm } from "@/components/forms/ActionForm";
import { Submit } from "@/components/forms/Submit";
import { Empty, fmtDate, PageHeader, Section } from "@/components/ui";
import { HEATINGS, INSULATION, PERIODS, VENTILATION, WINDOWS } from "@/lib/energy-diagnosis";
import { requirePageCtx } from "@/lib/server/session";
import { customerDisplayName, searchCustomers } from "@/lib/services/customers";
import { listDiagnoses } from "@/lib/services/energy-diagnoses";

export const metadata = { title: "Diagnostic énergétique" };

function Choice({ name, label, options, value }: { name: string; label: string; options: Record<string, string>; value: string }) {
  return (
    <div>
      <label className="label" htmlFor={`de-${name}`}>
        {label}
      </label>
      <select id={`de-${name}`} name={name} className="field" defaultValue={value}>
        {Object.entries(options).map(([k, v]) => (
          <option key={k} value={k}>
            {v}
          </option>
        ))}
      </select>
    </div>
  );
}

export default async function EnergyDiagnosisPage({ searchParams }: { searchParams: Promise<{ client?: string }> }) {
  const sp = await searchParams;
  const ctx = await requirePageCtx();
  const [customers, list] = await Promise.all([searchCustomers(ctx, { limit: 500 }), listDiagnoses(ctx)]);
  const writable = !ctx.entitlements.readOnly && !ctx.supportAccess;
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageHeader
        title="Diagnostic énergétique"
        back={{ href: "/app/devis", label: "Devis" }}
        subtitle="Pendant la visite : étiquette estimée, travaux les plus utiles, économies et aides, puis le devis en un geste. Ce diagnostic ne remplace pas un DPE."
      />
      {writable ? (
        <Section title="Nouveau diagnostic">
          <ActionForm action={diagnosisCreateAction} className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="sm:col-span-2">
                <label className="label" htmlFor="de-customer">
                  Client
                </label>
                <select id="de-customer" name="customerId" className="field" defaultValue={sp.client ?? ""}>
                  <option value="">Sans client pour l&apos;instant</option>
                  {customers.map((c) => (
                    <option key={c.id} value={c.id}>
                      {customerDisplayName(c)}
                      {c.billing_city ? ` (${c.billing_city})` : ""}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label" htmlFor="de-postalCode">
                  Code postal du logement
                </label>
                <input id="de-postalCode" name="postalCode" className="field" inputMode="numeric" required pattern="\d{5}" />
              </div>
              <Choice name="housing" label="Logement" options={{ maison: "Maison", appartement: "Appartement" }} value="maison" />
              <div>
                <label className="label" htmlFor="de-surface">
                  Surface habitable (m²)
                </label>
                <input id="de-surface" name="surface" className="field" inputMode="decimal" required />
              </div>
              <Choice name="period" label="Construction" options={PERIODS} value="1948_1974" />
              <Choice name="heating" label="Chauffage" options={HEATINGS} value="gaz" />
              <Choice name="roof" label="Combles et toiture" options={INSULATION} value="non" />
              <Choice name="walls" label="Murs" options={INSULATION} value="non" />
              <Choice name="floor" label="Plancher bas" options={INSULATION} value="non" />
              <Choice name="windows" label="Fenêtres" options={WINDOWS} value="double_ancien" />
              <Choice name="ventilation" label="Ventilation" options={VENTILATION} value="naturelle" />
            </div>
            <fieldset className="grid gap-3 sm:grid-cols-3">
              <legend className="label">Ressources du foyer, pour estimer MaPrimeRénov&apos; (facultatif)</legend>
              <div>
                <label className="label" htmlFor="de-householdSize">
                  Personnes au foyer
                </label>
                <input id="de-householdSize" name="householdSize" className="field" inputMode="numeric" defaultValue="2" required />
              </div>
              <div>
                <label className="label" htmlFor="de-income">
                  Revenu fiscal de référence (€)
                </label>
                <input id="de-income" name="income" className="field" inputMode="numeric" />
              </div>
            </fieldset>
            <Submit className="btn-primary">Établir le diagnostic</Submit>
          </ActionForm>
        </Section>
      ) : null}
      <Section title="Diagnostics précédents">
        {list.length ? (
          <ul className="divide-y divide-line text-sm">
            {list.map((d) => (
              <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <Link className="link" href={`/app/devis/diagnostic-energetique/${d.id}`}>
                  {d.customer_name ?? "Sans client"}, {fmtDate(d.created_at)}
                </Link>
                <span className="text-muted">
                  Étiquette {d.current_class} puis {d.after_class}
                  {d.quote_number ? `, devis ${d.quote_number}` : d.quote_id ? ", devis en brouillon" : ""}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <Empty icon="sun" title="Aucun diagnostic">
            Remplissez le formulaire pendant la visite du logement.
          </Empty>
        )}
      </Section>
    </div>
  );
}
