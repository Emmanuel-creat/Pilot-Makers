/** Conversion d'un brouillon de devis vers l'entrée du moteur de calcul (partagée navigateur et serveur). */

import type { CalcInput } from "./engine";
import type { QuoteDraft } from "@/lib/services/quote-types";
import { applyVariants } from "./variants";

export function draftToCalcInput(d: Pick<QuoteDraft, "sections" | "globalDiscount">, vatExempt: boolean): CalcInput {
  return {
    vatExempt,
    globalDiscountPercent: d.globalDiscount,
    sections: applyVariants(d.sections).map((s) => ({
      id: s.id,
      title: s.title,
      lines: s.lines.map((l) => ({
        id: l.id,
        kind: l.kind,
        label: l.label,
        quantity: l.quantity,
        unitPrice: l.unitPrice,
        unitCost: l.unitCost,
        discountPercent: l.discountPercent,
        vatPercent: l.vatPercent,
        nature: l.nature,
        ...(l.optional && l.kind === "item" ? { optional: true } : {}),
        ...(l.signed ? { signed: true } : {}),
      })),
    })),
  };
}
