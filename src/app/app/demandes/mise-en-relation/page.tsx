import { ActionForm } from "@/components/forms/ActionForm";
import { Submit } from "@/components/forms/Submit";
import { Notice, PageHeader, Section } from "@/components/ui";
import { MATCH_TRADES, MAX_ARTISANS } from "@/lib/matching";
import { requirePageCtx } from "@/lib/server/session";
import { getMatchingProfile } from "@/lib/services/matching";
import { matchingProfileAction } from "@/app/actions";

export const metadata = { title: "Demandes de particuliers" };

export default async function MatchingPage() {
  const ctx = await requirePageCtx();
  const p = await getMatchingProfile(ctx);
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader
        title="Demandes de particuliers"
        back={{ href: "/app/demandes", label: "Demandes" }}
        subtitle={`Les particuliers décrivent leurs travaux sur la page publique Trouver un artisan. Chaque demande est transmise à ${MAX_ARTISANS} entreprises au plus, d'abord à celles qui en ont reçu le moins : pas d'enchères, pas de contacts payants.`}
      />
      <Notice tone={p.enabled ? "success" : "info"} title={p.enabled ? "Réception active" : "Réception désactivée"}>
        {p.enabled
          ? `${p.lastWeek} demande${p.lastWeek > 1 ? "s" : ""} reçue${p.lastWeek > 1 ? "s" : ""} ces 7 derniers jours sur ${p.weeklyCap} au plus, ${p.received} au total. Elles arrivent dans vos demandes avec la source Plateforme de mise en relation.`
          : "Activez la réception pour recevoir des demandes dans vos départements. Le SIREN et l'assurance professionnelle du profil sont exigés."}
      </Notice>
      <Section title="Réglages">
        <ActionForm action={matchingProfileAction} className="space-y-4 text-sm">
          <label className="flex min-h-6 items-center gap-2 font-medium">
            <input type="checkbox" name="enabled" defaultChecked={p.enabled} /> Recevoir des demandes de particuliers
          </label>
          <fieldset>
            <legend className="label">Types de travaux acceptés</legend>
            <div className="grid gap-1 sm:grid-cols-2">
              {MATCH_TRADES.map((t) => (
                <label key={t.key} className="flex min-h-6 items-center gap-2">
                  <input type="checkbox" name="trades" value={t.key} defaultChecked={p.trades.includes(t.key)} /> {t.label}
                </label>
              ))}
            </div>
          </fieldset>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="m-deps">
                Départements d&apos;intervention
              </label>
              <input id="m-deps" name="departments" className="field" defaultValue={p.departments.join(", ")} placeholder="Ex. 69, 01, 38" />
            </div>
            <div>
              <label className="label" htmlFor="m-cap">
                Demandes acceptées par semaine
              </label>
              <input id="m-cap" name="weeklyCap" type="number" min={1} max={50} className="field tabular" defaultValue={p.weeklyCap} />
            </div>
          </div>
          <Submit>Enregistrer</Submit>
        </ActionForm>
      </Section>
    </div>
  );
}
