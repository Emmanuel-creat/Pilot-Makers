"use client";

import { formatEuros } from "@/lib/calc/format";

export interface VariantOffer {
  name: string;
  choices: { id: string; label: string; ttcCents: number; included: boolean }[];
}

/** Variantes choisies hors celles déjà comprises dans le total : ce sont elles que le serveur reçoit. */
export function pickedVariantIds(groups: VariantOffer[], picks: Record<string, string>): string[] {
  return groups.flatMap((g) => g.choices.filter((c) => !c.included && picks[g.name] === c.id).map((c) => c.id));
}

/** Écart de prix TTC des variantes choisies par rapport à celles comprises dans le total. */
export function variantDelta(groups: VariantOffer[], picks: Record<string, string>): number {
  return groups.reduce((n, g) => {
    const base = g.choices.find((c) => c.included);
    const pick = g.choices.find((c) => c.id === picks[g.name]);
    return n + (base && pick ? pick.ttcCents - base.ttcCents : 0);
  }, 0);
}

/** Choix d'une variante par groupe (base, confort, premium), un bouton radio par alternative. */
export function VariantPicker({
  groups,
  picks,
  onPick,
  className = "space-y-1.5",
}: {
  groups: VariantOffer[];
  picks: Record<string, string>;
  onPick: (name: string, id: string) => void;
  className?: string;
}) {
  return (
    <>
      {groups.map((g) => (
        <fieldset key={g.name} className={className}>
          <legend className="label">Variante retenue : {g.name}</legend>
          {g.choices.map((c) => (
            <label key={c.id} className="flex items-start gap-2">
              <input
                type="radio"
                name={`variante-${g.name}`}
                className="mt-0.5 h-4 w-4"
                checked={(picks[g.name] ?? g.choices.find((x) => x.included)?.id) === c.id}
                onChange={() => onPick(g.name, c.id)}
              />
              <span className="flex-1">{c.label}</span>
              <span className="tabular shrink-0">{formatEuros(c.ttcCents)} TTC</span>
            </label>
          ))}
        </fieldset>
      ))}
    </>
  );
}
