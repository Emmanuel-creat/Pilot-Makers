"use client";

import { useActionState, useState } from "react";
import { fleetAction } from "@/app/actions";
import { ActionForm } from "@/components/forms/ActionForm";
import { FormMessage, Submit } from "@/components/forms/Submit";
import { Icon } from "@/components/Icon";
import { CHECK_PRESETS } from "@/lib/fleet";

type Asset = { value: string; label: string; type: "vehicle" | "tool" };

/** Nouveau contrôle : la périodicité habituelle est reprise des contrôles courants. */
export function CheckForm({ assets }: { assets: Asset[] }) {
  const [state, run] = useActionState(fleetAction, null);
  const [asset, setAsset] = useState(assets[0]?.value ?? "");
  const [label, setLabel] = useState("");
  const [months, setMonths] = useState("");
  const type = assets.find((a) => a.value === asset)?.type ?? "vehicle";
  const presets = CHECK_PRESETS.filter((p) => p.for === type);
  return (
    <form action={run} className="grid gap-3 sm:grid-cols-2">
      <input type="hidden" name="op" value="check" />
      <div>
        <label className="label" htmlFor="ck-asset">
          Véhicule ou outil
        </label>
        <select id="ck-asset" name="asset" className="field" value={asset} onChange={(e) => setAsset(e.target.value)}>
          {assets.map((a) => (
            <option key={a.value} value={a.value}>
              {a.label}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="label" htmlFor="ck-label">
          Contrôle
        </label>
        <input
          id="ck-label"
          name="label"
          className="field"
          list="ck-presets"
          required
          value={label}
          onChange={(e) => {
            setLabel(e.target.value);
            const p = CHECK_PRESETS.find((x) => x.label === e.target.value);
            if (p) setMonths(String(p.months));
          }}
        />
        <datalist id="ck-presets">
          {presets.map((p) => (
            <option key={p.label} value={p.label} />
          ))}
        </datalist>
      </div>
      <div>
        <label className="label" htmlFor="ck-months">
          Tous les (mois)
        </label>
        <input id="ck-months" name="intervalMonths" inputMode="numeric" className="field" value={months} onChange={(e) => setMonths(e.target.value)} />
      </div>
      <div>
        <label className="label" htmlFor="ck-due">
          Prochain avant le
        </label>
        <input id="ck-due" name="dueDate" type="date" className="field" aria-describedby="ck-due-hint" />
        <p id="ck-due-hint" className="mt-1 text-xs text-muted">
          Vide : calculé à partir d&apos;aujourd&apos;hui avec la périodicité.
        </p>
      </div>
      <div className="sm:col-span-2">
        <label className="label" htmlFor="ck-note">
          Précision <span className="font-normal text-muted">(garage, organisme)</span>
        </label>
        <input id="ck-note" name="note" className="field" maxLength={200} />
      </div>
      <div className="flex items-center gap-3 sm:col-span-2">
        <Submit pendingLabel="Enregistrement...">
          <Icon name="plus" size={16} /> Ajouter le contrôle
        </Submit>
        <FormMessage state={state} />
      </div>
    </form>
  );
}

export function CheckDone({ id, label }: { id: string; label: string }) {
  return (
    <div className="flex items-center gap-1">
      <ActionForm action={fleetAction} className="inline">
        <input type="hidden" name="op" value="done" />
        <input type="hidden" name="id" value={id} />
        <Submit className="btn-secondary min-h-9 py-1" pendingLabel="...">
          <Icon name="check" size={16} /> <span>Fait</span>
          <span className="sr-only"> : {label}</span>
        </Submit>
      </ActionForm>
      <ActionForm action={fleetAction} className="inline">
        <input type="hidden" name="op" value="deleteCheck" />
        <input type="hidden" name="id" value={id} />
        <button className="btn-ghost min-h-9 px-2" aria-label={`Retirer le contrôle ${label}`}>
          <Icon name="trash" size={16} />
        </button>
      </ActionForm>
    </div>
  );
}

export function ToolForm({ tools }: { tools: { id: string; name: string; reference: string }[] }) {
  return (
    <div className="space-y-3">
      <ActionForm action={fleetAction} className="flex flex-wrap items-end gap-2" resetOnSuccess>
        <input type="hidden" name="op" value="tool" />
        <div>
          <label className="label" htmlFor="tl-name">
            Outil ou engin
          </label>
          <input id="tl-name" name="name" className="field" placeholder="Échafaudage roulant" required />
        </div>
        <div>
          <label className="label" htmlFor="tl-ref">
            Référence
          </label>
          <input id="tl-ref" name="reference" className="field w-40" placeholder="N° de série" />
        </div>
        <Submit className="btn-secondary">Ajouter</Submit>
      </ActionForm>
      {tools.length ? (
        <ul className="divide-y divide-line text-sm">
          {tools.map((t) => (
            <li key={t.id} className="flex items-center justify-between py-1.5">
              <span>
                {t.name} <span className="text-muted">{t.reference}</span>
              </span>
              <ActionForm action={fleetAction} className="inline">
                <input type="hidden" name="op" value="deleteTool" />
                <input type="hidden" name="id" value={t.id} />
                <button className="btn-ghost px-2" aria-label={`Retirer l'outil ${t.name}`}>
                  <Icon name="trash" size={16} />
                </button>
              </ActionForm>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
