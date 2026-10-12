"use client";

import { useEffect, useMemo, useState } from "react";
import { Icon } from "@/components/Icon";
import { fuzzyFilter } from "@/lib/fuzzy";
import { Modal } from "@/components/Modal";
import { formatPercent, formatUnitPrice } from "@/lib/calc/format";
import type { CatalogItem } from "@/lib/services/catalog";
import { apiFetch } from "./api";

const CATS: Record<string, string> = {
  "": "Toutes",
  main_oeuvre: "Main-d'œuvre",
  materiau: "Matériaux",
  deplacement: "Déplacement",
  sous_traitance: "Sous-traitance",
  forfait: "Forfaits",
  autre: "Autres",
};

export function CatalogPicker({ open, onClose, onPick }: { open: boolean; onClose: () => void; onPick: (items: CatalogItem[]) => void }) {
  const [items, setItems] = useState<CatalogItem[] | null>(null);
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open || items) return;
    apiFetch<{ items: CatalogItem[] }>("/api/catalog-items?sort=usage&limit=2000")
      .then((r) => setItems(r.items))
      .catch((e) => setError(e.message));
  }, [open, items]);

  const filtered = useMemo(
    () =>
      fuzzyFilter(
        (items ?? []).filter((it) => !cat || it.category === cat),
        q,
        (it) => `${it.name} ${it.reference} ${it.subcategory} ${it.description}`,
      ),
    [items, q, cat],
  );

  const toggle = (id: string) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  const confirm = () => {
    onPick((items ?? []).filter((i) => selected.includes(i.id)));
    setSelected([]);
    onClose();
  };

  return (
    <Modal open={open} onClose={onClose} title="Ajouter depuis le catalogue" wide>
      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Icon name="search" size={16} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted" />
          <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher une prestation" className="field pl-9" />
        </div>
        <select value={cat} onChange={(e) => setCat(e.target.value)} className="field sm:w-48" aria-label="Catégorie">
          {Object.entries(CATS).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
      </div>
      {error ? <p className="mt-3 text-sm text-danger">{error}</p> : null}
      <ul className="mt-3 max-h-[50vh] divide-y divide-line overflow-y-auto rounded-md border border-line">
        {items === null ? <li className="p-4 text-sm text-muted">Chargement...</li> : null}
        {items !== null && filtered.length === 0 ? (
          <li className="p-4 text-sm text-muted">Aucune prestation. Vous pouvez saisir une ligne libre puis l'enregistrer dans le catalogue.</li>
        ) : null}
        {filtered.map((it) => (
          <li key={it.id}>
            <label className="flex cursor-pointer items-start gap-3 px-3 py-2.5 hover:bg-surface-2">
              <input type="checkbox" className="mt-1 h-4 w-4" checked={selected.includes(it.id)} onChange={() => toggle(it.id)} />
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5 font-medium">
                  {it.favorite ? <Icon name="star" size={14} className="text-warning" /> : null}
                  {it.name}
                </span>
                <span className="block truncate text-xs text-muted">
                  {it.reference} {it.description ? " - " + it.description : ""}
                </span>
                {it.source === "library" ? <span className="text-xs text-warning">Tarif indicatif de la bibliothèque, à adapter</span> : null}
              </span>
              <span className="tabular shrink-0 text-right text-sm">
                {formatUnitPrice(it.unit_price4)} / {it.unit}
                <span className="block text-xs text-muted">TVA {formatPercent(it.vat_bp)}</span>
              </span>
            </label>
          </li>
        ))}
      </ul>
      <div className="mt-4 flex items-center justify-between gap-3">
        <span className="text-sm text-muted">{selected.length} sélectionnée(s)</span>
        <div className="flex gap-2">
          <button type="button" className="btn-secondary" onClick={onClose}>
            Annuler
          </button>
          <button type="button" className="btn-primary" disabled={!selected.length} onClick={confirm}>
            Ajouter au devis
          </button>
        </div>
      </div>
    </Modal>
  );
}
