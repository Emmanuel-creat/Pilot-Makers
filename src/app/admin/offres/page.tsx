import { ActionForm } from "@/components/forms/ActionForm";
import { Submit } from "@/components/forms/Submit";
import { PageHeader, Section } from "@/components/ui";
import { centsToInput } from "@/lib/calc/format";
import { requireAdminPage } from "@/lib/server/session";
import { listPlans } from "@/lib/services/billing";
import { planAction } from "@/app/actions";

export const metadata = { title: "Offres" };

export default async function PlansPage() {
  const ctx = await requireAdminPage();
  const plans = await listPlans(ctx.db, false);
  return (
    <>
      <PageHeader title="Offres et limites" subtitle="Les modifications s'appliquent immédiatement aux comptes concernés." />
      <div className="grid gap-6 lg:grid-cols-2">
        {plans.map((p) => (
          <Section key={p.code} title={`${p.name} (${p.code})`}>
            <ActionForm action={planAction} className="space-y-3 text-sm">
              <input type="hidden" name="code" value={p.code} />
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Nom</label>
                  <input name="name" defaultValue={p.name} className="field" required />
                </div>
                <div>
                  <label className="label">Description</label>
                  <input name="description" defaultValue={p.description} className="field" />
                </div>
                <div>
                  <label className="label">Prix mensuel HT (€)</label>
                  <input name="price_month" defaultValue={centsToInput(p.price_month_cents)} className="field" inputMode="decimal" />
                </div>
                <div>
                  <label className="label">Prix annuel HT (€)</label>
                  <input name="price_year" defaultValue={centsToInput(p.price_year_cents)} className="field" inputMode="decimal" />
                </div>
                <div>
                  <label className="label">Utilisateurs</label>
                  <input name="max_users" type="number" min={1} defaultValue={p.max_users} className="field" />
                </div>
                <div>
                  <label className="label">Devis émis / mois (vide = illimité)</label>
                  <input name="max_quotes_per_month" type="number" min={1} defaultValue={p.max_quotes_per_month ?? ""} className="field" />
                </div>
                <div>
                  <label className="label">Assistant / mois</label>
                  <input name="ai_quota_month" type="number" min={0} defaultValue={p.ai_quota_month} className="field" />
                </div>
                <div>
                  <label className="label">Jours d'essai</label>
                  <input name="trial_days" type="number" min={0} max={90} defaultValue={p.trial_days} className="field" />
                </div>
              </div>
              <div className="flex flex-wrap gap-4">
                {(
                  [
                    ["active", "Proposée", p.active],
                    ["watermark", "Mention du logiciel sur le PDF", !!p.features.watermark],
                    ["margin", "Marge", !!p.features.margin],
                    ["reminders", "Relances", !!p.features.reminders],
                    ["templates", "Modèles", !!p.features.templates],
                  ] as const
                ).map(([k, l, v]) => (
                  <label key={k} className="flex items-center gap-2">
                    <input type="checkbox" name={k} defaultChecked={v} className="h-4 w-4" /> {l}
                  </label>
                ))}
              </div>
              <div className="flex justify-end">
                <Submit>Enregistrer</Submit>
              </div>
            </ActionForm>
          </Section>
        ))}
      </div>
    </>
  );
}
