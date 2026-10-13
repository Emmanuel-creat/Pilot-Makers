"use client";

import { useActionState, useState } from "react";
import { certificationAction } from "@/app/actions";
import { ActionForm } from "@/components/forms/ActionForm";
import { FormMessage, Submit } from "@/components/forms/Submit";
import { Icon } from "@/components/Icon";
import { CERT_PRESETS, suggestedEnd } from "@/lib/certifications";

/** Saisie d'une habilitation : l'échéance habituelle est proposée pour les habilitations connues. */
export function CertificationForm({ people, defaultUser, canChoose }: { people: { id: string; name: string }[]; defaultUser: string; canChoose: boolean }) {
  const [state, run] = useActionState(certificationAction, null);
  const [name, setName] = useState("");
  const [obtained, setObtained] = useState("");
  const [until, setUntil] = useState("");
  const [touched, setTouched] = useState(false);
  const suggestion = suggestedEnd(name, obtained);
  return (
    <form action={run} className="grid gap-3 sm:grid-cols-2">
      {canChoose ? (
        <div>
          <label className="label" htmlFor="ce-user">
            Personne
          </label>
          <select id="ce-user" name="userId" className="field" defaultValue={defaultUser}>
            {people.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
      ) : (
        <input type="hidden" name="userId" value={defaultUser} />
      )}
      <div className={canChoose ? "" : "sm:col-span-2"}>
        <label className="label" htmlFor="ce-name">
          Habilitation ou formation
        </label>
        <input id="ce-name" name="name" className="field" list="ce-presets" required value={name} onChange={(e) => setName(e.target.value)} />
        <datalist id="ce-presets">
          {CERT_PRESETS.map((p) => (
            <option key={p.name} value={p.name} />
          ))}
        </datalist>
      </div>
      <div>
        <label className="label" htmlFor="ce-obtained">
          Obtenue le
        </label>
        <input id="ce-obtained" name="obtainedOn" type="date" className="field" value={obtained} onChange={(e) => setObtained(e.target.value)} />
      </div>
      <div>
        <label className="label" htmlFor="ce-until">
          Valable jusqu&apos;au
        </label>
        <input
          id="ce-until"
          name="validUntil"
          type="date"
          className="field"
          value={touched ? until : suggestion || until}
          onChange={(e) => {
            setTouched(true);
            setUntil(e.target.value);
          }}
          aria-describedby="ce-until-hint"
        />
        <p id="ce-until-hint" className="mt-1 text-xs text-muted">
          {suggestion && !touched ? "Durée habituelle de recyclage, à vérifier sur l'attestation." : "Laissez vide si elle n'expire pas."}
        </p>
      </div>
      <div className="sm:col-span-2">
        <label className="label" htmlFor="ce-note">
          Précision <span className="font-normal text-muted">(niveau, organisme)</span>
        </label>
        <input id="ce-note" name="note" className="field" maxLength={200} placeholder="Ex. : B1V BR, organisme de formation" />
      </div>
      <div className="flex items-center gap-3 sm:col-span-2">
        <Submit pendingLabel="Enregistrement...">
          <Icon name="shield" size={16} /> Enregistrer l&apos;habilitation
        </Submit>
        <FormMessage state={state} />
      </div>
    </form>
  );
}

export function DeleteCertification({ id, label }: { id: string; label: string }) {
  return (
    <ActionForm action={certificationAction} className="inline">
      <input type="hidden" name="deleteId" value={id} />
      <button className="btn-ghost min-h-9 px-2" aria-label={`Retirer ${label}`}>
        <Icon name="trash" size={16} />
      </button>
    </ActionForm>
  );
}
