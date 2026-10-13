"use client";

import { replyToClientAction, requestHandledAction } from "@/app/actions";
import { ActionForm } from "@/components/forms/ActionForm";
import { Submit } from "@/components/forms/Submit";
import { Icon } from "@/components/Icon";

type Msg = {
  id: string;
  author_type: "client" | "entreprise";
  author_name: string;
  kind: "message" | "modification";
  line_label: string;
  body: string;
  handled: boolean;
  at: string;
};

/** Échanges avec le client sur ce devis : messages, demandes de modification à traiter, réponse par e-mail. */
export function ClientThread({
  quoteId,
  messages,
  canEdit,
  customerEmail,
}: {
  quoteId: string;
  messages: Msg[];
  canEdit: boolean;
  customerEmail: string;
}) {
  return (
    <div className="space-y-3 text-sm">
      {messages.length ? (
        <ol className="space-y-2">
          {messages.map((m) => (
            <li key={m.id} className={`rounded-md border p-2 ${m.author_type === "client" ? "border-line" : "border-accent/30 bg-accent-soft"}`}>
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted">
                <span className="font-medium text-ink">{m.author_type === "client" ? m.author_name || "Client" : m.author_name}</span>
                <span>{m.at}</span>
              </div>
              {m.kind === "modification" ? (
                <div className="mt-1 flex flex-wrap items-center justify-between gap-2">
                  <span className={`text-xs font-medium ${m.handled ? "text-success" : "text-warning"}`}>
                    Modification demandée : {m.line_label}
                    {m.handled ? " (traitée)" : ""}
                  </span>
                  {canEdit ? (
                    <ActionForm action={requestHandledAction} className="">
                      <input type="hidden" name="quoteId" value={quoteId} />
                      <input type="hidden" name="id" value={m.id} />
                      <input type="hidden" name="handled" value={m.handled ? "0" : "1"} />
                      <button className="btn-ghost min-h-7 px-2 text-xs">{m.handled ? "Rouvrir" : "Marquer traitée"}</button>
                    </ActionForm>
                  ) : null}
                </div>
              ) : null}
              <p className="mt-1 whitespace-pre-wrap">{m.body}</p>
            </li>
          ))}
        </ol>
      ) : (
        <p className="text-muted">Aucun échange. Le client peut écrire depuis la page du devis ou son espace client.</p>
      )}
      {canEdit ? (
        <ActionForm action={replyToClientAction} resetOnSuccess className="space-y-2">
          <input type="hidden" name="quoteId" value={quoteId} />
          <label className="label" htmlFor="reply-body">
            Répondre au client
          </label>
          <textarea id="reply-body" name="body" className="field min-h-20" maxLength={3000} required />
          <p className="text-xs text-muted">
            {customerEmail
              ? `Envoyé à ${customerEmail}, avec le lien de son espace client.`
              : "Le client n'a pas d'e-mail : la réponse sera visible sur sa page."}
          </p>
          <Submit className="btn-secondary" pendingLabel="Envoi...">
            <Icon name="send" size={16} /> Envoyer la réponse
          </Submit>
        </ActionForm>
      ) : null}
    </div>
  );
}
