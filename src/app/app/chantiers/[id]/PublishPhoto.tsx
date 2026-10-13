"use client";

import { useActionState, useEffect, useState } from "react";
import { showcasePhotoAction } from "@/app/actions";
import { FormMessage, Submit } from "@/components/forms/Submit";
import { Icon } from "@/components/Icon";
import { Modal } from "@/components/Modal";

/** Publication d'une photo du journal dans la vitrine, avec l'accord du client. */
export function PublishPhoto({ jobId, entryId, published, defaultCaption }: { jobId: string; entryId: string; published: boolean; defaultCaption: string }) {
  const [open, setOpen] = useState(false);
  const [state, run] = useActionState(showcasePhotoAction, null);
  useEffect(() => {
    if (state?.ok) setOpen(false);
  }, [state]);
  if (published) {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-success">
        <Icon name="star" size={14} /> Dans la vitrine
      </span>
    );
  }
  return (
    <>
      <button type="button" className="link inline-flex min-h-6 items-center gap-1 text-xs" onClick={() => setOpen(true)}>
        <Icon name="star" size={14} /> Publier dans la vitrine
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title="Publier dans la vitrine">
        <form action={run} className="space-y-4 text-sm">
          <input type="hidden" name="journalId" value={entryId} />
          <input type="hidden" name="jobId" value={jobId} />
          <div>
            <label className="label" htmlFor={`pp-caption-${entryId}`}>
              Légende
            </label>
            <input id={`pp-caption-${entryId}`} name="caption" maxLength={160} className="field" defaultValue={defaultCaption.slice(0, 160)} />
          </div>
          <label className="flex items-center gap-2">
            <input type="checkbox" name="showCity" className="h-4 w-4" defaultChecked /> Indiquer la ville du chantier
          </label>
          <label className="flex items-start gap-2">
            <input type="checkbox" name="consent" className="mt-0.5 h-4 w-4" required />
            <span>Le client m'a donné son accord pour publier cette photo. Elle ne montre ni personne reconnaissable ni adresse.</span>
          </label>
          <div>
            <label className="label" htmlFor={`pp-note-${entryId}`}>
              Comment l'accord a été donné (facultatif)
            </label>
            <input id={`pp-note-${entryId}`} name="consentNote" maxLength={300} className="field" placeholder="Ex. : accord écrit au procès-verbal de réception" />
          </div>
          <FormMessage state={state} />
          <div className="flex justify-end">
            <Submit>Publier</Submit>
          </div>
        </form>
      </Modal>
    </>
  );
}
