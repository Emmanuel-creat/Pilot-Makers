"use client";

import { locateAllAction } from "@/app/actions";
import { ActionForm } from "@/components/forms/ActionForm";
import { Submit } from "@/components/forms/Submit";

export function LocateButton() {
  return (
    <ActionForm action={locateAllAction} className="space-y-2">
      <Submit className="btn-secondary" pendingLabel="Localisation...">
        Localiser les adresses manquantes
      </Submit>
    </ActionForm>
  );
}
