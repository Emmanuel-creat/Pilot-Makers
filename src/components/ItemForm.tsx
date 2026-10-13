"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { apiFetch, ApiError } from "@/components/editor/api";

export interface ItemFormValue {
  reference: string;
  name: string;
  description: string;
  category: string;
  subcategory: string;
  unit: string;
  unit_cost: string;
  hourly_cost: string;
  unit_price: string;
  vat_percent: string;
  /** Pertes et chutes en %, vide si aucune */
  waste_percent: string;
  supplier: string;
  supplier_ref: string;
  duration_minutes: number | null;
  price_valid_until: string | null;
  active: boolean;
  favorite: boolean;
  /** Étiquettes séparées par des virgules */
  tags: string;
}

export const EMPTY_ITEM: ItemFormValue = {
  reference: "",
  name: "",
  description: "",
  category: "main_oeuvre",
  subcategory: "",
  unit: "u",
  unit_cost: "",
  hourly_cost: "",
  unit_price: "",
  vat_percent: "20",
  waste_percent: "",
  supplier: "",
  supplier_ref: "",
  duration_minutes: null,
  price_valid_until: null,
  active: true,
  favorite: false,
  tags: "",
};

const CATS: Record<string, string> = {
  main_oeuvre: "Main-d'œuvre",
  materiau: "Matériau",
  deplacement: "Déplacement",
  sous_traitance: "Sous-traitance",
  forfait: "Forfait",
  autre: "Autre",
};
const UNITS = ["u", "h", "j", "m²", "m³", "ml", "m", "kg", "t", "l", "forfait", "lot", "ens", "sac"];

/** Calcule la marge affichée à titre indicatif pendant la saisie. */
function marginHint(price: string, cost: string) {
  const p = Number(price.replace(",", ".").replace(/\s/g, ""));
  const c = Number(cost.replace(",", ".").replace(/\s/g, ""));
  if (!p || !c || Number.isNaN(p) || Number.isNaN(c)) return null;
  return { rate: ((p - c) / p) * 100, coef: p / c };
}

export function ItemForm({
  id,
  initial = EMPTY_ITEM,
  showCosts,
  computed = false,
}: {
  id?: string;
  initial?: ItemFormValue;
  showCosts: boolean;
  /** Ouvrage composé : prix et coût viennent des composants */
  computed?: boolean;
}) {
  const router = useRouter();
  const [v, setV] = useState(initial);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof ItemFormValue>(k: K, val: ItemFormValue[K]) => {
    setSaved(false);
    setV((o) => ({ ...o, [k]: val }));
  };
  const m = marginHint(v.unit_price, v.unit_cost);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      if (id) {
        await apiFetch(`/api/catalog-items/${id}`, { method: "PATCH", json: v });
        setSaved(true);
        router.refresh();
      } else {
        const r = await apiFetch<{ id: string }>("/api/catalog-items", { method: "POST", json: v });
        router.push(`/app/catalogue/${r.id}`);
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Enregistrement impossible");
    } finally {
      setBusy(false);
    }
  };

  const text = (k: keyof ItemFormValue, label: string, props: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <div>
      <label className="label" htmlFor={`i-${k}`}>
        {label}
      </label>
      <input id={`i-${k}`} className="field" value={String(v[k] ?? "")} onChange={(e) => set(k, e.target.value as never)} {...props} />
    </div>
  );

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-[1fr_160px]">
        {text("name", "Nom de la prestation", { required: true, maxLength: 200 })}
        {text("reference", "Référence", { placeholder: "Automatique" })}
      </div>
      <div>
        <label className="label" htmlFor="i-description">
          Description <span className="font-normal text-muted">(reprise sur le devis)</span>
        </label>
        <textarea id="i-description" rows={3} className="field" value={v.description} onChange={(e) => set("description", e.target.value)} />
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <div>
          <label className="label" htmlFor="i-category">
            Catégorie
          </label>
          <select id="i-category" className="field" value={v.category} onChange={(e) => set("category", e.target.value)}>
            {Object.entries(CATS).map(([k, l]) => (
              <option key={k} value={k}>
                {l}
              </option>
            ))}
          </select>
        </div>
        {text("subcategory", "Sous-catégorie", { placeholder: "Ex. : Sol" })}
        <div>
          <label className="label" htmlFor="i-unit">
            Unité
          </label>
          <input id="i-unit" list="item-units" className="field" value={v.unit} onChange={(e) => set("unit", e.target.value)} required />
          <datalist id="item-units">
            {UNITS.map((u) => (
              <option key={u} value={u} />
            ))}
          </datalist>
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        {text("unit_price", computed ? "Prix de vente HT (€), calculé" : "Prix de vente HT (€)", {
          inputMode: "decimal",
          required: true,
          readOnly: computed,
          title: computed ? "Somme des composants de l'ouvrage" : undefined,
        })}
        <div>
          <label className="label" htmlFor="i-vat">
            TVA par défaut (%)
          </label>
          <select id="i-vat" className="field" value={v.vat_percent} onChange={(e) => set("vat_percent", e.target.value)}>
            {["20", "10", "5,5", "2,1", "0"].map((x) => (
              <option key={x} value={x}>
                {x} %
              </option>
            ))}
            {!["20", "10", "5,5", "2,1", "0"].includes(v.vat_percent) ? <option value={v.vat_percent}>{v.vat_percent} %</option> : null}
          </select>
        </div>
        {text("price_valid_until", "Prix valable jusqu'au", { type: "date" })}
      </div>
      {v.category === "materiau" || v.waste_percent ? (
        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            {text("waste_percent", "Pertes et chutes (%)", { inputMode: "decimal", placeholder: "Ex. : 10" })}
            <p className="mt-1 text-xs text-muted">Proposées dans le devis pour passer de la quantité mesurée à la quantité à fournir.</p>
          </div>
        </div>
      ) : null}
      {showCosts ? (
        <div className="rounded-md bg-surface-2 p-4">
          <p className="mb-3 text-xs font-medium text-muted">Informations internes, jamais visibles par le client</p>
          <div className="grid gap-3 sm:grid-cols-3">
            {text("unit_cost", computed ? "Coût HT (€), calculé" : "Coût d'achat HT (€)", { inputMode: "decimal", readOnly: computed })}
            {text("hourly_cost", "Coût horaire (€)", { inputMode: "decimal" })}
            <div>
              <label className="label" htmlFor="i-duration">
                Temps estimé (minutes)
              </label>
              <input
                id="i-duration"
                type="number"
                min={0}
                className="field"
                value={v.duration_minutes ?? ""}
                onChange={(e) => set("duration_minutes", e.target.value === "" ? null : Number(e.target.value))}
              />
            </div>
          </div>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {text("supplier", "Fournisseur")}
            {text("supplier_ref", "Référence chez le fournisseur")}
          </div>
          {m ? (
            <p className="mt-2 text-sm">
              Marge sur vente : <strong>{m.rate.toFixed(1).replace(".", ",")} %</strong>, coefficient {m.coef.toFixed(2).replace(".", ",")}
            </p>
          ) : null}
        </div>
      ) : null}
      <div>
        {text("tags", "Étiquettes", { placeholder: "Ex. : salle de bain, extérieur, rénovation", maxLength: 400 })}
        <p className="mt-1 text-xs text-muted">Séparées par des virgules. Elles servent à filtrer le catalogue et à retrouver une prestation.</p>
      </div>
      <div className="flex flex-wrap gap-4 text-sm">
        <label className="flex items-center gap-2">
          <input type="checkbox" className="h-4 w-4" checked={v.favorite} onChange={(e) => set("favorite", e.target.checked)} /> Favori
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" className="h-4 w-4" checked={v.active} onChange={(e) => set("active", e.target.checked)} /> Active (proposée dans les devis)
        </label>
      </div>
      {error ? (
        <p className="text-sm text-danger" role="alert">
          {error}
        </p>
      ) : null}
      {saved ? <p className="text-sm text-success">Modifications enregistrées. Les devis déjà émis ne sont pas modifiés.</p> : null}
      <div className="flex justify-end">
        <button className="btn-primary" disabled={busy}>
          {busy ? "Enregistrement..." : id ? "Enregistrer" : "Créer la prestation"}
        </button>
      </div>
    </form>
  );
}
