"use client";

import { saveBudgetAction } from "@/app/actions";
import { ActionForm } from "@/components/forms/ActionForm";
import { Submit } from "@/components/forms/Submit";

export function BudgetForm({ year, lines, values }: { year: number; lines: { key: string; label: string }[]; values: Record<string, string> }) {
  return (
    <ActionForm action={saveBudgetAction} className="space-y-3">
      <input type="hidden" name="year" value={year} />
      <div className="grid gap-3 sm:grid-cols-2">
        {lines.map((l) => (
          <div key={l.key}>
            <label className="label" htmlFor={`b-${l.key}`}>
              {l.label}, sur l&apos;année (€)
            </label>
            <input
              id={`b-${l.key}`}
              name={l.key}
              className="field tabular"
              inputMode="decimal"
              defaultValue={values[l.key] ?? ""}
              placeholder="Ex. : 180 000"
            />
          </div>
        ))}
      </div>
      <Submit>Enregistrer le budget {year}</Submit>
    </ActionForm>
  );
}
