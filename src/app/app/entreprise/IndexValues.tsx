"use client";

import { deleteIndexValueAction, saveIndexValueAction } from "@/app/actions";
import { ActionForm } from "@/components/forms/ActionForm";
import { Submit } from "@/components/forms/Submit";
import { Icon } from "@/components/Icon";
import { BT_INDEXES } from "@/lib/services/revision-labels";

const monthLabel = (m: string) => `${m.slice(5, 7)}/${m.slice(0, 4)}`;
const value = (c: number) => (c / 100).toLocaleString("fr-FR", { minimumFractionDigits: 1, maximumFractionDigits: 2 });

/** Valeurs des index BT utilisées pour réviser les prix des devis à prix révisables. */
export function IndexValues({ values, canEdit }: { values: { code: string; month: string; valueCenti: number }[]; canEdit: boolean }) {
  return (
    <section className="card mt-6 space-y-4 p-4">
      <div>
        <h2 className="font-semibold">Index BT pour la révision des prix</h2>
        <p className="text-sm text-muted">
          Saisissez les valeurs publiées chaque mois par l'INSEE (index bâtiment, base 100 en 2010) pour le mois de référence de vos devis et pour les
          mois facturés.
        </p>
      </div>
      {canEdit ? (
        <ActionForm action={saveIndexValueAction} className="flex flex-wrap items-end gap-2" resetOnSuccess>
          <div>
            <label className="label" htmlFor="idx-code">
              Index
            </label>
            <select id="idx-code" name="code" className="field">
              {Object.entries(BT_INDEXES).map(([code, label]) => (
                <option key={code} value={code}>
                  {code} {label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="idx-month">
              Mois
            </label>
            <input id="idx-month" name="month" type="month" className="field" required />
          </div>
          <div className="w-28">
            <label className="label" htmlFor="idx-value">
              Valeur
            </label>
            <input id="idx-value" name="value" inputMode="decimal" className="field" placeholder="131,2" required />
          </div>
          <Submit className="btn-secondary" pendingLabel="Enregistrement...">
            <Icon name="plus" size={16} /> Ajouter
          </Submit>
        </ActionForm>
      ) : null}
      {values.length ? (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="table-head">
              <tr>
                <th className="px-3 py-2">Index</th>
                <th className="px-3 py-2">Mois</th>
                <th className="px-3 py-2 text-right">Valeur</th>
                {canEdit ? (
                  <th className="px-3 py-2">
                    <span className="sr-only">Supprimer</span>
                  </th>
                ) : null}
              </tr>
            </thead>
            <tbody>
              {values.map((v) => (
                <tr key={`${v.code}-${v.month}`} className="border-b border-line last:border-0">
                  <td className="px-3 py-2">{v.code}</td>
                  <td className="px-3 py-2">{monthLabel(v.month)}</td>
                  <td className="tabular px-3 py-2 text-right">{value(v.valueCenti)}</td>
                  {canEdit ? (
                    <td className="px-3 py-2 text-right">
                      <ActionForm action={deleteIndexValueAction} className="inline">
                        <input type="hidden" name="code" value={v.code} />
                        <input type="hidden" name="month" value={v.month} />
                        <button className="btn-ghost px-2" aria-label={`Supprimer ${v.code} ${monthLabel(v.month)}`}>
                          <Icon name="trash" size={16} />
                        </button>
                      </ActionForm>
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="text-sm text-muted">Aucune valeur saisie pour l'instant.</p>
      )}
    </section>
  );
}
