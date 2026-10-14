"use client";

import { deleteCampaignAction, saveCampaignAction, sendCampaignAction } from "@/app/actions";
import { ActionForm } from "@/components/forms/ActionForm";
import { Submit } from "@/components/forms/Submit";
import type { CampaignFilters } from "@/lib/campaigns";

export function CampaignForm({ id, initial }: { id?: string; initial: { name: string; subject: string; body: string; filters: CampaignFilters } }) {
  const f = initial.filters;
  return (
    <ActionForm action={saveCampaignAction} className="space-y-4">
      {id ? <input type="hidden" name="id" value={id} /> : null}
      <div>
        <label className="label" htmlFor="cp-name">
          Nom de la campagne
        </label>
        <input id="cp-name" name="name" className="field" maxLength={120} required defaultValue={initial.name} />
      </div>
      <fieldset className="grid gap-3 sm:grid-cols-4">
        <legend className="label sm:col-span-4">Clients visés</legend>
        <div>
          <label className="label" htmlFor="cp-min">
            Dernière facture il y a au moins (mois)
          </label>
          <input id="cp-min" name="monthsMin" className="field tabular" inputMode="numeric" defaultValue={f.monthsMin ?? ""} />
        </div>
        <div>
          <label className="label" htmlFor="cp-max">
            Et au plus (mois)
          </label>
          <input id="cp-max" name="monthsMax" className="field tabular" inputMode="numeric" defaultValue={f.monthsMax ?? ""} />
        </div>
        <div>
          <label className="label" htmlFor="cp-type">
            Type de client
          </label>
          <select id="cp-type" name="type" className="field" defaultValue={f.type}>
            <option value="">Tous</option>
            <option value="particulier">Particuliers</option>
            <option value="entreprise">Entreprises</option>
            <option value="copropriete">Copropriétés</option>
            <option value="autre">Autres</option>
          </select>
        </div>
        <div>
          <label className="label" htmlFor="cp-postal">
            Code postal commençant par
          </label>
          <input id="cp-postal" name="postalPrefix" className="field tabular" inputMode="numeric" maxLength={5} defaultValue={f.postalPrefix} />
        </div>
        <div className="sm:col-span-2">
          <label className="label" htmlFor="cp-tag">
            Étiquette du client
          </label>
          <input id="cp-tag" name="tag" className="field" maxLength={40} defaultValue={f.tag} placeholder="Ex. : chaudière" />
        </div>
      </fieldset>
      <div>
        <label className="label" htmlFor="cp-subject">
          Objet
        </label>
        <input id="cp-subject" name="subject" className="field" maxLength={150} required defaultValue={initial.subject} />
      </div>
      <div>
        <label className="label" htmlFor="cp-body">
          Message
        </label>
        <textarea id="cp-body" name="body" className="field min-h-48" maxLength={5000} required defaultValue={initial.body} />
        <p className="mt-1 text-xs text-muted">
          Champs possibles : {"{prenom}"}, {"{nom}"}, {"{entreprise}"}, {"{derniers_travaux}"}. Le lien de désinscription est ajouté automatiquement.
        </p>
      </div>
      <Submit>{id ? "Enregistrer" : "Créer et prévisualiser"}</Submit>
    </ActionForm>
  );
}

export function SendCampaign({ id, count }: { id: string; count: number }) {
  return (
    <ActionForm action={sendCampaignAction} className="inline">
      <input type="hidden" name="id" value={id} />
      <Submit pendingLabel="Envoi en cours...">{`Envoyer à ${count} client${count > 1 ? "s" : ""}`}</Submit>
    </ActionForm>
  );
}

export function DeleteCampaign({ id }: { id: string }) {
  return (
    <ActionForm action={deleteCampaignAction} className="inline">
      <input type="hidden" name="id" value={id} />
      <Submit className="btn-secondary">Supprimer le brouillon</Submit>
    </ActionForm>
  );
}
