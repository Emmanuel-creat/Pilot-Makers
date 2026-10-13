"use client";

import { useState } from "react";
import { apiFetch, ApiError } from "@/components/editor/api";
import { Icon } from "@/components/Icon";

interface Day {
  day: string;
  label: string;
  slots: { time: string; start: string }[];
}

/** Choix d'un créneau puis coordonnées : la visite est confirmée immédiatement. */
export function VisitForm({ slug, orgName, days }: { slug: string; orgName: string; days: Day[] }) {
  const [start, setStart] = useState("");
  const [f, setF] = useState({ name: "", phone: "", email: "", address: "", city: "", description: "", consent: false, website: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [booked, setBooked] = useState("");
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setF((x) => ({ ...x, [k]: e.target.type === "checkbox" ? (e.target as HTMLInputElement).checked : e.target.value }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const r = await apiFetch<{ label: string }>(`/api/public/pro/${slug}/visite`, { method: "POST", json: { ...f, start } });
      setBooked(r.label);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Réservation impossible, réessayez dans un instant");
    } finally {
      setBusy(false);
    }
  };

  if (booked) {
    return (
      <div role="status" className="card space-y-2 p-6">
        <p className="flex items-center gap-2 font-medium text-success">
          <Icon name="check" /> Visite réservée le {booked}.
        </p>
        <p className="text-sm text-muted">
          {orgName} est prévenu{f.email ? " et vous recevez une confirmation par e-mail" : ""}. Pour déplacer ou annuler la visite, contactez directement
          l'entreprise.
        </p>
      </div>
    );
  }
  return (
    <form onSubmit={submit} className="space-y-6">
      <fieldset className="card space-y-4 p-6">
        <legend className="sr-only">Choisissez un créneau</legend>
        <h2 className="font-semibold">1. Choisissez un créneau</h2>
        {days.map((d) => (
          <div key={d.day} className="space-y-2">
            <p className="text-sm font-medium first-letter:uppercase">{d.label}</p>
            <div className="flex flex-wrap gap-2">
              {d.slots.map((s) => (
                <label
                  key={s.start}
                  className={`inline-flex min-h-9 cursor-pointer items-center rounded-md border px-3 text-sm tabular-nums focus-within:ring-2 focus-within:ring-accent ${
                    start === s.start ? "border-accent bg-accent text-white dark:text-[#0d1520]" : "border-line bg-surface hover:border-accent"
                  }`}
                >
                  <input
                    type="radio"
                    name="slot"
                    value={s.start}
                    checked={start === s.start}
                    onChange={() => setStart(s.start)}
                    className="sr-only"
                    aria-label={`${d.label} à ${s.time}`}
                  />
                  {s.time}
                </label>
              ))}
            </div>
          </div>
        ))}
      </fieldset>
      <fieldset className="card space-y-3 p-6">
        <legend className="sr-only">Vos coordonnées</legend>
        <h2 className="font-semibold">2. Vos coordonnées</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="vi-name">
              Nom et prénom
            </label>
            <input id="vi-name" className="field" value={f.name} onChange={set("name")} autoComplete="name" required />
          </div>
          <div>
            <label className="label" htmlFor="vi-phone">
              Téléphone
            </label>
            <input id="vi-phone" type="tel" className="field" value={f.phone} onChange={set("phone")} autoComplete="tel" required />
          </div>
          <div>
            <label className="label" htmlFor="vi-address">
              Adresse des travaux
            </label>
            <input id="vi-address" className="field" value={f.address} onChange={set("address")} autoComplete="street-address" required />
          </div>
          <div>
            <label className="label" htmlFor="vi-city">
              Ville
            </label>
            <input id="vi-city" className="field" value={f.city} onChange={set("city")} autoComplete="address-level2" />
          </div>
          <div className="sm:col-span-2">
            <label className="label" htmlFor="vi-email">
              E-mail, pour recevoir la confirmation
            </label>
            <input id="vi-email" type="email" className="field" value={f.email} onChange={set("email")} autoComplete="email" />
          </div>
        </div>
        <div>
          <label className="label" htmlFor="vi-desc">
            Vos travaux
          </label>
          <textarea
            id="vi-desc"
            rows={4}
            className="field"
            value={f.description}
            onChange={set("description")}
            placeholder="Ex. : refaire la salle de bains de 6 m², douche à l'italienne, pose de faïence."
            required
          />
        </div>
        {/* Champ piège invisible : seuls les robots le remplissent. */}
        <div aria-hidden="true" className="hidden">
          <label htmlFor="vi-site">Site internet</label>
          <input id="vi-site" tabIndex={-1} autoComplete="off" value={f.website} onChange={set("website")} />
        </div>
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" className="mt-0.5 h-4 w-4" checked={f.consent} onChange={set("consent")} />
          <span>J'accepte que {orgName} utilise ces informations pour organiser la visite et me recontacter au sujet de mes travaux.</span>
        </label>
        {error ? (
          <p role="alert" className="flex items-center gap-2 text-sm text-danger">
            <Icon name="alert" size={16} /> {error}
          </p>
        ) : null}
        <button type="submit" className="btn-primary" disabled={busy || !f.consent || !start}>
          <Icon name="calendar" size={16} /> Réserver la visite
        </button>
        {!start ? <p className="text-sm text-muted">Choisissez d'abord un créneau ci-dessus.</p> : null}
      </fieldset>
    </form>
  );
}
