"use client";

import { requestReviewAction, reviewModerationAction } from "@/app/actions";
import { ActionForm } from "@/components/forms/ActionForm";
import { Submit } from "@/components/forms/Submit";

export function RequestReviewForm({ jobId, canEmail, again }: { jobId: string; canEmail: boolean; again: boolean }) {
  return (
    <ActionForm action={requestReviewAction} className="space-y-2">
      <input type="hidden" name="jobId" value={jobId} />
      {canEmail ? (
        <label className="flex min-h-6 items-center gap-2 text-sm">
          <input type="checkbox" name="send" defaultChecked /> Envoyer l&apos;invitation par e-mail au client
        </label>
      ) : (
        <p className="text-xs text-muted">Le client n&apos;a pas d&apos;adresse e-mail : transmettez-lui le lien par SMS ou de vive voix.</p>
      )}
      <Submit>{again ? "Renvoyer une invitation" : "Demander un avis au client"}</Submit>
    </ActionForm>
  );
}

export function HideReviewForm({ id, reasons }: { id: string; reasons: [string, string][] }) {
  return (
    <ActionForm action={reviewModerationAction} className="flex flex-wrap items-end gap-2">
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="op" value="hide" />
      <div>
        <label className="label" htmlFor={`hide-${id}`}>
          Motif pour masquer
        </label>
        <select id={`hide-${id}`} name="reason" className="field">
          {reasons.map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
      </div>
      <Submit>Masquer</Submit>
    </ActionForm>
  );
}

export function ShowReviewForm({ id }: { id: string }) {
  return (
    <ActionForm action={reviewModerationAction}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="op" value="show" />
      <Submit>Rétablir l&apos;avis</Submit>
    </ActionForm>
  );
}

export function ReplyReviewForm({ id, reply }: { id: string; reply: string }) {
  return (
    <ActionForm action={reviewModerationAction} className="space-y-2">
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="op" value="reply" />
      <label className="label" htmlFor={`reply-${id}`}>
        Votre réponse publique
      </label>
      <textarea id={`reply-${id}`} name="reply" className="field min-h-16" maxLength={1000} defaultValue={reply} />
      <Submit>Enregistrer la réponse</Submit>
    </ActionForm>
  );
}
