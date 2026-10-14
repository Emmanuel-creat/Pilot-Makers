"use client";

import { saveYearEndAction } from "@/app/actions";
import { ActionForm } from "@/components/forms/ActionForm";
import { Submit } from "@/components/forms/Submit";

export interface CheckRow {
  id: string;
  label: string;
  hint: string;
  amount: string;
  done: boolean;
  note: string;
}

export function YearEndForm({ year, rows, readOnly }: { year: number; rows: CheckRow[]; readOnly: boolean }) {
  return (
    <ActionForm action={saveYearEndAction} className="space-y-4">
      <input type="hidden" name="year" value={year} />
      <ul className="divide-y divide-line">
        {rows.map((r) => (
          <li key={r.id} className="grid gap-2 py-3 sm:grid-cols-[minmax(0,1fr)_9rem]">
            <div className="min-w-0 space-y-1">
              <label className="flex items-start gap-2 font-medium">
                <input type="checkbox" name="done" value={r.id} defaultChecked={r.done} disabled={readOnly} className="mt-1" />
                {r.label}
              </label>
              <p className="pl-6 text-sm text-muted">{r.hint}</p>
              <div className="pl-6">
                <label className="sr-only" htmlFor={`ye-${r.id}`}>
                  Commentaire : {r.label}
                </label>
                <input
                  id={`ye-${r.id}`}
                  name={`note_${r.id}`}
                  className="field"
                  maxLength={500}
                  defaultValue={r.note}
                  readOnly={readOnly}
                  placeholder="Commentaire pour l'expert-comptable"
                />
              </div>
            </div>
            <p className="text-right font-medium tabular sm:pt-0.5">{r.amount}</p>
          </li>
        ))}
      </ul>
      {readOnly ? null : <Submit>Enregistrer</Submit>}
    </ActionForm>
  );
}
