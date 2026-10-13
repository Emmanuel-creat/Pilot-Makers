"use client";

import { useActionState } from "react";
import { createWebhookAction, webhookCommandAction } from "@/app/actions";
import { ActionForm } from "@/components/forms/ActionForm";
import { FormMessage, Submit } from "@/components/forms/Submit";
import { Icon } from "@/components/Icon";
import { Notice } from "@/components/ui";

type Endpoint = { id: string; url: string; events: string[]; active: boolean };
type Delivery = {
  id: string;
  event: string;
  url: string;
  attempts: number;
  delivered: boolean;
  failed: boolean;
  status: number | null;
  error: string;
  at: string;
};

/** Abonnements webhooks de l'entreprise et journal des derniers envois. */
export function Webhooks({
  endpoints,
  deliveries,
  events,
  canEdit,
}: {
  endpoints: Endpoint[];
  deliveries: Delivery[];
  events: Record<string, string>;
  canEdit: boolean;
}) {
  const [created, create] = useActionState(createWebhookAction, null);
  return (
    <div className="space-y-6">
      <section className="card space-y-3 p-4 text-sm">
        <h2 className="font-semibold">Webhooks</h2>
        <p className="text-muted">
          Pilot-Makers prévient vos autres outils (tableur, automatisation, logiciel métier) dès qu'un devis est signé, qu'une facture est payée ou
          qu'un client est créé : un envoi POST en JSON vers l'adresse HTTPS de votre choix.
        </p>
        <p className="text-muted">
          Chaque envoi porte l'en-tête <code className="font-mono">Pilot-Makers-Signature</code> (t=horodatage, v1=HMAC-SHA256 de « horodatage.corps »
          avec votre clé). En cas d'échec, l'envoi est retenté 8 fois en espaçant les essais.
        </p>
      </section>

      {canEdit ? (
        <section className="card p-4">
          <form action={create} className="space-y-3">
            <div>
              <label className="label" htmlFor="wh-url">
                Adresse de réception
              </label>
              <input id="wh-url" name="url" type="url" className="field" placeholder="https://exemple.fr/reception" required />
            </div>
            <fieldset>
              <legend className="label">Événements</legend>
              <div className="flex flex-wrap gap-4">
                {Object.entries(events).map(([k, l]) => (
                  <label key={k} className="flex items-center gap-2 text-sm">
                    <input type="checkbox" name="events" value={k} defaultChecked className="h-4 w-4" /> {l}
                  </label>
                ))}
              </div>
            </fieldset>
            <Submit className="btn-primary" pendingLabel="Enregistrement...">
              <Icon name="plus" size={16} /> Ajouter l'adresse
            </Submit>
          </form>
          {created?.ok ? (
            <div className="mt-3">
              <Notice tone="info" title="Clé de signature">
                Copiez-la maintenant, elle ne sera plus affichée : <span className="font-mono break-all select-all">{created.message}</span>
              </Notice>
            </div>
          ) : (
            <FormMessage state={created} />
          )}
        </section>
      ) : null}

      <section className="card p-4">
        <h2 className="mb-3 text-sm font-semibold">Adresses abonnées</h2>
        {endpoints.length ? (
          <ul className="divide-y divide-line">
            {endpoints.map((e) => (
              <li key={e.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                <div className="min-w-0">
                  <div className="truncate font-mono">{e.url}</div>
                  <div className="text-xs text-muted">
                    {e.events.map((k) => events[k] ?? k).join(", ")}
                    {e.active ? "" : " (suspendue)"}
                  </div>
                </div>
                {canEdit ? (
                  <ActionForm action={webhookCommandAction} className="flex flex-wrap gap-1">
                    <input type="hidden" name="id" value={e.id} />
                    <button name="command" value="test" className="btn-secondary min-h-8 py-1">
                      Tester
                    </button>
                    <button name="command" value={e.active ? "pause" : "resume"} className="btn-secondary min-h-8 py-1">
                      {e.active ? "Suspendre" : "Reprendre"}
                    </button>
                    <button name="command" value="delete" className="btn-danger min-h-8 py-1" aria-label={`Supprimer ${e.url}`}>
                      <Icon name="trash" size={16} />
                    </button>
                  </ActionForm>
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted">Aucune adresse pour l'instant.</p>
        )}
      </section>

      <section className="card p-4">
        <h2 className="mb-3 text-sm font-semibold">Derniers envois</h2>
        {deliveries.length ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="table-head">
                <tr>
                  <th className="px-3 py-2">Date</th>
                  <th className="px-3 py-2">Événement</th>
                  <th className="px-3 py-2">Résultat</th>
                  <th className="px-3 py-2 text-right">Essais</th>
                </tr>
              </thead>
              <tbody>
                {deliveries.map((d) => (
                  <tr key={d.id} className="border-b border-line last:border-0">
                    <td className="px-3 py-2 whitespace-nowrap">{d.at}</td>
                    <td className="px-3 py-2">{events[d.event] ?? (d.event === "ping" ? "Test" : d.event)}</td>
                    <td className={`px-3 py-2 ${d.delivered ? "text-success" : d.failed ? "text-danger" : "text-warning"}`}>
                      {d.delivered
                        ? `Reçu (${d.status})`
                        : d.failed
                          ? `Abandonné : ${d.error}`
                          : d.attempts
                            ? `Nouvel essai prévu : ${d.error}`
                            : "En attente"}
                    </td>
                    <td className="tabular px-3 py-2 text-right">{d.attempts}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-muted">Aucun envoi pour l'instant.</p>
        )}
      </section>
    </div>
  );
}
