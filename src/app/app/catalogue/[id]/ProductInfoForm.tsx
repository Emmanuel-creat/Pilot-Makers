"use client";

import { saveProductInfoAction } from "@/app/actions";
import { ActionForm } from "@/components/forms/ActionForm";
import { Submit } from "@/components/forms/Submit";
import type { ProductInfo } from "@/lib/product-info";

/** Marque, performances, certifications, garantie et délai d'approvisionnement de l'article. */
export function ProductInfoForm({ itemId, info }: { itemId: string; info: ProductInfo }) {
  return (
    <ActionForm action={saveProductInfoAction} className="space-y-3">
      <input type="hidden" name="itemId" value={itemId} />
      <div>
        <label className="label" htmlFor="pi-brand">
          Marque et modèle
        </label>
        <input id="pi-brand" name="brand" className="field" maxLength={80} defaultValue={info.brand} />
      </div>
      <div>
        <label className="label" htmlFor="pi-perf">
          Performances
        </label>
        <input
          id="pi-perf"
          name="performance"
          className="field"
          maxLength={300}
          defaultValue={info.performance}
          placeholder="Ex. : R = 3,15 m².K/W, classement U4P3"
        />
      </div>
      <div>
        <label className="label" htmlFor="pi-cert">
          Certifications et labels
        </label>
        <input id="pi-cert" name="certifications" className="field" maxLength={200} defaultValue={info.certifications} placeholder="Ex. : NF, ACERMI, CE" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label" htmlFor="pi-warranty">
            Garantie (ans)
          </label>
          <input id="pi-warranty" name="warrantyYears" className="field tabular" inputMode="numeric" defaultValue={info.warrantyYears ?? ""} />
        </div>
        <div>
          <label className="label" htmlFor="pi-lead">
            Délai (jours)
          </label>
          <input id="pi-lead" name="leadDays" className="field tabular" inputMode="numeric" defaultValue={info.leadDays ?? ""} />
        </div>
      </div>
      <Submit className="btn-secondary">Enregistrer la fiche</Submit>
    </ActionForm>
  );
}
