import Link from "next/link";
import { removeShowcasePhotoAction, showcaseAction } from "@/app/actions";
import { ActionForm } from "@/components/forms/ActionForm";
import { Submit } from "@/components/forms/Submit";
import { Icon } from "@/components/Icon";
import { appUrl } from "@/lib/services/mail";
import type { ShowcasePhoto, ShowcaseSettings } from "@/lib/services/showcase";

/** Réglages de la page vitrine et photos publiées. */
export function Showcase({ settings, photos, canEdit }: { settings: ShowcaseSettings; photos: ShowcasePhoto[]; canEdit: boolean }) {
  const url = appUrl(`/pro/${settings.slug}`);
  return (
    <div className="space-y-6">
      <ActionForm action={showcaseAction} className="card space-y-4 p-5">
        <p className="text-sm text-muted">
          Une page publique à partager sur vos réseaux, vos cartes de visite ou votre fiche d'établissement : présentation, coordonnées, assurance, réalisations et
          formulaire de demande de devis. Les demandes arrivent dans vos demandes entrantes.
        </p>
        <fieldset disabled={!canEdit} className="space-y-4">
          <label className="flex items-center gap-2 text-sm font-medium">
            <input type="checkbox" name="enabled" className="h-4 w-4" defaultChecked={settings.enabled} />
            Publier la page vitrine
          </label>
          <div>
            <label className="label" htmlFor="sc-slug">
              Adresse de la page
            </label>
            <div className="flex items-center gap-1 text-sm">
              <span className="shrink-0 text-muted">{appUrl("/pro/")}</span>
              <input id="sc-slug" name="slug" className="field" defaultValue={settings.slug} required pattern="[a-z0-9][a-z0-9-]{1,38}[a-z0-9]" />
            </div>
          </div>
          <div>
            <label className="label" htmlFor="sc-intro">
              Présentation
            </label>
            <textarea
              id="sc-intro"
              name="intro"
              rows={5}
              maxLength={1500}
              className="field"
              defaultValue={settings.intro}
              placeholder="Ex. : Carreleur depuis 2008, nous rénovons salles de bains et cuisines à Lyon. Devis gratuit sous 48 heures."
            />
          </div>
          <div>
            <label className="label" htmlFor="sc-area">
              Zone d'intervention
            </label>
            <input id="sc-area" name="area" maxLength={200} className="field" defaultValue={settings.area} placeholder="Ex. : Lyon et 30 km autour" />
          </div>
          <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
            <label className="flex items-center gap-2">
              <input type="checkbox" name="show_phone" className="h-4 w-4" defaultChecked={settings.show_phone} /> Afficher le téléphone
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" name="show_email" className="h-4 w-4" defaultChecked={settings.show_email} /> Afficher l'e-mail
            </label>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Submit>Enregistrer</Submit>
            {settings.enabled ? (
              <Link className="link inline-flex items-center gap-1 text-sm" href={`/pro/${settings.slug}`} target="_blank">
                <Icon name="eye" size={16} /> Voir la page : {url}
              </Link>
            ) : null}
          </div>
        </fieldset>
      </ActionForm>

      <section className="card p-5" aria-labelledby="sc-photos">
        <h2 id="sc-photos" className="font-semibold">
          Réalisations publiées
        </h2>
        <p className="mt-1 text-sm text-muted">
          Ajoutez des photos depuis le journal d'un chantier, avec l'accord du client. Elles sont publiées sans position GPS ni informations de l'appareil, et sans
          le nom du client.
        </p>
        {photos.length ? (
          <ul className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {photos.map((p) => (
              <li key={p.id} className="space-y-1 text-xs">
                <img src={`/api/journal/${p.journal_id}/photo`} alt={p.caption || "Réalisation"} className="aspect-square w-full rounded-md border border-line object-cover" />
                <div className="font-medium">{p.caption || "Sans légende"}</div>
                <div className="text-muted">{p.job_title}</div>
                {canEdit ? (
                  <form action={removeShowcasePhotoAction}>
                    <input type="hidden" name="id" value={p.id} />
                    <button className="link text-danger">Retirer de la vitrine</button>
                  </form>
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-sm text-muted">Aucune photo publiée pour l'instant.</p>
        )}
      </section>
    </div>
  );
}
