"use client";

import { saveTravelRatesAction } from "@/app/actions";
import { ActionForm } from "@/components/forms/ActionForm";
import { Submit } from "@/components/forms/Submit";

/** Barème régional des indemnités de petits et grands déplacements, en euros par jour. */
export function TravelRatesForm({ values }: { values: Record<string, string> }) {
  const field = (name: string, label: string) => (
    <div>
      <label className="label" htmlFor={`tr-${name}`}>
        {label}
      </label>
      <input id={`tr-${name}`} name={name} className="field tabular" inputMode="decimal" defaultValue={values[name] ?? ""} placeholder="0,00" />
    </div>
  );
  return (
    <ActionForm action={saveTravelRatesAction} className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        {field("meal", "Repas, par jour en petit déplacement (€)")}
        {field("grand", "Grand déplacement, par jour (€)")}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <caption className="sr-only">Indemnités de transport et de trajet par zone</caption>
          <thead className="table-head">
            <tr>
              <th scope="col" className="px-2 py-2 text-left">
                Zone
              </th>
              <th scope="col" className="px-2 py-2 text-left">
                Transport (€ par jour)
              </th>
              <th scope="col" className="px-2 py-2 text-left">
                Trajet (€ par jour)
              </th>
            </tr>
          </thead>
          <tbody>
            {[1, 2, 3, 4, 5].map((z) => (
              <tr key={z}>
                <th scope="row" className="px-2 py-1 text-left font-normal">
                  {z} ({(z - 1) * 10} à {z * 10} km)
                </th>
                <td className="px-2 py-1">
                  <input
                    name={`transport${z}`}
                    aria-label={`Transport zone ${z}`}
                    className="field tabular"
                    inputMode="decimal"
                    defaultValue={values[`transport${z}`] ?? ""}
                    placeholder="0,00"
                  />
                </td>
                <td className="px-2 py-1">
                  <input
                    name={`trip${z}`}
                    aria-label={`Trajet zone ${z}`}
                    className="field tabular"
                    inputMode="decimal"
                    defaultValue={values[`trip${z}`] ?? ""}
                    placeholder="0,00"
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Submit>Enregistrer le barème</Submit>
    </ActionForm>
  );
}
