"use client";

import Link from "next/link";
import { useState } from "react";
import { apiFetch, ApiError } from "@/components/editor/api";
import { Icon } from "@/components/Icon";

type Artisan = { name: string; city: string; showcase: string | null };

/** Formulaire du particulier : la demande part vers trois artisans au plus, qui le recontactent. */
export function MatchForm({ trades, timeframes }: { trades: { key: string; label: string }[]; timeframes: Record<string, string> }) {
  const [f, setF] = useState({
    trade: "",
    postalCode: "",
    city: "",
    description: "",
    timeframe: "mois",
    name: "",
    phone: "",
    email: "",
    consent: false,
    website: "",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<Artisan[] | null>(null);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setF((x) => ({ ...x, [k]: e.target.type === "checkbox" ? (e.target as HTMLInputElement).checked : e.target.value }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const r = await apiFetch<{ artisans: Artisan[] }>("/api/public/mise-en-relation", { method: "POST", json: f });
      setResult(r.artisans);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Envoi impossible, réessayez dans un instant");
    } finally {
      setBusy(false);
    }
  };

  if (result) {
    return result.length ? (
      <div role="status" className="space-y-2">
        <p className="flex items-center gap-2 font-medium text-success">
          <Icon name="check" /> Demande transmise à {result.length} artisan{result.length > 1 ? "s" : ""} de votre département
        </p>
        <ul className="list-disc pl-5 text-sm">
          {result.map((a) => (
            <li key={a.name}>
              {a.showcase ? (
                <Link href={a.showcase} className="link">
                  {a.name}
                </Link>
              ) : (
                a.name
              )}
              {a.city ? `, ${a.city}` : ""}
            </li>
          ))}
        </ul>
        <p className="text-sm text-muted">Chacun vous recontacte directement. Vous restez libre de choisir, ou de ne donner suite à aucun devis.</p>
      </div>
    ) : (
      <p role="status" className="text-sm">
        Aucun artisan inscrit n&apos;est disponible pour ces travaux dans votre département en ce moment. Vos coordonnées n&apos;ont pas été conservées.
      </p>
    );
  }
  return (
    <form onSubmit={submit} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="mr-trade">
            Type de travaux
          </label>
          <select id="mr-trade" className="field" value={f.trade} onChange={set("trade")} required>
            <option value="">Choisir</option>
            {trades.map((t) => (
              <option key={t.key} value={t.key}>
                {t.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="mr-when">
            Quand commencer
          </label>
          <select id="mr-when" className="field" value={f.timeframe} onChange={set("timeframe")}>
            {Object.entries(timeframes).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="mr-cp">
            Code postal des travaux
          </label>
          <input id="mr-cp" className="field" value={f.postalCode} onChange={set("postalCode")} inputMode="numeric" autoComplete="postal-code" required />
        </div>
        <div>
          <label className="label" htmlFor="mr-city">
            Ville
          </label>
          <input id="mr-city" className="field" value={f.city} onChange={set("city")} autoComplete="address-level2" />
        </div>
      </div>
      <div>
        <label className="label" htmlFor="mr-desc">
          Vos travaux
        </label>
        <textarea
          id="mr-desc"
          rows={4}
          className="field"
          value={f.description}
          onChange={set("description")}
          placeholder="Ex. : refaire la salle de bains de 6 m², douche à l'italienne, pose de faïence."
          required
        />
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <div>
          <label className="label" htmlFor="mr-name">
            Nom et prénom
          </label>
          <input id="mr-name" className="field" value={f.name} onChange={set("name")} autoComplete="name" required />
        </div>
        <div>
          <label className="label" htmlFor="mr-phone">
            Téléphone
          </label>
          <input id="mr-phone" type="tel" className="field" value={f.phone} onChange={set("phone")} autoComplete="tel" />
        </div>
        <div>
          <label className="label" htmlFor="mr-email">
            E-mail
          </label>
          <input id="mr-email" type="email" className="field" value={f.email} onChange={set("email")} autoComplete="email" />
        </div>
      </div>
      {/* Champ piège invisible : seuls les robots le remplissent. */}
      <div aria-hidden="true" className="hidden">
        <input tabIndex={-1} autoComplete="off" value={f.website} onChange={set("website")} />
      </div>
      <label className="flex min-h-6 items-start gap-2 text-sm">
        <input type="checkbox" checked={f.consent} onChange={set("consent")} className="mt-1" />
        J&apos;accepte que ma demande et mes coordonnées soient transmises à trois artisans au plus, qui me recontactent à ce sujet.
      </label>
      {error ? (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : null}
      <button className="btn-primary" disabled={busy}>
        {busy ? "Envoi en cours..." : "Trouver un artisan"}
      </button>
    </form>
  );
}
