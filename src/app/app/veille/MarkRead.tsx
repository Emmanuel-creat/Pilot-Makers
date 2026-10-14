"use client";

import { markWatchReadAction } from "@/app/actions";
import { ActionForm } from "@/components/forms/ActionForm";
import { Submit } from "@/components/forms/Submit";

export function MarkRead({ id, label }: { id: string; label: string }) {
  return (
    <ActionForm action={markWatchReadAction} className="inline">
      <input type="hidden" name="id" value={id} />
      <Submit className="btn-secondary">{label}</Submit>
    </ActionForm>
  );
}
