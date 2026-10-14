"use client";

import { switchSupplierAction } from "@/app/actions";
import { ActionForm } from "@/components/forms/ActionForm";
import { Submit } from "@/components/forms/Submit";

/** Passe l'article chez le fournisseur de l'offre choisie. */
export function SwitchSupplier({ itemId, offerId, supplier }: { itemId: string; offerId: string; supplier: string }) {
  return (
    <ActionForm action={switchSupplierAction} className="inline">
      <input type="hidden" name="itemId" value={itemId} />
      <input type="hidden" name="offerId" value={offerId} />
      <Submit className="btn-secondary min-h-6 text-xs">Acheter chez {supplier}</Submit>
    </ActionForm>
  );
}
