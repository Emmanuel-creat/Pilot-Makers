"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { Icon } from "@/components/Icon";
import { formatPercent, formatUnitPrice } from "@/lib/calc/format";
import { bulkPriceAction, itemFlagsAction } from "@/app/actions";

export interface Row {
  id: string;
  reference: string;
  name: string;
  category: string;
  subcategory: string;
  unit: string;
  unit_price4: number;
  unit_cost4: number | null;
  vat_bp: number;
  favorite: boolean;
  active: boolean;
  usage_count: number;
  source: string;
  kind: string;
}

export function CatalogTable({ rows, showCosts, categories }: { rows: Row[]; showCosts: boolean; categories: Record<string, string> }) {
  const [selected, setSelected] = useState<string[]>([]);
  const [state, action, pending] = useActionState(bulkPriceAction, null);
  const all = selected.length === rows.length && rows.length > 0;
  return (
    <>
      {selected.length ? (
        <form action={action} className="card mb-3 flex flex-wrap items-center gap-3 p-3 text-sm">
          {selected.map((id) => (
            <input key={id} type="hidden" name="ids" value={id} />
          ))}
          <span>{selected.length} sélectionnée(s)</span>
          <label className="flex items-center gap-2">
            Ajuster les prix de
            <input name="percent" inputMode="decimal" placeholder="3 ou -2,5" className="field w-28 py-1" required />%
          </label>
          <button className="btn-primary min-h-9" disabled={pending}>
            Appliquer
          </button>
          <button type="button" className="link" onClick={() => setSelected([])}>
            Annuler la sélection
          </button>
          {state?.error ? <span className="text-danger">{state.error}</span> : null}
        </form>
      ) : null}
      {state?.ok && !selected.length ? <p className="mb-3 text-sm text-success">{state.message} Les devis déjà émis ne changent pas.</p> : null}
      <div className="card overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="table-head">
              <th className="w-10 px-3 py-2">
                <input
                  type="checkbox"
                  className="h-4 w-4"
                  checked={all}
                  onChange={() => setSelected(all ? [] : rows.map((r) => r.id))}
                  aria-label="Tout sélectionner"
                />
              </th>
              <th className="px-2 py-2">Prestation</th>
              <th className="px-2 py-2">Catégorie</th>
              <th className="px-2 py-2 text-right">Prix HT</th>
              {showCosts ? <th className="px-2 py-2 text-right">Coût</th> : null}
              <th className="px-2 py-2 text-right">TVA</th>
              <th className="px-2 py-2 text-right">Utilisations</th>
              <th className="w-10 px-2 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.map((r) => (
              <tr key={r.id} className={`hover:bg-surface-2 ${r.active ? "" : "opacity-60"}`}>
                <td className="px-3 py-2">
                  <input
                    type="checkbox"
                    className="h-4 w-4"
                    checked={selected.includes(r.id)}
                    onChange={() => setSelected((s) => (s.includes(r.id) ? s.filter((x) => x !== r.id) : [...s, r.id]))}
                    aria-label={`Sélectionner ${r.name}`}
                  />
                </td>
                <td className="px-2 py-2">
                  <Link href={`/app/catalogue/${r.id}`} className="font-medium hover:underline">
                    {r.name}
                  </Link>
                  <div className="text-xs text-muted">
                    {r.reference}
                    {r.kind === "ouvrage" ? <span className="ml-2 rounded bg-accent-soft px-1.5 py-0.5 text-accent">ouvrage</span> : null}
                    {r.source === "library" ? <span className="ml-2 text-warning">tarif indicatif à adapter</span> : null}
                  </div>
                </td>
                <td className="px-2 py-2 text-muted">
                  {categories[r.category] ?? r.category}
                  {r.subcategory ? ` / ${r.subcategory}` : ""}
                </td>
                <td className="tabular px-2 py-2 text-right whitespace-nowrap">
                  {formatUnitPrice(r.unit_price4)} <span className="text-muted">/ {r.unit}</span>
                </td>
                {showCosts ? <td className="tabular px-2 py-2 text-right text-muted">{r.unit_cost4 === null ? "-" : formatUnitPrice(r.unit_cost4)}</td> : null}
                <td className="tabular px-2 py-2 text-right">{formatPercent(r.vat_bp)}</td>
                <td className="tabular px-2 py-2 text-right">{r.usage_count}</td>
                <td className="px-2 py-2">
                  <form action={itemFlagsAction}>
                    <input type="hidden" name="id" value={r.id} />
                    <input type="hidden" name="favorite" value={r.favorite ? "0" : "1"} />
                    <button className="btn-ghost min-h-8 px-1.5" aria-label={r.favorite ? "Retirer des favoris" : "Ajouter aux favoris"}>
                      <Icon name="star" size={16} className={r.favorite ? "text-warning" : "text-muted"} />
                    </button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
