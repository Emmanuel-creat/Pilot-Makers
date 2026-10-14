"use client";

import { applyCostCorrectionAction } from "@/app/actions";
import { ActionForm } from "@/components/forms/ActionForm";
import { Submit } from "@/components/forms/Submit";

/** Applique au catalogue le coût constaté sur les chantiers, avec ou sans ajustement du prix de vente. */
export function ApplyCorrection({ itemId }: { itemId: string }) {
  return (
    <ActionForm action={applyCostCorrectionAction} className="flex flex-wrap items-center gap-3">
      <input type="hidden" name="itemId" value={itemId} />
      <label className="flex min-h-6 items-center gap-2 text-xs">
        <input type="checkbox" name="keepMargin" value="1" className="h-4 w-4" defaultChecked />
        Garder le même taux de marge
      </label>
      <Submit className="btn-secondary">Appliquer le coût constaté</Submit>
    </ActionForm>
  );
}
