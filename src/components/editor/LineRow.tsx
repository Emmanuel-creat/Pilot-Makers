"use client";

import { useState } from "react";
import { Icon } from "@/components/Icon";
import { formatEuros } from "@/lib/calc/format";
import type { CalcIssue, CalcLineResult } from "@/lib/calc/engine";
import type { DraftLine } from "@/lib/services/quote-types";
import { coefficientLabel, laborPatch, priceFromCost, rateForPrice, withWaste, type LaborRate } from "@/lib/services/pricing";

export const UNITS = ["u", "h", "j", "m²", "m³", "ml", "m", "kg", "t", "l", "forfait", "lot", "ens", "sac"];
export const VAT_OPTIONS = ["20", "10", "5,5", "2,1", "0"];
export const NATURES: Record<string, string> = {
  main_oeuvre: "Main-d'œuvre",
  materiau: "Matériau",
  deplacement: "Déplacement",
  sous_traitance: "Sous-traitance",
  forfait: "Forfait",
  autre: "Autre",
};

interface Props {
  line: DraftLine;
  result?: CalcLineResult;
  issues: CalcIssue[];
  showCosts: boolean;
  /** Qualifications proposées sur une ligne de main-d'oeuvre */
  laborRates?: LaborRate[];
  /** Coefficient de vente de la famille de la ligne (dix-millièmes), 0 si aucun */
  coefficient?: number;
  vatExempt: boolean;
  readOnly: boolean;
  onChange: (patch: Partial<DraftLine>) => void;
  onRemove: () => void;
  onDuplicate: () => void;
  onMove: (dir: -1 | 1) => void;
  onSaveToCatalog: () => void;
  dragHandlers: {
    draggable: boolean;
    onDragStart: (e: React.DragEvent) => void;
    onDragOver: (e: React.DragEvent) => void;
    onDrop: (e: React.DragEvent) => void;
    onDragEnd: () => void;
  };
  dragOver: boolean;
}

export function LineRow({ line, result, issues, showCosts, laborRates = [], coefficient = 0, vatExempt, readOnly, onChange, onRemove, onDuplicate, onMove, onSaveToCatalog, dragHandlers, dragOver }: Props) {
  const [showDesc, setShowDesc] = useState(!!line.description);
  const [showNote, setShowNote] = useState(!!line.internalNote);
  const err = (field: string) => issues.find((i) => i.field === field && i.blocking)?.message;
  const fieldCls = (field: string) => `field-xs tabular ${err(field) ? "border-danger! bg-danger-soft" : ""}`;

  if (line.kind === "note") {
    return (
      <div className={`group flex items-start gap-2 rounded-md border border-dashed border-line px-2 py-2 ${dragOver ? "ring-2 ring-accent" : ""}`} {...dragHandlers}>
        <Handle />
        <Icon name="note" size={16} className="mt-1.5 text-muted" />
        <textarea
          value={line.label}
          onChange={(e) => onChange({ label: e.target.value })}
          rows={1}
          placeholder="Note technique non chiffrée (visible sur le devis)"
          className="field-sm min-h-8 flex-1 resize-y text-sm italic"
          disabled={readOnly}
          aria-label="Note"
        />
        <LineMenu onRemove={onRemove} onDuplicate={onDuplicate} onMove={onMove} readOnly={readOnly} />
      </div>
    );
  }

  const pending = line.kind === "pending";
  const optional = line.kind === "item" && line.optional === true;
  const suggested = coefficient ? priceFromCost(line.unitCost, coefficient) : null;
  const wasted = line.kind === "item" && line.wastePercent ? withWaste(line.quantity, line.wastePercent) : null;
  return (
    <div
      className={`group rounded-md border px-2 py-2 ${pending ? "border-warning/50 bg-warning-soft/40" : optional ? "border-dashed border-accent/50 bg-accent-soft/40" : "border-line bg-surface"} ${dragOver ? "ring-2 ring-accent" : ""}`}
      {...dragHandlers}
    >
      <div className="flex items-start gap-2">
        <Handle />
        <div className="min-w-0 flex-1">
          <input
            value={line.label}
            onChange={(e) => onChange({ label: e.target.value })}
            placeholder={pending ? "Prestation à compléter" : "Désignation de la prestation"}
            className={`field-sm ${err("label") ? "border-danger! bg-danger-soft" : ""} font-medium`}
            disabled={readOnly}
            aria-label="Désignation"
          />
          <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 px-1.5 text-xs text-muted">
            {optional ? <span className="rounded bg-accent px-1.5 py-0.5 font-medium text-white dark:text-[#0d1520]">Option, hors total</span> : null}
            <select
              value={line.nature}
              onChange={(e) => onChange({ nature: e.target.value as DraftLine["nature"] })}
              className="bg-transparent text-xs hover:text-ink"
              disabled={readOnly}
              aria-label="Nature"
            >
              {Object.entries(NATURES).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
            {line.nature === "main_oeuvre" && laborRates.length ? (
              <select
                value={String(rateForPrice(laborRates, line.unitPrice))}
                onChange={(e) => {
                  const rate = laborRates[Number(e.target.value)];
                  if (rate) onChange(laborPatch(rate));
                }}
                className="bg-transparent text-xs hover:text-ink"
                disabled={readOnly}
                aria-label="Qualification"
              >
                <option value="-1">Qualification</option>
                {laborRates.map((r, i) => (
                  <option key={i} value={i}>
                    {r.label} ({formatEuros(r.priceCents)}/h)
                  </option>
                ))}
              </select>
            ) : null}
            <button type="button" className="hover:text-ink" onClick={() => setShowDesc((s) => !s)}>
              {showDesc ? "Masquer la description" : line.description ? "Description" : "Ajouter une description"}
            </button>
            {pending ? <span className="font-medium text-warning">À compléter avant émission</span> : null}
            {line.catalogItemId ? <span title="Issue du catalogue">Catalogue</span> : null}
          </div>
          <div className="mt-2 grid grid-cols-3 gap-x-2 gap-y-2 px-1.5 sm:grid-cols-[repeat(5,minmax(0,1fr))_minmax(0,1.3fr)]">
            <Labeled label="Quantité" error={err("quantity")}>
              <input value={line.quantity} onChange={(e) => onChange({ quantity: e.target.value })} inputMode="decimal" className={`${fieldCls("quantity")} text-right`} disabled={readOnly} aria-label="Quantité" />
            </Labeled>
            <Labeled label="Unité">
              <input value={line.unit} onChange={(e) => onChange({ unit: e.target.value })} list="units" className="field-xs" disabled={readOnly} aria-label="Unité" />
            </Labeled>
            <Labeled label="Prix unit. HT" error={err("unitPrice")}>
              <input value={line.unitPrice} onChange={(e) => onChange({ unitPrice: e.target.value })} inputMode="decimal" className={`${fieldCls("unitPrice")} text-right`} disabled={readOnly} aria-label="Prix unitaire HT" />
            </Labeled>
            <Labeled label="Remise %" error={err("discountPercent")}>
              <input value={line.discountPercent} onChange={(e) => onChange({ discountPercent: e.target.value })} inputMode="decimal" placeholder="0" className={`${fieldCls("discountPercent")} text-right`} disabled={readOnly} aria-label="Remise en pourcentage" />
            </Labeled>
            <Labeled label="TVA" error={err("vatPercent")}>
              {vatExempt ? (
                <span className="block py-1 text-sm text-muted">Franchise</span>
              ) : (
                <select value={line.vatPercent} onChange={(e) => onChange({ vatPercent: e.target.value })} className={fieldCls("vatPercent")} disabled={readOnly} aria-label="Taux de TVA">
                  <option value="">Choisir</option>
                  {VAT_OPTIONS.map((v) => (
                    <option key={v} value={v}>
                      {v} %
                    </option>
                  ))}
                  {line.vatPercent && !VAT_OPTIONS.includes(line.vatPercent) ? <option value={line.vatPercent}>{line.vatPercent} %</option> : null}
                </select>
              )}
            </Labeled>
            <Labeled label="Total HT">
              <div className="tabular py-1 text-right font-semibold whitespace-nowrap">{pending ? <span className="text-warning">-</span> : formatEuros(result?.netCents ?? 0)}</div>
            </Labeled>
          </div>
          {wasted && !readOnly ? (
            <p className="mt-1.5 px-1.5 text-xs text-muted">
              Chutes conseillées : {line.wastePercent} %.{" "}
              <button
                type="button"
                className="link"
                onClick={() =>
                  onChange({
                    quantity: wasted,
                    wastePercent: "",
                    internalNote: [line.internalNote, `Quantité mesurée ${line.quantity} ${line.unit}, chutes de ${line.wastePercent} % ajoutées.`]
                      .filter(Boolean)
                      .join("\n"),
                  })
                }
              >
                Passer à {wasted} {line.unit} avec les chutes
              </button>
            </p>
          ) : null}
          {showDesc ? (
            <textarea
              value={line.description}
              onChange={(e) => onChange({ description: e.target.value })}
              rows={2}
              placeholder="Description détaillée visible sur le devis"
              className="field-sm mt-1 w-full resize-y text-sm"
              disabled={readOnly}
              aria-label="Description"
            />
          ) : null}
          {showNote || line.internalNote ? (
            <label className="mt-1.5 flex items-start gap-1.5 rounded border border-dashed border-warning/50 bg-warning-soft px-2 py-1 text-xs">
              <Icon name="lock" size={12} className="mt-1.5 shrink-0 text-warning" />
              <span className="sr-only">Commentaire interne</span>
              <textarea
                value={line.internalNote ?? ""}
                onChange={(e) => onChange({ internalNote: e.target.value })}
                rows={1}
                maxLength={1000}
                placeholder="Commentaire interne : jamais visible par le client ni imprimé"
                className="field-sm min-h-7 flex-1 resize-y bg-transparent text-xs"
                disabled={readOnly}
              />
            </label>
          ) : null}
          {showCosts || line.estimated ? (
            <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 rounded bg-surface-2 px-2 py-1 text-xs">
              {showCosts ? (
                <label className="flex items-center gap-1.5">
                  <Icon name="lock" size={12} className="text-muted" />
                  Coût unitaire interne HT
                  <input
                    value={line.unitCost}
                    onChange={(e) => onChange({ unitCost: e.target.value })}
                    inputMode="decimal"
                    className={`${fieldCls("unitCost")} w-28! text-right`}
                    disabled={readOnly}
                  />
                  {result?.costCents !== null && result?.costCents !== undefined ? <span className="text-muted">soit {formatEuros(result.costCents)}</span> : null}
                </label>
              ) : null}
              {showCosts && suggested && !readOnly ? (
                <button type="button" className="link" onClick={() => onChange({ unitPrice: suggested })}>
                  Prix = coût x {coefficientLabel(coefficient)}, soit {suggested} €
                </button>
              ) : null}
              {line.estimated ? (
                <span className="flex items-center gap-1.5 text-warning">
                  <Icon name="alert" size={12} />
                  Estimation{line.estimateNote ? " : " + line.estimateNote : ""}
                  {!readOnly ? (
                    <button type="button" className="link ml-1" onClick={() => onChange({ estimated: false, estimateNote: "" })}>
                      J'ai vérifié
                    </button>
                  ) : null}
                </span>
              ) : null}
            </div>
          ) : null}
        </div>
        <LineMenu onRemove={onRemove} onDuplicate={onDuplicate} onMove={onMove} readOnly={readOnly} onSaveToCatalog={!line.catalogItemId && line.kind === "item" ? onSaveToCatalog : undefined} onMarkPending={pending ? () => onChange({ kind: "item" }) : undefined} onAddNote={showNote || line.internalNote ? undefined : () => setShowNote(true)} onToggleOptional={line.kind === "item" ? () => onChange({ optional: !optional }) : undefined} optional={optional} />
      </div>
    </div>
  );
}

function Labeled({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return (
    <div title={error}>
      <span className="mb-0.5 block text-[11px] text-muted">{label}</span>
      {children}
    </div>
  );
}

function Handle() {
  return (
    <span className="mt-1.5 hidden cursor-grab text-muted opacity-40 group-hover:opacity-100 md:block" aria-hidden="true">
      <Icon name="grip" size={16} />
    </span>
  );
}

function LineMenu({
  onRemove,
  onDuplicate,
  onMove,
  readOnly,
  onSaveToCatalog,
  onMarkPending,
  onAddNote,
  onToggleOptional,
  optional = false,
}: {
  onRemove: () => void;
  onDuplicate: () => void;
  onMove: (dir: -1 | 1) => void;
  readOnly: boolean;
  onSaveToCatalog?: () => void;
  onMarkPending?: () => void;
  onAddNote?: () => void;
  onToggleOptional?: () => void;
  optional?: boolean;
}) {
  const [open, setOpen] = useState(false);
  if (readOnly) return null;
  return (
    <div className="relative shrink-0">
      <button type="button" className="btn-ghost min-h-8 px-1.5" onClick={() => setOpen((o) => !o)} aria-label="Actions de la ligne" aria-expanded={open}>
        <Icon name="more" />
      </button>
      {open ? (
        <div className="absolute right-0 z-20 mt-1 w-56 rounded-md border border-line bg-surface py-1 text-sm shadow-lg" onMouseLeave={() => setOpen(false)}>
          {onMarkPending ? (
            <MenuItem icon="check" label="Chiffrer cette ligne" onClick={() => (onMarkPending(), setOpen(false))} />
          ) : null}
          <MenuItem icon="up" label="Monter" onClick={() => (onMove(-1), setOpen(false))} />
          <MenuItem icon="down" label="Descendre" onClick={() => (onMove(1), setOpen(false))} />
          <MenuItem icon="copy" label="Dupliquer" onClick={() => (onDuplicate(), setOpen(false))} />
          {onToggleOptional ? (
            <MenuItem icon="check" label={optional ? "Inclure dans le total" : "Proposer en option"} onClick={() => (onToggleOptional(), setOpen(false))} />
          ) : null}
          {onAddNote ? <MenuItem icon="lock" label="Ajouter un commentaire interne" onClick={() => (onAddNote(), setOpen(false))} /> : null}
          {onSaveToCatalog ? <MenuItem icon="box" label="Enregistrer dans le catalogue" onClick={() => (onSaveToCatalog(), setOpen(false))} /> : null}
          <MenuItem icon="trash" label="Supprimer" danger onClick={() => (onRemove(), setOpen(false))} />
        </div>
      ) : null}
    </div>
  );
}

function MenuItem({ icon, label, onClick, danger = false }: { icon: string; label: string; onClick: () => void; danger?: boolean }) {
  return (
    <button type="button" onClick={onClick} className={`flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-surface-2 ${danger ? "text-danger" : ""}`}>
      <Icon name={icon} size={16} />
      {label}
    </button>
  );
}
