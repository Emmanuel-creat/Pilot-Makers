"use client";

import { useState } from "react";
import { apiFetch, ApiError } from "@/components/editor/api";
import { Icon } from "@/components/Icon";

/** Formulaire de demande de devis : la demande arrive dans le suivi des demandes de l'entreprise. */
export function RequestForm({ slug, orgName }: { slug: string; orgName: string }) {
  const [f, setF] = useState({ name: "", phone: "", email: "", city: "", description: "", consent: false, website: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setF((x) => ({ ...x, [k]: e.target.type === "checkbox" ? (e.target as HTMLInputElement).checked : e.target.value }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await apiFetch(`/api/public/pro/${slug}/demande`, { method: "POST", json: f });
      setSent(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Envoi impossible, réessayez dans un instant");
    } finally {
      setBusy(false);
    }
  };

  if (sent) {
    return (
      <p role="status" className="flex items-center gap-2 text-success">
        <Icon name="check" /> Demande envoyée. {orgName} vous recontacte rapidement.
      </p>
    );
  }
  return (
    <form onSubmit={submit} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="rq-name">
            Nom et prénom
          </label>
          <input id="rq-name" className="field" value={f.name} onChange={set("name")} autoComplete="name" required />
        </div>
        <div>
          <label className="label" htmlFor="rq-city">
            Ville des travaux
          </label>
          <input id="rq-city" className="field" value={f.city} onChange={set("city")} autoComplete="address-level2" />
        </div>
        <div>
          <label className="label" htmlFor="rq-phone">
            Téléphone
          </label>
          <input id="rq-phone" type="tel" className="field" value={f.phone} onChange={set("phone")} autoComplete="tel" />
        </div>
        <div>
          <label className="label" htmlFor="rq-email">
            E-mail
          </label>
          <input id="rq-email" type="email" className="field" value={f.email} onChange={set("email")} autoComplete="email" />
        </div>
      </div>
      <div>
        <label className="label" htmlFor="rq-desc">
          Vos travaux
        </label>
        <textarea
          id="rq-desc"
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
        <label htmlFor="rq-site">Site internet</label>
        <input id="rq-site" tabIndex={-1} autoComplete="off" value={f.website} onChange={set("website")} />
      </div>
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" className="mt-0.5 h-4 w-4" checked={f.consent} onChange={set("consent")} />
        <span>J'accepte que {orgName} utilise ces informations pour me recontacter au sujet de ma demande.</span>
      </label>
      {error ? (
        <p role="alert" className="flex items-center gap-2 text-sm text-danger">
          <Icon name="alert" size={16} /> {error}
        </p>
      ) : null}
      <button type="submit" className="btn-primary" disabled={busy || !f.consent}>
        <Icon name="send" size={16} /> Envoyer ma demande
      </button>
    </form>
  );
}
