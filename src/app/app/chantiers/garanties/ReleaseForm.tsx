"use client";

import { releaseRetentionAction } from "@/app/actions";
import { ActionForm } from "@/components/forms/ActionForm";
import { Submit } from "@/components/forms/Submit";
import { Icon } from "@/components/Icon";

export function ReleaseRetentionForm({ jobId, title }: { jobId: string; title: string }) {
  return (
    <ActionForm action={releaseRetentionAction} className="flex flex-wrap items-end gap-2">
      <input type="hidden" name="jobId" value={jobId} />
      <input
        name="note"
        className="field min-w-40 flex-1"
        placeholder="Virement reçu, caution bancaire (facultatif)"
        aria-label={`Comment la retenue a été rendue : ${title}`}
      />
      <Submit className="btn-secondary" pendingLabel="Enregistrement...">
        <Icon name="check" size={16} /> Marquer comme libérée
      </Submit>
    </ActionForm>
  );
}
