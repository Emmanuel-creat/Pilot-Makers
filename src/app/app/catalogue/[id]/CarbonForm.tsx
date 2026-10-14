"use client";

import { useState } from "react";
import { setItemCarbonAction } from "@/app/actions";
import { ActionForm } from "@/components/forms/ActionForm";
import { Submit } from "@/components/forms/Submit";
import { CARBON_SOURCES } from "@/lib/carbon";

const kg = (grams: number) => String(grams / 1000).replace(".", ",");

/** Empreinte carbone de l'article, par unité, avec sa source. */
export function CarbonForm({
  itemId,
  unit,
  grams,
  source,
  suggestion,
}: {
  itemId: string;
  unit: string;
  grams: number | null;
  source: string | null;
  suggestion: { grams: number; label: string } | null;
}) {
  const [value, setValue] = useState(grams == null ? "" : kg(grams));
  const [src, setSrc] = useState(source ?? "fdes");
  return (
    <ActionForm action={setItemCarbonAction} className="space-y-3">
      <input type="hidden" name="itemId" value={itemId} />
      <div>
        <label className="label" htmlFor="carbon-kg">
          Kg CO2e par {unit}
        </label>
        <input
          id="carbon-kg"
          name="kg"
          className="field"
          inputMode="decimal"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Ex. : 12,5"
        />
      </div>
      <div>
        <label className="label" htmlFor="carbon-source">
          Source
        </label>
        <select id="carbon-source" name="source" className="field" value={src} onChange={(e) => setSrc(e.target.value)}>
          {Object.entries(CARBON_SOURCES).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
      </div>
      {suggestion && grams == null ? (
        <button
          type="button"
          className="btn-ghost min-h-6 px-0 text-xs"
          onClick={() => {
            setValue(kg(suggestion.grams));
            setSrc("indicatif");
          }}
        >
          Ordre de grandeur pour « {suggestion.label} » : {kg(suggestion.grams)} kg
        </button>
      ) : null}
      <Submit className="btn-secondary">Enregistrer l&apos;empreinte</Submit>
    </ActionForm>
  );
}
