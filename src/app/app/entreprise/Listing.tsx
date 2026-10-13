import { listingAction, listingCheckedAction } from "@/app/actions";
import { ActionForm } from "@/components/forms/ActionForm";
import { Submit } from "@/components/forms/Submit";
import { Icon } from "@/components/Icon";
import { DAYS, formatDayHours, listingChecks, listingFields, listingText, nextReview } from "@/lib/business-listing";
import type { ListingSource } from "@/lib/business-listing";
import { LISTING_SITES } from "@/lib/services/showcase";
import { CopyButton } from "./CopyButton";

const fmt = (d: Date) => new Intl.DateTimeFormat("fr-FR", { dateStyle: "long", timeZone: "Europe/Paris" }).format(d);

/** Fiche d'établissement : informations à reporter à l'identique sur Google, PagesJaunes et les annuaires. */
export function Listing({ listing, canEdit }: { listing: ListingSource; canEdit: boolean }) {
  const fields = listingFields(listing);
  const checks = listingChecks(listing);
  const next = nextReview(listing.checkedAt);
  const rows = [...listing.links, { site: "Google", url: "" }].slice(0, 10);
  return (
    <section className="card space-y-5 p-5" aria-labelledby="fiche-titre">
      <div>
        <h2 id="fiche-titre" className="font-semibold">
          Fiche d'établissement en ligne
        </h2>
        <p className="mt-1 text-sm text-muted">
          Les clients vous trouvent souvent par votre fiche Google ou PagesJaunes. Reportez-y exactement ces informations, partout les mêmes : les moteurs de
          recherche font davantage confiance à une entreprise dont les coordonnées concordent. Elles sont aussi lues par les moteurs de recherche sur votre
          vitrine.
        </p>
      </div>

      {checks.length ? (
        <ul className="space-y-1.5 text-sm" aria-label="Points à revoir">
          {checks.map((c) => (
            <li key={c.message} className="flex items-start gap-2">
              <Icon
                name={c.level === "manque" ? "alert" : "info"}
                size={16}
                className={`mt-0.5 shrink-0 ${c.level === "manque" ? "text-danger" : "text-muted"}`}
              />
              <span>
                <span className="sr-only">{c.level === "manque" ? "À compléter : " : "Conseil : "}</span>
                {c.message}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="flex items-center gap-2 text-sm text-success">
          <Icon name="check" size={16} /> Fiche complète et vérifiée.
        </p>
      )}

      <dl className="divide-y divide-line rounded-md border border-line text-sm">
        {fields.map((f) => (
          <div key={f.key} className="flex flex-col gap-1 p-3 sm:flex-row sm:items-start">
            <dt className="shrink-0 font-medium sm:w-48">{f.label}</dt>
            <dd className="flex min-w-0 flex-1 items-start justify-between gap-3">
              <span className="min-w-0 whitespace-pre-line break-words">{f.value || <span className="text-muted">Non renseigné</span>}</span>
              {f.value ? <CopyButton text={f.value} label="Copier" className="link inline-flex shrink-0 items-center gap-1 text-xs" /> : null}
            </dd>
          </div>
        ))}
      </dl>
      <div className="flex flex-wrap gap-2">
        <CopyButton text={listingText(fields)} label="Copier toute la fiche" />
        {listing.links.map((l) => (
          <a key={l.url} className="btn-secondary min-h-9" href={l.url} target="_blank" rel="noopener noreferrer">
            <Icon name="link" size={16} /> Ouvrir ma fiche {l.site}
          </a>
        ))}
      </div>
      <p className="text-xs text-muted">
        Le nom, l'adresse, le téléphone et le site se modifient dans l'onglet Identité ; la description et la zone, dans la vitrine ci-dessus.
      </p>

      <ActionForm action={listingAction} className="space-y-4 border-t border-line pt-4">
        <fieldset disabled={!canEdit} className="space-y-4">
          <legend className="font-medium">Horaires d'ouverture</legend>
          <p className="text-sm text-muted">Par exemple : 8h-12h, 14h-18h. Laissez vide ou écrivez « fermé » pour un jour de fermeture.</p>
          <div className="grid gap-3 sm:grid-cols-2">
            {DAYS.map((d) => (
              <div key={d.key}>
                <label className="label" htmlFor={`h-${d.key}`}>
                  {d.label}
                </label>
                <input
                  id={`h-${d.key}`}
                  name={`hours_${d.key}`}
                  className="field"
                  maxLength={80}
                  defaultValue={listing.hours[d.key]?.length ? formatDayHours(listing.hours[d.key]) : ""}
                  placeholder="Fermé"
                />
              </div>
            ))}
          </div>
          <div className="space-y-2">
            <p className="font-medium">Adresses de vos fiches</p>
            {rows.map((l, i) => (
              <div key={i} className="flex flex-wrap gap-2">
                <label className="sr-only" htmlFor={`ls-${i}`}>
                  Site de la fiche {i + 1}
                </label>
                <select id={`ls-${i}`} name="link_site" className="field w-auto" defaultValue={l.site}>
                  {LISTING_SITES.map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </select>
                <label className="sr-only" htmlFor={`lu-${i}`}>
                  Adresse de la fiche {i + 1}
                </label>
                <input id={`lu-${i}`} name="link_url" type="url" className="field min-w-0 flex-1" defaultValue={l.url} placeholder="https://" />
              </div>
            ))}
          </div>
          <Submit>Enregistrer la fiche</Submit>
        </fieldset>
      </ActionForm>

      <ActionForm action={listingCheckedAction} className="flex flex-wrap items-center gap-3 border-t border-line pt-4 text-sm">
        <p className="flex-1">
          {listing.checkedAt
            ? `Dernière vérification le ${fmt(listing.checkedAt)}${next ? `, prochaine conseillée le ${fmt(next)}` : ""}.`
            : "Fiches jamais vérifiées."}{" "}
          Relisez vos fiches en ligne et corrigez ce qui diffère, puis notez-le.
        </p>
        {canEdit ? <Submit>J'ai vérifié mes fiches</Submit> : null}
      </ActionForm>
    </section>
  );
}
