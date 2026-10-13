"use client";

import { saveAcquisitionCostsAction } from "@/app/actions";
import { ActionForm } from "@/components/forms/ActionForm";
import { Submit } from "@/components/forms/Submit";

export function CostsForm({ year, sources, values }: { year: number; sources: { key: string; label: string }[]; values: Record<string, string> }) {
  return (
    <ActionForm action={saveAcquisitionCostsAction} className="space-y-3">
      <input type="hidden" name="year" value={year} />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {sources.map((s) => (
          <div key={s.key}>
            <label className="label" htmlFor={`c-${s.key}`}>
              {s.label} (€)
            </label>
            <input id={`c-${s.key}`} name={s.key} className="field tabular" inputMode="decimal" defaultValue={values[s.key] ?? ""} placeholder="0" />
          </div>
        ))}
      </div>
      <Submit>Enregistrer les dépenses {year}</Submit>
    </ActionForm>
  );
}
