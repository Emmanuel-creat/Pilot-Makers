"use client";

import { useState } from "react";
import { savePricingAction } from "@/app/actions";
import { ActionForm } from "@/components/forms/ActionForm";
import { Submit } from "@/components/forms/Submit";
import { Icon } from "@/components/Icon";
import { centsToInput, formatEuros } from "@/lib/calc/format";
import { DEFAULT_QUALIFICATIONS, LABOR_RATES_MAX, travelCostCents, type Pricing } from "@/lib/services/pricing";

type Row = { key: number; label: string; price: string; cost: string };

const money = (c: number) => (c ? centsToInput(c) : "");

export function PricingForm({ initial, canEdit }: { initial: Pricing; canEdit: boolean }) {
  const [rows, setRows] = useState<Row[]>(() =>
    (initial.laborRates.length
      ? initial.laborRates.map((r) => ({ label: r.label, price: money(r.priceCents), cost: money(r.costCents) }))
      : DEFAULT_QUALIFICATIONS.map((label) => ({ label, price: "", cost: "" }))
    ).map((r, key) => ({ ...r, key })),
  );
  const [perKm, setPerKm] = useState(money(initial.travel.perKmCents));
  const [fixed, setFixed] = useState(money(initial.travel.fixedCents));
  const [freeKm, setFreeKm] = useState(initial.travel.freeKm ? String(initial.travel.freeKm) : "");
  const cents = (v: string) => Math.round(Number(v.replace(",", ".").replace(/\s/g, "")) * 100) || 0;
  const example = travelCostCents({ perKmCents: cents(perKm), fixedCents: cents(fixed), freeKm: Number(freeKm) || 0 }, 25);
  const update = (key: number, patch: Partial<Row>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  return (
    <div className="card p-5">
      <ActionForm action={savePricingAction}>
        <fieldset disabled={!canEdit} className="space-y-6">
          <section className="space-y-3">
            <div>
              <h2 className="font-semibold">Taux horaires par qualification</h2>
              <p className="text-sm text-muted">
                Dans l'éditeur, une ligne de main-d'œuvre propose ces qualifications : le prix de l'heure et son coût interne sont remplis d'un clic.
              </p>
            </div>
            <div className="space-y-2">
              <div className="hidden grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)_auto] gap-2 text-xs text-muted sm:grid">
                <span>Qualification</span>
                <span>Prix de l'heure HT (€)</span>
                <span>Coût interne de l'heure (€)</span>
                <span className="w-8" />
              </div>
              {rows.map((r) => (
                <div key={r.key} className="grid grid-cols-2 gap-2 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)_auto]">
                  <input
                    name="rate_label"
                    className="field col-span-2 sm:col-span-1"
                    value={r.label}
                    onChange={(e) => update(r.key, { label: e.target.value })}
                    maxLength={60}
                    aria-label="Qualification"
                  />
                  <input
                    name="rate_price"
                    className="field tabular text-right"
                    inputMode="decimal"
                    value={r.price}
                    onChange={(e) => update(r.key, { price: e.target.value })}
                    placeholder="45,00"
                    aria-label={`Prix de l'heure, ${r.label}`}
                  />
                  <input
                    name="rate_cost"
                    className="field tabular text-right"
                    inputMode="decimal"
                    value={r.cost}
                    onChange={(e) => update(r.key, { cost: e.target.value })}
                    placeholder="Facultatif"
                    aria-label={`Coût interne de l'heure, ${r.label}`}
                  />
                  <button
                    type="button"
                    className="btn-ghost col-span-2 justify-self-end px-2 sm:col-span-1"
                    onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))}
                    aria-label={`Retirer ${r.label || "la qualification"}`}
                  >
                    <Icon name="trash" size={16} />
                  </button>
                </div>
              ))}
            </div>
            {rows.length < LABOR_RATES_MAX ? (
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setRows((rs) => [...rs, { key: Math.max(0, ...rs.map((x) => x.key)) + 1, label: "", price: "", cost: "" }])}
              >
                <Icon name="plus" size={16} /> Ajouter une qualification
              </button>
            ) : null}
          </section>

          <section className="space-y-3 border-t border-line pt-5">
            <div>
              <h2 className="font-semibold">Frais de déplacement</h2>
              <p className="text-sm text-muted">
                Dans l'éditeur, indiquez la distance du chantier et le nombre de déplacements : la ligne est calculée avec ce barème.
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <div>
                <label className="label" htmlFor="pr-fixed">
                  Forfait par déplacement (€ HT)
                </label>
                <input
                  id="pr-fixed"
                  name="fixed"
                  className="field tabular"
                  inputMode="decimal"
                  value={fixed}
                  onChange={(e) => setFixed(e.target.value)}
                />
              </div>
              <div>
                <label className="label" htmlFor="pr-km">
                  Prix du kilomètre (€ HT)
                </label>
                <input
                  id="pr-km"
                  name="per_km"
                  className="field tabular"
                  inputMode="decimal"
                  value={perKm}
                  onChange={(e) => setPerKm(e.target.value)}
                />
              </div>
              <div>
                <label className="label" htmlFor="pr-free">
                  Rayon sans frais kilométriques (km)
                </label>
                <input
                  id="pr-free"
                  name="free_km"
                  className="field tabular"
                  inputMode="numeric"
                  value={freeKm}
                  onChange={(e) => setFreeKm(e.target.value)}
                />
              </div>
            </div>
            <p className="text-xs text-muted">
              Exemple pour un chantier à 25 km : {formatEuros(example)} HT par déplacement (forfait, plus l'aller-retour au-delà du rayon).
            </p>
          </section>
          <div className="flex justify-end">
            <Submit>Enregistrer</Submit>
          </div>
        </fieldset>
      </ActionForm>
    </div>
  );
}
