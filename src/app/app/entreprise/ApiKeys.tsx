"use client";

import { useActionState } from "react";
import { createApiKeyAction, revokeApiKeyAction } from "@/app/actions";
import { ActionForm } from "@/components/forms/ActionForm";
import { FormMessage, Submit } from "@/components/forms/Submit";
import { Icon } from "@/components/Icon";
import { Notice } from "@/components/ui";

type Key = { id: string; name: string; prefix: string; write: boolean; createdBy: string; createdAt: string; lastUsed: string; revoked: boolean };
type Endpoint = { method: string; path: string; summary: string };

/** Clés d'accès à l'API publique et liste des adresses disponibles. */
export function ApiKeys({ keys, endpoints, canEdit }: { keys: Key[]; endpoints: Endpoint[]; canEdit: boolean }) {
  const [created, create] = useActionState(createApiKeyAction, null);
  return (
    <div className="space-y-6">
      <section className="card space-y-3 p-4 text-sm">
        <h2 className="font-semibold">API publique</h2>
        <p className="text-muted">
          Reliez Pilot-Makers à vos autres logiciels : comptabilité, tableur, outil d'automatisation ou application maison. Chaque requête porte
          l'en-tête <code className="font-mono">Authorization: Bearer</code> suivi de la clé.
        </p>
        <p className="text-muted">
          Une clé agit au nom de l'administrateur qui l'a créée et cesse de fonctionner s'il quitte l'entreprise. Limite : 120 requêtes par minute et
          par clé. Description complète au format OpenAPI :{" "}
          <a href="/api/v1/openapi.json" className="link">
            /api/v1/openapi.json
          </a>
          .
        </p>
      </section>

      {canEdit ? (
        <section className="card p-4">
          <form action={create} className="grid gap-3 sm:grid-cols-[1fr_auto_auto] sm:items-end">
            <div>
              <label className="label" htmlFor="key-name">
                Nom de la clé
              </label>
              <input id="key-name" name="name" className="field" placeholder="Comptabilité, tableur..." maxLength={80} required />
            </div>
            <div>
              <label className="label" htmlFor="key-scope">
                Droits
              </label>
              <select id="key-scope" name="scope" className="field" defaultValue="read">
                <option value="read">Lecture</option>
                <option value="write">Lecture et écriture</option>
              </select>
            </div>
            <Submit className="btn-primary" pendingLabel="Création...">
              <Icon name="plus" size={16} /> Créer la clé
            </Submit>
          </form>
          {created?.ok ? (
            <div className="mt-3">
              <Notice tone="info" title="Nouvelle clé">
                Copiez-la maintenant, elle ne sera plus affichée : <span className="font-mono break-all select-all">{created.message}</span>
              </Notice>
            </div>
          ) : (
            <FormMessage state={created} />
          )}
        </section>
      ) : null}

      <section className="card p-4">
        <h2 className="mb-3 text-sm font-semibold">Clés</h2>
        {keys.length ? (
          <ul className="divide-y divide-line">
            {keys.map((k) => (
              <li key={k.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                <div className="min-w-0">
                  <div className={k.revoked ? "text-muted line-through" : "font-medium"}>{k.name}</div>
                  <div className="text-xs text-muted">
                    <span className="font-mono">{k.prefix}...</span> · {k.write ? "Lecture et écriture" : "Lecture"} · créée le {k.createdAt}
                    {k.createdBy ? ` par ${k.createdBy}` : ""} ·{" "}
                    {k.revoked ? "révoquée" : k.lastUsed ? `utilisée le ${k.lastUsed}` : "jamais utilisée"}
                  </div>
                </div>
                {canEdit && !k.revoked ? (
                  <ActionForm action={revokeApiKeyAction} className="">
                    <input type="hidden" name="id" value={k.id} />
                    <button className="btn-danger min-h-8 py-1" aria-label={`Révoquer la clé ${k.name}`}>
                      Révoquer
                    </button>
                  </ActionForm>
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted">Aucune clé pour l'instant.</p>
        )}
      </section>

      <section className="card space-y-3 p-4 text-sm">
        <h2 className="font-semibold">Outils d'automatisation : Zapier, Make, n8n</h2>
        <p className="text-muted">
          Ces outils s'abonnent eux-mêmes aux événements (devis signé, facture payée, client créé) avec une clé en lecture et écriture, puis se
          désabonnent quand vous arrêtez le scénario. Leurs abonnements apparaissent dans l'onglet Webhooks et disparaissent si la clé est révoquée.
        </p>
        <ul className="list-disc space-y-1 pl-5 text-muted">
          <li>
            Abonnement : <code className="font-mono">POST /api/v1/webhooks</code> avec <code className="font-mono">target_url</code> et{" "}
            <code className="font-mono">event</code> ; désabonnement : <code className="font-mono">DELETE /api/v1/webhooks/&#123;id&#125;</code>.
          </li>
          <li>
            Exemples de données pour préparer un scénario : <code className="font-mono">GET /api/v1/webhooks/samples</code>.
          </li>
          <li>Make et n8n : module « HTTP » avec l'en-tête Authorization, ou module « Webhook » relié à l'onglet Webhooks.</li>
        </ul>
      </section>

      <section className="card p-4">
        <h2 className="mb-3 text-sm font-semibold">Adresses disponibles</h2>
        <div className="overflow-x-auto" tabIndex={0} role="region" aria-label="Adresses de l'API">
          <table className="w-full text-sm">
            <thead className="table-head">
              <tr>
                <th className="px-3 py-2">Méthode</th>
                <th className="px-3 py-2">Adresse</th>
                <th className="px-3 py-2">Rôle</th>
              </tr>
            </thead>
            <tbody>
              {endpoints.map((e) => (
                <tr key={e.method + e.path} className="border-b border-line last:border-0">
                  <td className="px-3 py-2 font-mono">{e.method}</td>
                  <td className="px-3 py-2 font-mono whitespace-nowrap">{e.path}</td>
                  <td className="px-3 py-2">{e.summary}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
