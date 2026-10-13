"use client";

import { useActionState, useState } from "react";
import { addTaskAction, deleteTaskAction, saveJobAction, taskProgressAction } from "@/app/actions";
import { ActionForm } from "@/components/forms/ActionForm";
import { FormMessage, Submit } from "@/components/forms/Submit";
import { Icon } from "@/components/Icon";
import { JOB_STATUSES } from "@/lib/services/jobs-labels";

type Contact = { name: string; role: string; phone: string };

export function JobInfoForm({
  job,
  canEdit,
}: {
  job: {
    id: string;
    title: string;
    status: string;
    site_line1: string;
    site_line2: string;
    site_postal_code: string;
    site_city: string;
    access_notes: string;
    access_codes: string;
    contacts: Contact[];
    start_date: string | null;
    end_date: string | null;
  };
  canEdit: boolean;
}) {
  const [contacts, setContacts] = useState<Contact[]>(job.contacts.length ? job.contacts : [{ name: "", role: "", phone: "" }]);
  return (
    <ActionForm action={saveJobAction}>
      <input type="hidden" name="id" value={job.id} />
      <fieldset disabled={!canEdit} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-[1fr_200px]">
          <div>
            <label className="label" htmlFor="job-title">
              Nom du chantier
            </label>
            <input id="job-title" name="title" className="field" defaultValue={job.title} required />
          </div>
          <div>
            <label className="label" htmlFor="job-status">
              État
            </label>
            <select id="job-status" name="status" className="field" defaultValue={job.status}>
              {Object.entries(JOB_STATUSES).map(([k, l]) => (
                <option key={k} value={k}>
                  {l}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="job-start">
              Début prévu
            </label>
            <input id="job-start" name="start_date" type="date" className="field" defaultValue={job.start_date ?? ""} />
          </div>
          <div>
            <label className="label" htmlFor="job-end">
              Fin prévue
            </label>
            <input id="job-end" name="end_date" type="date" className="field" defaultValue={job.end_date ?? ""} />
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="job-l1">
              Adresse du chantier
            </label>
            <input id="job-l1" name="site_line1" className="field" defaultValue={job.site_line1} autoComplete="off" />
            <input name="site_line2" className="field mt-2" defaultValue={job.site_line2} aria-label="Complément d'adresse" autoComplete="off" />
          </div>
          <div className="grid grid-cols-[110px_1fr] gap-2 self-start">
            <div>
              <label className="label" htmlFor="job-pc">
                Code postal
              </label>
              <input id="job-pc" name="site_postal_code" className="field" defaultValue={job.site_postal_code} inputMode="numeric" />
            </div>
            <div>
              <label className="label" htmlFor="job-city">
                Ville
              </label>
              <input id="job-city" name="site_city" className="field" defaultValue={job.site_city} />
            </div>
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="job-access">
              Accès et consignes
            </label>
            <textarea
              id="job-access"
              name="access_notes"
              rows={3}
              className="field"
              defaultValue={job.access_notes}
              placeholder="Stationnement, étage, horaires autorisés..."
            />
          </div>
          <div>
            <label className="label" htmlFor="job-codes">
              Codes (digicode, boîte à clés)
            </label>
            <textarea id="job-codes" name="access_codes" rows={3} className="field" defaultValue={job.access_codes} autoComplete="off" />
            <p className="mt-1 text-xs text-muted">Chiffrés à l'enregistrement, visibles par l'équipe uniquement.</p>
          </div>
        </div>
        <fieldset>
          <legend className="label">Contacts sur place</legend>
          <div className="space-y-2">
            {contacts.map((c, i) => (
              <div key={i} className="grid gap-2 sm:grid-cols-[1fr_1fr_1fr_auto]">
                <input name="contact_name" className="field" defaultValue={c.name} placeholder="Nom" aria-label={`Nom du contact ${i + 1}`} />
                <input
                  name="contact_role"
                  className="field"
                  defaultValue={c.role}
                  placeholder="Rôle (gardien, architecte...)"
                  aria-label={`Rôle du contact ${i + 1}`}
                />
                <input
                  name="contact_phone"
                  type="tel"
                  className="field"
                  defaultValue={c.phone}
                  placeholder="Téléphone"
                  aria-label={`Téléphone du contact ${i + 1}`}
                />
                <button
                  type="button"
                  className="btn-ghost px-2"
                  onClick={() => setContacts(contacts.filter((_, k) => k !== i))}
                  aria-label={`Retirer le contact ${i + 1}`}
                >
                  <Icon name="trash" size={16} />
                </button>
              </div>
            ))}
          </div>
          {contacts.length < 10 ? (
            <button type="button" className="btn-ghost mt-2 text-sm" onClick={() => setContacts([...contacts, { name: "", role: "", phone: "" }])}>
              <Icon name="plus" size={16} /> Ajouter un contact
            </button>
          ) : null}
        </fieldset>
        {canEdit ? <Submit>Enregistrer</Submit> : null}
      </fieldset>
    </ActionForm>
  );
}

const STEPS = [0, 25, 50, 75, 100];

/** Boutons d'avancement d'une tâche : grands, faciles à toucher sur le chantier. */
export function TaskProgress({ taskId, label, progressBp, canEdit }: { taskId: string; label: string; progressBp: number; canEdit: boolean }) {
  const [state, run] = useActionState(taskProgressAction, null);
  const current = progressBp / 100;
  return (
    <form action={run} className="flex flex-wrap items-center gap-1" aria-label={`Avancement de ${label}`}>
      <input type="hidden" name="taskId" value={taskId} />
      {STEPS.map((p) => (
        <button
          key={p}
          name="percent"
          value={p}
          disabled={!canEdit}
          aria-pressed={current === p}
          className={`min-h-9 min-w-12 rounded-md border px-2 text-sm tabular ${current === p ? "border-accent bg-accent text-white dark:text-[#0d1520]" : "border-line bg-surface hover:bg-surface-2"}`}
        >
          {p} %
        </button>
      ))}
      {state?.error ? <FormMessage state={state} /> : null}
    </form>
  );
}

export function DeleteTask({ taskId, jobId, label }: { taskId: string; jobId: string; label: string }) {
  return (
    <ActionForm action={deleteTaskAction} className="inline">
      <input type="hidden" name="taskId" value={taskId} />
      <input type="hidden" name="jobId" value={jobId} />
      <button className="btn-ghost px-2" aria-label={`Supprimer la tâche ${label}`}>
        <Icon name="trash" size={16} />
      </button>
    </ActionForm>
  );
}

export function AddTaskForm({ jobId }: { jobId: string }) {
  return (
    <ActionForm action={addTaskAction} className="flex flex-wrap items-end gap-2" resetOnSuccess>
      <input type="hidden" name="jobId" value={jobId} />
      <div className="min-w-48 flex-1">
        <label className="label" htmlFor="task-label">
          Nouvelle tâche
        </label>
        <input id="task-label" name="label" className="field" placeholder="Ex. : protection des sols" required />
      </div>
      <Submit className="btn-secondary" pendingLabel="Ajout...">
        <Icon name="plus" size={16} /> Ajouter
      </Submit>
    </ActionForm>
  );
}
