import Link from "next/link";
import { visitSettingsAction } from "@/app/actions";
import { ActionForm } from "@/components/forms/ActionForm";
import { Submit } from "@/components/forms/Submit";
import { Icon } from "@/components/Icon";
import { DAYS, formatDayHours } from "@/lib/business-listing";
import { DURATIONS, NOTICES, type VisitSettings } from "@/lib/visits";

/** Réglages de la prise de rendez-vous de visite en ligne, depuis la vitrine. */
export function VisitSettingsForm({ settings, slug, published, canEdit }: { settings: VisitSettings; slug: string; published: boolean; canEdit: boolean }) {
  return (
    <section className="card space-y-3 p-5" aria-labelledby="sc-visits">
      <h2 id="sc-visits" className="font-semibold">
        Rendez-vous de visite en ligne
      </h2>
      <p className="text-sm text-muted">
        Vos visiteurs choisissent un créneau libre parmi vos plages de visite. La demande arrive au statut « Visite prévue », vous êtes prévenu par e-mail et
        sur votre téléphone, et la visite s'ajoute à votre agenda synchronisé. Les jours de congé du dirigeant ne sont pas proposés.
      </p>
      <ActionForm action={visitSettingsAction} className="space-y-4">
        <fieldset disabled={!canEdit} className="space-y-4">
          <legend className="sr-only">Réglages des visites</legend>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="enabled" className="h-4 w-4" defaultChecked={settings.enabled} /> Proposer la prise de rendez-vous sur ma vitrine
          </label>
          <p className="text-sm text-muted">Plages de visite, par exemple 17h-19h. Laissez vide les jours sans visite.</p>
          <div className="grid gap-3 sm:grid-cols-2">
            {DAYS.map((d) => (
              <div key={d.key}>
                <label className="label" htmlFor={`v-${d.key}`}>
                  Visites le {d.label.toLowerCase()}
                </label>
                <input
                  id={`v-${d.key}`}
                  name={`visit_${d.key}`}
                  className="field"
                  maxLength={80}
                  defaultValue={settings.hours[d.key]?.length ? formatDayHours(settings.hours[d.key]) : ""}
                  placeholder="Pas de visite"
                />
              </div>
            ))}
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="v-duration">
                Durée d'une visite
              </label>
              <select id="v-duration" name="durationMin" className="field" defaultValue={settings.durationMin}>
                {DURATIONS.map((m) => (
                  <option key={m} value={m}>
                    {m < 60 ? `${m} minutes` : m === 60 ? "1 heure" : `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, "0")}`}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label" htmlFor="v-notice">
                Délai de prévenance
              </label>
              <select id="v-notice" name="noticeHours" className="field" defaultValue={settings.noticeHours}>
                {NOTICES.map((h) => (
                  <option key={h} value={h}>
                    {h} heures avant
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Submit>Enregistrer les visites</Submit>
            {published && settings.enabled ? (
              <Link className="link inline-flex min-h-6 items-center gap-1 text-sm" href={`/pro/${slug}/visite`} target="_blank">
                <Icon name="eye" size={16} /> Voir la page de réservation
              </Link>
            ) : null}
          </div>
        </fieldset>
      </ActionForm>
    </section>
  );
}
