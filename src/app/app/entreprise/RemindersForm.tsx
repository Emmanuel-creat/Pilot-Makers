"use client";

import { useState, useTransition } from "react";
import { saveRemindersAction, type ActionState } from "@/app/actions";
import type { ReminderSettings } from "@/lib/services/reminders";

const DAYS = ["Dim.", "Lun.", "Mar.", "Mer.", "Jeu.", "Ven.", "Sam."];

export function RemindersForm({ initial, allowed, canEdit }: { initial: ReminderSettings; allowed: boolean; canEdit: boolean }) {
  const [v, setV] = useState(initial);
  const [state, setState] = useState<ActionState>(null);
  const [pending, start] = useTransition();
  const set = <K extends keyof ReminderSettings>(k: K, val: ReminderSettings[K]) => setV((o) => ({ ...o, [k]: val }));
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => setState(await saveRemindersAction(v as unknown as Record<string, unknown>)));
      }}
      className="card space-y-4 p-5"
    >
      {!allowed ? (
        <p className="rounded-md bg-warning-soft p-3 text-sm">Les relances automatiques sont incluses dans les offres Professionnel et Entreprise.</p>
      ) : null}
      <fieldset disabled={!allowed || !canEdit} className="space-y-4">
        <label className="flex items-center gap-2 text-sm font-medium">
          <input type="checkbox" className="h-4 w-4" checked={v.enabled} onChange={(e) => set("enabled", e.target.checked)} />
          Relancer automatiquement les devis envoyés sans réponse
        </label>
        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <label className="label" htmlFor="r-first">
              Première relance après (jours)
            </label>
            <input
              id="r-first"
              type="number"
              min={1}
              max={60}
              className="field"
              value={v.firstDelayDays}
              onChange={(e) => set("firstDelayDays", Number(e.target.value))}
            />
          </div>
          <div>
            <label className="label" htmlFor="r-interval">
              Puis tous les (jours)
            </label>
            <input
              id="r-interval"
              type="number"
              min={1}
              max={60}
              className="field"
              value={v.intervalDays}
              onChange={(e) => set("intervalDays", Number(e.target.value))}
            />
          </div>
          <div>
            <label className="label" htmlFor="r-max">
              Nombre maximum de relances
            </label>
            <input
              id="r-max"
              type="number"
              min={0}
              max={5}
              className="field"
              value={v.maxReminders}
              onChange={(e) => set("maxReminders", Number(e.target.value))}
            />
          </div>
        </div>
        <div>
          <span className="label">Jours d'envoi</span>
          <div className="flex flex-wrap gap-2">
            {DAYS.map((d, i) => (
              <label
                key={d}
                className={`cursor-pointer rounded-md border px-3 py-1.5 text-sm ${v.weekdays.includes(i) ? "border-accent bg-accent-soft text-accent" : "border-line"}`}
              >
                <input
                  type="checkbox"
                  className="sr-only"
                  checked={v.weekdays.includes(i)}
                  onChange={() => set("weekdays", v.weekdays.includes(i) ? v.weekdays.filter((x) => x !== i) : [...v.weekdays, i].sort())}
                />
                {d}
              </label>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:w-80">
          <div>
            <label className="label" htmlFor="r-from">
              Entre (heure)
            </label>
            <input id="r-from" type="number" min={0} max={23} className="field" value={v.hourFrom} onChange={(e) => set("hourFrom", Number(e.target.value))} />
          </div>
          <div>
            <label className="label" htmlFor="r-to">
              Et (heure)
            </label>
            <input id="r-to" type="number" min={1} max={24} className="field" value={v.hourTo} onChange={(e) => set("hourTo", Number(e.target.value))} />
          </div>
        </div>
        <div>
          <label className="label" htmlFor="r-subject">
            Objet
          </label>
          <input id="r-subject" className="field" value={v.subject} onChange={(e) => set("subject", e.target.value)} />
        </div>
        <div>
          <label className="label" htmlFor="r-body">
            Message
          </label>
          <textarea id="r-body" rows={7} className="field" value={v.body} onChange={(e) => set("body", e.target.value)} />
          <p className="mt-1 text-xs text-muted">Variables : {"{client}, {numero}, {objet}, {total_ttc}, {validite}, {entreprise}, {lien}, {suivi}"}</p>
        </div>
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" className="mt-0.5 h-4 w-4" checked={v.adaptive} onChange={(e) => set("adaptive", e.target.checked)} />
          <span>
            <span className="font-medium">Adapter chaque relance au client et à l&apos;historique du devis</span>
            <span className="block text-xs text-muted">
              Une phrase change selon que le client a ouvert le devis ou non, qu&apos;il est particulier ou professionnel, que des options l&apos;attendent, que
              la fin de validité approche ou que c&apos;est la dernière relance. Elle prend la place de {"{suivi}"}, ou s&apos;ajoute avant la formule finale.
            </span>
          </span>
        </label>
      </fieldset>
      <p className="text-xs text-muted">Aucune relance n'est envoyée pour un devis accepté, refusé, annulé, expiré ou remplacé.</p>
      {state?.error ? <p className="text-sm text-danger">{state.error}</p> : null}
      {state?.ok ? <p className="text-sm text-success">{state.message}</p> : null}
      {allowed && canEdit ? (
        <div className="flex justify-end">
          <button className="btn-primary" disabled={pending}>
            Enregistrer
          </button>
        </div>
      ) : null}
    </form>
  );
}
