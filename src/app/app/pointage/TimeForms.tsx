"use client";

import { useActionState, useEffect, useState } from "react";
import { addEntryAction, deleteEntryAction, reviewEntriesAction, startTimerAction, stopTimerAction } from "@/app/actions";
import { ActionForm } from "@/components/forms/ActionForm";
import { FormMessage, Submit } from "@/components/forms/Submit";
import { Icon } from "@/components/Icon";
import { formatMinutes } from "@/lib/services/timesheet-calc";

type Job = { id: string; title: string };

function Elapsed({ since }: { since: string }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);
  const min = Math.max(0, Math.floor((now - new Date(since).getTime()) / 60000));
  return <span className="tabular">{formatMinutes(min)}</span>;
}

/** Chronomètre : un appui pour commencer sur un chantier, un appui pour terminer. */
export function TimerCard({
  running,
  jobs,
  canEdit,
}: {
  running: { since: string; startLabel: string; jobTitle: string } | null;
  jobs: Job[];
  canEdit: boolean;
}) {
  const [startState, start] = useActionState(startTimerAction, null);
  const [stopState, stop] = useActionState(stopTimerAction, null);
  const [geo, setGeo] = useState(true);
  const [coords, setCoords] = useState<{ lat: string; lng: string }>({ lat: "", lng: "" });
  useEffect(() => {
    if (!geo || running || typeof navigator === "undefined" || !navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (p) => setCoords({ lat: p.coords.latitude.toFixed(5), lng: p.coords.longitude.toFixed(5) }),
      () => setCoords({ lat: "", lng: "" }),
      { timeout: 8000, maximumAge: 300_000 },
    );
  }, [geo, running]);

  if (running) {
    return (
      <section className="card space-y-4 p-5" aria-live="polite">
        <div>
          <p className="text-sm text-muted">Pointage en cours depuis {running.startLabel}</p>
          <p className="text-3xl font-semibold">
            <Elapsed since={running.since} />
          </p>
          <p className="mt-1">{running.jobTitle || "Sans chantier"}</p>
        </div>
        {canEdit ? (
          <form action={stop} className="space-y-3">
            <div>
              <label className="label" htmlFor="stop-note">
                Note (facultative)
              </label>
              <input id="stop-note" name="note" className="field" maxLength={500} placeholder="Travaux réalisés, imprévus..." />
            </div>
            <Submit className="btn-primary min-h-14 w-full text-lg" pendingLabel="Enregistrement...">
              <Icon name="check" /> Terminer
            </Submit>
            <FormMessage state={stopState} />
          </form>
        ) : null}
      </section>
    );
  }
  return (
    <section className="card space-y-4 p-5">
      {canEdit ? (
        <form action={start} className="space-y-3">
          <div>
            <label className="label" htmlFor="start-job">
              Chantier
            </label>
            <select id="start-job" name="jobId" className="field" defaultValue={jobs[0]?.id ?? ""}>
              {jobs.map((j) => (
                <option key={j.id} value={j.id}>
                  {j.title}
                </option>
              ))}
              <option value="">Sans chantier (atelier, dépôt, administratif)</option>
            </select>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" className="h-4 w-4" checked={geo} onChange={(e) => setGeo(e.target.checked)} />
            Enregistrer la position au départ
          </label>
          <input type="hidden" name="latitude" value={geo ? coords.lat : ""} />
          <input type="hidden" name="longitude" value={geo ? coords.lng : ""} />
          <Submit className="btn-primary min-h-14 w-full text-lg" pendingLabel="Démarrage...">
            <Icon name="play" /> Commencer
          </Submit>
          <FormMessage state={startState} />
        </form>
      ) : (
        <p className="text-sm text-muted">Compte en lecture seule.</p>
      )}
    </section>
  );
}

/** Saisie d'heures après coup ; l'encadrement peut saisir pour un membre. */
export function EntryForm({ jobs, members, today }: { jobs: Job[]; members: { id: string; name: string }[] | null; today: string }) {
  return (
    <ActionForm action={addEntryAction} resetOnSuccess className="grid gap-3 sm:grid-cols-2">
      {members ? (
        <div className="sm:col-span-2">
          <label className="label" htmlFor="entry-user">
            Personne
          </label>
          <select id="entry-user" name="userId" className="field">
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </div>
      ) : null}
      <div>
        <label className="label" htmlFor="entry-date">
          Date
        </label>
        <input id="entry-date" name="date" type="date" className="field" defaultValue={today} max={today} required />
      </div>
      <div>
        <label className="label" htmlFor="entry-duration">
          Durée
        </label>
        <input
          id="entry-duration"
          name="duration"
          className="field"
          inputMode="decimal"
          placeholder="7:30"
          required
          aria-describedby="entry-duration-help"
        />
        <p id="entry-duration-help" className="mt-1 text-xs text-muted">
          Par exemple 7:30, 7h30 ou 7,5
        </p>
      </div>
      <div className="sm:col-span-2">
        <label className="label" htmlFor="entry-job">
          Chantier
        </label>
        <select id="entry-job" name="jobId" className="field">
          {jobs.map((j) => (
            <option key={j.id} value={j.id}>
              {j.title}
            </option>
          ))}
          <option value="">Sans chantier</option>
        </select>
      </div>
      <div className="sm:col-span-2">
        <label className="label" htmlFor="entry-note">
          Note
        </label>
        <input id="entry-note" name="note" className="field" maxLength={500} />
      </div>
      <div className="sm:col-span-2">
        <Submit className="btn-secondary" pendingLabel="Enregistrement...">
          <Icon name="plus" size={16} /> Ajouter ces heures
        </Submit>
      </div>
    </ActionForm>
  );
}

export function DeleteEntry({ id, label }: { id: string; label: string }) {
  return (
    <ActionForm action={deleteEntryAction} className="">
      <input type="hidden" name="id" value={id} />
      <button className="btn-ghost min-h-8 px-2 text-danger" aria-label={`Supprimer ${label}`}>
        <Icon name="trash" size={16} />
      </button>
    </ActionForm>
  );
}

type ReviewRow = { id: string; label: string; detail: string; status: string; statusLabel: string };

/** Validation par l'encadrement : cocher des pointages puis valider, refuser avec une raison, ou rouvrir. */
export function ReviewList({ rows }: { rows: ReviewRow[] }) {
  const [state, act] = useActionState(reviewEntriesAction, null);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const toggle = (id: string) =>
    setChecked((c) => {
      const n = new Set(c);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  useEffect(() => {
    if (state?.ok) setChecked(new Set());
  }, [state]);
  const pending = rows.filter((r) => r.status === "saisi");
  return (
    <form action={act} className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className="btn-ghost min-h-8 text-sm"
          onClick={() => setChecked(new Set(pending.map((r) => r.id)))}
          disabled={!pending.length}
        >
          Tout cocher à valider ({pending.length})
        </button>
        <button type="button" className="btn-ghost min-h-8 text-sm" onClick={() => setChecked(new Set())} disabled={!checked.size}>
          Tout décocher
        </button>
      </div>
      <ul className="divide-y divide-line text-sm">
        {rows.map((r) => (
          <li key={r.id} className="flex items-start gap-3 py-2">
            <input
              type="checkbox"
              name="ids"
              value={r.id}
              id={`rv-${r.id}`}
              className="mt-1 h-4 w-4"
              checked={checked.has(r.id)}
              onChange={() => toggle(r.id)}
            />
            <label htmlFor={`rv-${r.id}`} className="min-w-0 flex-1">
              <span className="font-medium">{r.label}</span>
              <span className="block text-xs text-muted">{r.detail}</span>
            </label>
            <span className={r.status === "valide" ? "text-success" : r.status === "refuse" ? "text-danger" : "text-warning"}>{r.statusLabel}</span>
          </li>
        ))}
      </ul>
      <div className="grid gap-2 sm:grid-cols-[1fr_auto_auto_auto] sm:items-end">
        <div>
          <label className="label" htmlFor="review-note">
            Raison en cas de refus
          </label>
          <input id="review-note" name="note" className="field" maxLength={300} />
        </div>
        <button name="decision" value="valide" className="btn-primary" disabled={!checked.size}>
          <Icon name="check" size={16} /> Valider ({checked.size})
        </button>
        <button name="decision" value="refuse" className="btn-secondary" disabled={!checked.size}>
          Refuser
        </button>
        <button name="decision" value="saisi" className="btn-ghost" disabled={!checked.size}>
          Rouvrir
        </button>
      </div>
      <FormMessage state={state} />
    </form>
  );
}
