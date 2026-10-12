"use client";

import { useActionState, useEffect, useRef } from "react";
import { createLeadAction } from "@/app/actions";
import { LEAD_SOURCES } from "@/lib/services/leads-labels";

export function LeadForm() {
  const [state, action, pending] = useActionState(createLeadAction, null);
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state?.ok) form.current?.reset();
  }, [state]);
  return (
    <form ref={form} action={action} className="grid gap-3 sm:grid-cols-2">
      <div>
        <label className="label" htmlFor="l-name">
          Nom
        </label>
        <input id="l-name" name="name" className="field" required maxLength={160} autoComplete="off" />
      </div>
      <div>
        <label className="label" htmlFor="l-source">
          Origine
        </label>
        <select id="l-source" name="source" className="field" defaultValue="telephone">
          {Object.entries(LEAD_SOURCES).map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="label" htmlFor="l-phone">
          Téléphone
        </label>
        <input id="l-phone" name="phone" className="field" inputMode="tel" maxLength={30} />
      </div>
      <div>
        <label className="label" htmlFor="l-email">
          E-mail
        </label>
        <input id="l-email" name="email" type="email" className="field" maxLength={254} />
      </div>
      <div className="sm:col-span-2">
        <label className="label" htmlFor="l-desc">
          Besoin exprimé
        </label>
        <textarea
          id="l-desc"
          name="description"
          rows={2}
          className="field"
          maxLength={4000}
          placeholder="Ex. : rénovation de salle de bain, 6 m², douche à l'italienne"
        />
      </div>
      <div>
        <label className="label" htmlFor="l-city">
          Ville du chantier
        </label>
        <input id="l-city" name="city" className="field" maxLength={120} />
      </div>
      <div className="grid grid-cols-[1fr_150px] gap-2">
        <div>
          <label className="label" htmlFor="l-next">
            Prochaine action
          </label>
          <input id="l-next" name="next_action" className="field" maxLength={300} placeholder="Rappeler, visiter..." />
        </div>
        <div>
          <label className="label" htmlFor="l-on">
            Le
          </label>
          <input id="l-on" name="next_action_on" type="date" className="field" />
        </div>
      </div>
      {state?.error ? (
        <p className="text-sm text-danger sm:col-span-2" role="alert">
          {state.error}
        </p>
      ) : null}
      <div className="sm:col-span-2">
        <button className="btn-primary" disabled={pending}>
          {pending ? "Enregistrement..." : "Enregistrer la demande"}
        </button>
      </div>
    </form>
  );
}
