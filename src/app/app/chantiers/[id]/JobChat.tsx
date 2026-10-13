"use client";

import { postJobMessageAction } from "@/app/actions";
import { ActionForm } from "@/components/forms/ActionForm";
import { Submit } from "@/components/forms/Submit";

export function JobMessageForm({ jobId }: { jobId: string }) {
  return (
    <ActionForm action={postJobMessageAction} className="space-y-2" resetOnSuccess>
      <input type="hidden" name="jobId" value={jobId} />
      <label className="label" htmlFor="job-message">
        Message à l&apos;équipe
      </label>
      <textarea
        id="job-message"
        name="body"
        className="field min-h-20"
        maxLength={2000}
        required
        placeholder="Ex. : livraison du carrelage demain 8 h, prévoir de dégager le garage."
      />
      <Submit>Envoyer</Submit>
    </ActionForm>
  );
}
