"use client";

import { useActionState, useState } from "react";
import { createCalendarFeedAction, deleteCalendarFeedAction } from "@/app/actions";
import { FormMessage, Submit } from "@/components/forms/Submit";
import { Icon } from "@/components/Icon";

/** Lien d'abonnement à ajouter dans Google Agenda, Outlook ou Apple Calendrier. */
export function CalendarFeed({
  feed,
  canChooseCompany,
  canEdit,
}: {
  feed: { prefix: string; scope: "moi" | "entreprise"; lastUsed: string | null } | null;
  canChooseCompany: boolean;
  canEdit: boolean;
}) {
  const [created, create] = useActionState(createCalendarFeedAction, null);
  const [removed, remove] = useActionState(deleteCalendarFeedAction, null);
  const [copied, setCopied] = useState(false);
  const url = created?.ok ? created.message : null;
  return (
    <div className="space-y-4 text-sm">
      {url ? (
        <div className="space-y-2 rounded-md border border-success/30 bg-success-soft p-3">
          <p className="font-medium">Lien créé. Copiez-le maintenant : il ne sera plus affiché.</p>
          <p className="font-mono break-all select-all" data-testid="lien-agenda">
            {url}
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="btn-secondary min-h-9"
              onClick={() => {
                void navigator.clipboard?.writeText(url).then(() => setCopied(true));
              }}
            >
              <Icon name="copy" size={16} /> {copied ? "Copié" : "Copier le lien"}
            </button>
            <a className="btn-secondary min-h-9" href={url.replace(/^https?:/, "webcal:")}>
              <Icon name="calendar" size={16} /> Ouvrir dans l'agenda de l'appareil
            </a>
          </div>
        </div>
      ) : feed ? (
        <p>
          Lien actif ({feed.scope === "entreprise" ? "toute l'entreprise" : "mes chantiers"}), commençant par <span className="font-mono">{feed.prefix}</span>.{" "}
          {feed.lastUsed ? `Dernière lecture par l'agenda : ${feed.lastUsed}.` : "Pas encore lu par un agenda."}
        </p>
      ) : (
        <p className="text-muted">Aucun lien pour l'instant.</p>
      )}
      {canEdit ? (
        <div className="flex flex-wrap items-end gap-2">
          <form action={create} className="flex flex-wrap items-end gap-2">
            {canChooseCompany ? (
              <div>
                <label className="label" htmlFor="cal-scope">
                  Contenu
                </label>
                <select id="cal-scope" name="scope" className="field" defaultValue={feed?.scope ?? "entreprise"}>
                  <option value="entreprise">Toute l'entreprise et les échéances</option>
                  <option value="moi">Mes chantiers seulement</option>
                </select>
              </div>
            ) : (
              <input type="hidden" name="scope" value="moi" />
            )}
            <Submit className="btn-primary" pendingLabel="Création...">
              <Icon name={feed ? "refresh" : "link"} size={16} /> {feed ? "Remplacer le lien" : "Créer le lien d'abonnement"}
            </Submit>
          </form>
          {feed && !url ? (
            <form action={remove}>
              <button className="btn-ghost text-danger">Supprimer le lien</button>
            </form>
          ) : null}
        </div>
      ) : null}
      {created && !created.ok ? <FormMessage state={created} /> : null}
      <FormMessage state={removed} />
      <details>
        <summary className="cursor-pointer font-medium">Comment l'ajouter à mon agenda</summary>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-muted">
          <li>Google Agenda : sur un ordinateur, « Autres agendas », « + », « À partir de l'URL », collez le lien.</li>
          <li>Outlook : « Ajouter un calendrier », « S'abonner à partir du web », collez le lien.</li>
          <li>iPhone et Mac : touchez « Ouvrir dans l'agenda de l'appareil », ou Réglages, Calendrier, Comptes, « Ajouter un calendrier avec abonnement ».</li>
        </ul>
        <p className="mt-2 text-muted">
          L'agenda se met à jour tout seul, en général en quelques heures selon l'application. Gardez le lien pour vous : qui le connaît voit vos chantiers.
          Remplacez-le s'il a circulé.
        </p>
      </details>
    </div>
  );
}
