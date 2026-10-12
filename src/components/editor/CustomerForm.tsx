"use client";

import { useState } from "react";
import { Icon } from "@/components/Icon";
import { apiFetch, ApiError } from "./api";

export interface CustomerFormValue {
  type: string;
  civility: string;
  first_name: string;
  last_name: string;
  company_name: string;
  billing_line1: string;
  billing_line2: string;
  billing_postal_code: string;
  billing_city: string;
  billing_country: string;
  site_same_as_billing: boolean;
  site_line1: string;
  site_line2: string;
  site_postal_code: string;
  site_city: string;
  email: string;
  phone: string;
  siren: string;
  vat_number: string;
  notes: string;
  tags: string[];
  contact_preference: string;
}

export const EMPTY_CUSTOMER: CustomerFormValue = {
  type: "particulier",
  civility: "",
  first_name: "",
  last_name: "",
  company_name: "",
  billing_line1: "",
  billing_line2: "",
  billing_postal_code: "",
  billing_city: "",
  billing_country: "France",
  site_same_as_billing: true,
  site_line1: "",
  site_line2: "",
  site_postal_code: "",
  site_city: "",
  email: "",
  phone: "",
  siren: "",
  vat_number: "",
  notes: "",
  tags: [],
  contact_preference: "email",
};

/**
 * Formulaire client partagé (page Clients et création depuis un devis).
 * Les doublons probables sont signalés avant l'enregistrement.
 */
export function CustomerForm({
  initial = EMPTY_CUSTOMER,
  customerId,
  onSaved,
  onCancel,
  compact = false,
}: {
  initial?: CustomerFormValue;
  customerId?: string;
  onSaved: (id: string, value: CustomerFormValue) => void;
  onCancel?: () => void;
  compact?: boolean;
}) {
  const [v, setV] = useState<CustomerFormValue>(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [dups, setDups] = useState<{ id: string; name: string; reason: string }[]>([]);
  const [busy, setBusy] = useState(false);
  const [tagInput, setTagInput] = useState("");
  const set = (k: keyof CustomerFormValue, val: unknown) => setV((o) => ({ ...o, [k]: val }));
  const pro = v.type !== "particulier";

  const save = async (allowDuplicate = false) => {
    setBusy(true);
    setError("");
    setErrors({});
    try {
      if (customerId) {
        await apiFetch(`/api/customers/${customerId}`, { method: "PATCH", json: v });
        onSaved(customerId, v);
      } else {
        const r = await apiFetch<{ id: string }>("/api/customers", { method: "POST", json: { customer: v, allowDuplicate } });
        onSaved(r.id, v);
      }
    } catch (e) {
      if (e instanceof ApiError && e.code === "duplicate") setDups((e.data.duplicates as typeof dups) ?? []);
      else if (e instanceof ApiError) {
        setError(e.message);
        if (e.data.details && typeof e.data.details === "object" && !Array.isArray(e.data.details)) setErrors(e.data.details as Record<string, string>);
      }
    } finally {
      setBusy(false);
    }
  };

  const input = (k: keyof CustomerFormValue, label: string, props: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <div>
      <label className="label" htmlFor={`c-${k}`}>
        {label}
      </label>
      <input id={`c-${k}`} className="field" value={String(v[k] ?? "")} onChange={(e) => set(k, e.target.value)} {...props} />
      {errors[k] ? <p className="mt-1 text-sm text-danger">{errors[k]}</p> : null}
    </div>
  );

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
      className="space-y-4"
    >
      <fieldset>
        <legend className="label">Type de client</legend>
        <div className="flex flex-wrap gap-2">
          {[
            ["particulier", "Particulier"],
            ["entreprise", "Entreprise"],
            ["copropriete", "Copropriété"],
            ["autre", "Autre"],
          ].map(([k, l]) => (
            <label key={k} className={`cursor-pointer rounded-md border px-3 py-1.5 text-sm ${v.type === k ? "border-accent bg-accent-soft text-accent" : "border-line"}`}>
              <input type="radio" name="type" className="sr-only" checked={v.type === k} onChange={() => set("type", k)} />
              {l}
            </label>
          ))}
        </div>
      </fieldset>
      {pro ? input("company_name", v.type === "copropriete" ? "Syndicat de copropriété" : "Dénomination sociale", { required: true }) : null}
      <div className="grid gap-3 sm:grid-cols-[100px_1fr_1fr]">
        <div>
          <label className="label" htmlFor="c-civility">
            Civilité
          </label>
          <select id="c-civility" className="field" value={v.civility} onChange={(e) => set("civility", e.target.value)}>
            <option value="" />
            <option>Mme</option>
            <option>M.</option>
          </select>
        </div>
        {input("first_name", pro ? "Prénom du contact" : "Prénom")}
        {input("last_name", pro ? "Nom du contact" : "Nom", { required: !pro })}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {input("email", "E-mail", { type: "email", autoComplete: "off" })}
        {input("phone", "Téléphone", { type: "tel" })}
      </div>
      <div className="space-y-3">
        {input("billing_line1", "Adresse de facturation")}
        {compact ? null : input("billing_line2", "Complément d'adresse")}
        <div className="grid grid-cols-[120px_1fr] gap-3">
          {input("billing_postal_code", "Code postal", { inputMode: "numeric" })}
          {input("billing_city", "Ville")}
        </div>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" className="h-4 w-4" checked={v.site_same_as_billing} onChange={(e) => set("site_same_as_billing", e.target.checked)} />
        L'adresse du chantier est la même
      </label>
      {!v.site_same_as_billing ? (
        <div className="space-y-3 rounded-md border border-line p-3">
          {input("site_line1", "Adresse du chantier")}
          <div className="grid grid-cols-[120px_1fr] gap-3">
            {input("site_postal_code", "Code postal", { inputMode: "numeric" })}
            {input("site_city", "Ville")}
          </div>
        </div>
      ) : null}
      {pro ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {input("siren", "SIREN")}
          {input("vat_number", "N° TVA intracommunautaire")}
        </div>
      ) : null}
      {compact ? null : (
        <>
          <div>
            <label className="label" htmlFor="c-tags">
              Étiquettes
            </label>
            <div className="flex flex-wrap items-center gap-1.5 rounded-md border border-line bg-surface p-1.5">
              {v.tags.map((t) => (
                <span key={t} className="inline-flex items-center gap-1 rounded bg-surface-2 px-2 py-0.5 text-sm">
                  {t}
                  <button type="button" aria-label={`Retirer ${t}`} onClick={() => set("tags", v.tags.filter((x) => x !== t))}>
                    <Icon name="x" size={12} />
                  </button>
                </span>
              ))}
              <input
                id="c-tags"
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => {
                  if ((e.key === "Enter" || e.key === ",") && tagInput.trim()) {
                    e.preventDefault();
                    if (!v.tags.includes(tagInput.trim())) set("tags", [...v.tags, tagInput.trim()]);
                    setTagInput("");
                  }
                }}
                placeholder="Ajouter puis Entrée"
                className="min-w-32 flex-1 bg-transparent px-1 py-0.5 text-sm outline-none"
              />
            </div>
          </div>
          <div>
            <label className="label" htmlFor="c-pref">
              Préférence de contact
            </label>
            <select id="c-pref" className="field" value={v.contact_preference} onChange={(e) => set("contact_preference", e.target.value)}>
              <option value="email">E-mail</option>
              <option value="telephone">Téléphone</option>
              <option value="courrier">Courrier</option>
            </select>
          </div>
          <div>
            <label className="label" htmlFor="c-notes">
              Notes internes <span className="font-normal text-muted">(jamais visibles par le client)</span>
            </label>
            <textarea id="c-notes" rows={3} className="field" value={v.notes} onChange={(e) => set("notes", e.target.value)} />
          </div>
        </>
      )}
      {dups.length ? (
        <div className="rounded-md border border-warning/40 bg-warning-soft p-3 text-sm">
          <p className="font-medium">Ce client existe peut-être déjà :</p>
          <ul className="mt-1 list-disc pl-5">
            {dups.map((d) => (
              <li key={d.id}>
                <a className="link" href={`/app/clients/${d.id}`} target="_blank" rel="noreferrer">
                  {d.name}
                </a>{" "}
                ({d.reason})
                {!customerId ? (
                  <button type="button" className="link ml-2" onClick={() => onSaved(d.id, v)}>
                    Utiliser celui-ci
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
          <button type="button" className="btn-secondary mt-2" onClick={() => save(true)} disabled={busy}>
            Créer quand même
          </button>
        </div>
      ) : null}
      {error ? <p className="text-sm text-danger" role="alert">{error}</p> : null}
      <div className="flex justify-end gap-2">
        {onCancel ? (
          <button type="button" className="btn-secondary" onClick={onCancel}>
            Annuler
          </button>
        ) : null}
        <button className="btn-primary" disabled={busy}>
          {busy ? "Enregistrement..." : "Enregistrer le client"}
        </button>
      </div>
    </form>
  );
}
