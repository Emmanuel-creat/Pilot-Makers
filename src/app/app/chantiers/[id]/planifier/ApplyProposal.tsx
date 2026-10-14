"use client";

import { applyAutoPlanningAction } from "@/app/actions";
import { ActionForm } from "@/components/forms/ActionForm";
import { Submit } from "@/components/forms/Submit";

export function ApplyProposal({ jobId, start, end, userIds }: { jobId: string; start: string; end: string; userIds: string[] }) {
  return (
    <ActionForm action={applyAutoPlanningAction}>
      <input type="hidden" name="jobId" value={jobId} />
      <input type="hidden" name="start" value={start} />
      <input type="hidden" name="end" value={end} />
      {userIds.map((id) => (
        <input key={id} type="hidden" name="userId" value={id} />
      ))}
      <Submit>Enregistrer dans le planning</Submit>
    </ActionForm>
  );
}
