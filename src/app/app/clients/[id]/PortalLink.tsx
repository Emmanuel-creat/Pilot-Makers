"use client";

import { useActionState } from "react";
import { portalLinkAction, revokePortalAction } from "@/app/actions";
import { FormMessage, Submit } from "@/components/forms/Submit";
import { Icon } from "@/components/Icon";

/** Espace client : lien personnel vers ses devis, factures et échanges. */
export function PortalLink({
  customerId,
  hasEmail,
  active,
  lastUsed,
  canEdit,
}: {
  customerId: string;
  hasEmail: boolean;
  active: number;
  lastUsed: string | null;
  canEdit: boolean;
}) {
  const [created, create] = useActionState(portalLinkAction, null);
  const [revoked, revoke] = useActionState(revokePortalAction, null);
  const url = created?.ok ? (created.message?.match(/https?:\/\/\S+/)?.[0] ?? null) : null;
  return (
    <div className="space-y-3 text-sm">
      <p className="text-muted">
        {active ? `${active} lien(s) actif(s)${lastUsed ? `, dernière visite le ${lastUsed}` : ", pas encore ouvert"}.` : "Aucun lien actif."}
      </p>
      {url ? (
        <div className="rounded-md border border-success/30 bg-success-soft p-2">
          <p className="text-xs font-medium">
            {created?.message?.startsWith("Lien envoyé") ? "Lien envoyé par e-mail :" : "Lien à transmettre au client :"}
          </p>
          <p className="font-mono text-xs break-all select-all" data-testid="lien-espace">
            {url}
          </p>
        </div>
      ) : null}
      {canEdit ? (
        <div className="flex flex-wrap gap-2">
          <form action={create}>
            <input type="hidden" name="customerId" value={customerId} />
            <input type="hidden" name="send" value={hasEmail ? "1" : "0"} />
            <Submit className="btn-secondary min-h-9" pendingLabel="...">
              <Icon name={hasEmail ? "send" : "link"} size={16} /> {hasEmail ? "Envoyer l'accès par e-mail" : "Créer un lien"}
            </Submit>
          </form>
          {hasEmail ? (
            <form action={create}>
              <input type="hidden" name="customerId" value={customerId} />
              <input type="hidden" name="send" value="0" />
              <Submit className="btn-ghost min-h-9" pendingLabel="...">
                <Icon name="link" size={16} /> Lien seul
              </Submit>
            </form>
          ) : null}
          {active ? (
            <form action={revoke}>
              <input type="hidden" name="customerId" value={customerId} />
              <button className="btn-ghost min-h-9 text-danger">Désactiver</button>
            </form>
          ) : null}
        </div>
      ) : null}
      {created && !created.ok ? <FormMessage state={created} /> : null}
      <FormMessage state={revoked} />
    </div>
  );
}
