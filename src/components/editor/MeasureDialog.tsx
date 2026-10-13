"use client";

import { useState } from "react";
import { Icon } from "@/components/Icon";
import { Modal } from "@/components/Modal";
import { computeMeasure, emptyMeasure, MAX_MEASURE_ROWS, MEASURE_KINDS, type Measure, type MeasureItem, type MeasureKind } from "@/lib/calc/measure";

const blank = (): MeasureItem => ({ label: "", count: "1", a: "", b: "", c: "" });

/** Métré d'une ligne : cotes relevées, ouvertures déduites, quantité calculée et reportée sur la ligne. */
export function MeasureDialog({
  open,
  onClose,
  initial,
  lineLabel,
  onApply,
  onRemove,
}: {
  open: boolean;
  onClose: () => void;
  initial?: Measure;
  lineLabel: string;
  onApply: (m: Measure, quantity: string, unit: string) => void;
  onRemove?: () => void;
}) {
  const [m, setM] = useState<Measure>(initial ?? emptyMeasure(guessKind(lineLabel)));
  const spec = MEASURE_KINDS[m.kind];
  const r = computeMeasure(m);
  const set = (key: "items" | "deductions", i: number, patch: Partial<MeasureItem>) =>
    setM((x) => ({ ...x, [key]: x[key].map((it, j) => (j === i ? { ...it, ...patch } : it)) }));
  const add = (key: "items" | "deductions") => setM((x) => ({ ...x, [key]: [...x[key], blank()] }));
  const del = (key: "items" | "deductions", i: number) => setM((x) => ({ ...x, [key]: x[key].filter((_, j) => j !== i) }));
  const full = m.items.length + m.deductions.length >= MAX_MEASURE_ROWS;
  const dedDims = m.kind === "plinthes" ? ["Largeur"] : ["Largeur", "Hauteur"];

  return (
    <Modal open={open} onClose={onClose} title="Métré" wide>
      <div className="space-y-4 text-sm">
        <fieldset>
          <legend className="label">Que mesurez-vous ?</legend>
          <div className="flex flex-wrap gap-2">
            {(Object.keys(MEASURE_KINDS) as MeasureKind[]).map((k) => (
              <label
                key={k}
                className={`cursor-pointer rounded-md border px-3 py-1.5 ${m.kind === k ? "border-accent bg-accent-soft" : "border-line"}`}
              >
                <input
                  type="radio"
                  name="measure-kind"
                  className="sr-only"
                  checked={m.kind === k}
                  onChange={() => setM((x) => ({ ...x, kind: k }))}
                />
                <span className="font-medium">{MEASURE_KINDS[k].label}</span>
                <span className="block text-xs text-muted">{MEASURE_KINDS[k].hint}</span>
              </label>
            ))}
          </div>
        </fieldset>

        <Rows
          title="Cotes relevées (en mètres)"
          prefix="mi"
          rows={m.items}
          dims={spec.dims}
          placeholder="Pièce, pan, zone"
          onChange={(i, p) => set("items", i, p)}
          onRemove={m.items.length > 1 ? (i) => del("items", i) : undefined}
        />
        <button type="button" className="btn-ghost min-h-8 text-sm" onClick={() => add("items")} disabled={full}>
          <Icon name="plus" size={14} /> Ajouter une rangée
        </button>

        {spec.deduct ? (
          <>
            <Rows
              title={m.kind === "plinthes" ? "Portes à déduire" : "Ouvertures à déduire (portes, fenêtres)"}
              prefix="md"
              rows={m.deductions}
              dims={dedDims}
              placeholder="Porte, fenêtre"
              onChange={(i, p) => set("deductions", i, p)}
              onRemove={(i) => del("deductions", i)}
            />
            <button type="button" className="btn-ghost min-h-8 text-sm" onClick={() => add("deductions")} disabled={full}>
              <Icon name="plus" size={14} /> Ajouter une ouverture
            </button>
          </>
        ) : null}

        <div className="rounded-md border border-line bg-bg p-3" aria-live="polite">
          {r.ok ? (
            <>
              <p className="text-base font-semibold" data-testid="metre-total">
                Total : {r.quantity} {r.unit}
              </p>
              <pre className="mt-1 font-sans text-xs whitespace-pre-wrap text-muted">{r.detail.split("\n").slice(1, -1).join("\n")}</pre>
            </>
          ) : (
            <ul className="space-y-0.5 text-xs text-danger">
              {r.errors.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          )}
        </div>

        <div className="flex flex-wrap justify-between gap-2">
          {onRemove ? (
            <button type="button" className="btn-ghost text-danger" onClick={onRemove}>
              Retirer le métré
            </button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <button type="button" className="btn-secondary" onClick={onClose}>
              Annuler
            </button>
            <button type="button" className="btn-primary" disabled={!r.ok} onClick={() => onApply(m, r.quantity, r.unit)}>
              Reporter {r.ok ? `${r.quantity} ${r.unit}` : "la quantité"}
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
}

function Rows({
  title,
  prefix,
  rows,
  dims,
  placeholder,
  onChange,
  onRemove,
}: {
  title: string;
  prefix: string;
  rows: MeasureItem[];
  dims: string[];
  placeholder: string;
  onChange: (i: number, p: Partial<MeasureItem>) => void;
  onRemove?: (i: number) => void;
}) {
  const keys = ["a", "b", "c"] as const;
  if (!rows.length) return null;
  return (
    <fieldset className="space-y-2">
      <legend className="label">{title}</legend>
      {rows.map((row, i) => (
        <div key={i} className="flex flex-wrap items-end gap-2 rounded-md border border-line p-2">
          <label className="min-w-32 flex-1">
            <span className="text-xs text-muted">Désignation</span>
            <input
              className="field-sm"
              value={row.label}
              maxLength={80}
              placeholder={placeholder}
              onChange={(e) => onChange(i, { label: e.target.value })}
            />
          </label>
          <label className="w-16">
            <span className="text-xs text-muted">Nombre</span>
            <input className="field-sm text-right" inputMode="numeric" value={row.count} onChange={(e) => onChange(i, { count: e.target.value })} />
          </label>
          {dims.map((d, k) => (
            <label key={d} className="w-24">
              <span className="text-xs text-muted">{d}</span>
              <input
                id={`${prefix}-${i}-${keys[k]}`}
                className="field-sm text-right"
                inputMode="decimal"
                value={row[keys[k]] ?? ""}
                onChange={(e) => onChange(i, { [keys[k]]: e.target.value })}
                aria-label={`${d} ${i + 1}`}
              />
            </label>
          ))}
          {onRemove ? (
            <button type="button" className="btn-ghost min-h-8 px-2" onClick={() => onRemove(i)} aria-label={`Supprimer la rangée ${i + 1}`}>
              <Icon name="trash" size={14} />
            </button>
          ) : null}
        </div>
      ))}
    </fieldset>
  );
}

/** Type de métré le plus probable d'après la désignation de la ligne. */
export function guessKind(label: string): MeasureKind {
  const l = label.toLowerCase();
  if (/plinthe/.test(l)) return "plinthes";
  if (/b[ée]ton|terrassement|remblai|d[ée]blai|chape/.test(l)) return /chape/.test(l) ? "surface" : "volume";
  if (/peinture|fa[iï]ence|enduit|papier peint|murs?\b|isolation des murs|doublage/.test(l)) return "murs";
  if (/goutti[eè]re|gaine|c[aâ]ble|bordure|corniche|tuyau/.test(l)) return "lineaire";
  return "surface";
}
