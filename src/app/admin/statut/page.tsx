import { createIncidentAction, retryJobAction, updateIncidentAction } from "@/app/actions";
import { ActionForm } from "@/components/forms/ActionForm";
import { Submit } from "@/components/forms/Submit";
import { PageHeader, Section, fmtDate } from "@/components/ui";
import { getDb } from "@/lib/db";
import { requireAdminPage } from "@/lib/server/session";
import { LEVELS, listDeadJobs, listIncidents, serviceStatus } from "@/lib/services/status";
import { JOB_STATUSES, jobStats } from "@/lib/services/task-queue";
import { pdfCache } from "@/lib/cache";

export const metadata = { title: "Statut" };

export default async function AdminStatusPage() {
  const ctx = await requireAdminPage();
  const [status, incidents, queue, dead] = await Promise.all([serviceStatus(getDb), listIncidents(ctx), jobStats(ctx.db), listDeadJobs(ctx)]);
  return (
    <div className="max-w-3xl space-y-6">
      <PageHeader
        title="Page de statut"
        subtitle={`État mesuré : ${status.label}. Les incidents publiés ici apparaissent sur la page publique /statut.`}
      />
      <Section title="Publier un incident ou une maintenance">
        <ActionForm action={createIncidentAction} resetOnSuccess>
          <div>
            <label className="label" htmlFor="inc-title">
              Titre
            </label>
            <input id="inc-title" name="title" className="field" required minLength={3} maxLength={160} />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="inc-sev">
                Gravité
              </label>
              <select id="inc-sev" name="severity" className="field" defaultValue="perturbation">
                <option value="perturbation">Perturbation</option>
                <option value="panne">Panne</option>
                <option value="maintenance">Maintenance prévue</option>
              </select>
            </div>
            <div>
              <label className="label" htmlFor="inc-start">
                Début (vide = maintenant)
              </label>
              <input id="inc-start" name="startsAt" type="datetime-local" className="field" />
            </div>
          </div>
          <div>
            <label className="label" htmlFor="inc-body">
              Explication pour les utilisateurs
            </label>
            <textarea id="inc-body" name="body" rows={3} className="field" maxLength={4000} />
          </div>
          <Submit>Publier</Submit>
        </ActionForm>
      </Section>
      <ul className="space-y-3 text-sm">
        {incidents.map((i) => (
          <li key={i.id} className="card space-y-2 p-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <span className="font-medium">{i.title}</span>
              <span className="text-xs text-muted">
                {LEVELS[i.severity]} · {fmtDate(i.started_at, true)}
                {i.resolved_at ? ` · clos le ${fmtDate(i.resolved_at, true)}` : " · en cours"}
              </span>
            </div>
            {i.body ? <p className="whitespace-pre-line text-muted">{i.body}</p> : null}
            {!i.resolved_at ? (
              <ActionForm action={updateIncidentAction} className="space-y-2" resetOnSuccess>
                <input type="hidden" name="id" value={i.id} />
                <label className="label" htmlFor={`inc-note-${i.id}`}>
                  Nouvelle information
                </label>
                <input id={`inc-note-${i.id}`} name="note" className="field" maxLength={2000} />
                <div className="flex gap-2">
                  <Submit className="btn-secondary">Ajouter</Submit>
                  <button name="resolve" value="1" className="btn-primary">
                    Clore l'incident
                  </button>
                </div>
              </ActionForm>
            ) : null}
          </li>
        ))}
      </ul>
      <Section title="File de tâches">
        <p className="text-sm text-muted">
          {(Object.keys(JOB_STATUSES) as (keyof typeof JOB_STATUSES)[]).map((k) => `${JOB_STATUSES[k]} : ${queue.counts[k]}`).join(" · ")}
          {queue.oldestPending ? ` · plus ancienne en attente : ${fmtDate(queue.oldestPending.toISOString(), true)}` : ""}
        </p>
        <p className="mt-1 text-xs text-muted">
          Cache des PDF de cette instance : {pdfCache.size.entries} fichier(s), {(pdfCache.size.bytes / 1_000_000).toFixed(1)} Mo, {pdfCache.hits} réutilisation(s).
        </p>
        {dead.length ? (
          <ul className="mt-3 space-y-2 text-sm">
            {dead.map((j) => (
              <li key={j.id} className="flex flex-wrap items-center justify-between gap-2 rounded border border-line p-2">
                <span>
                  <span className="font-medium">{j.kind}</span>, {j.attempts} essai(s), {fmtDate(j.finishedAt, true)}
                  {j.lastError ? <span className="block text-xs text-danger">{j.lastError}</span> : null}
                </span>
                <ActionForm action={retryJobAction}>
                  <input type="hidden" name="id" value={j.id} />
                  <Submit className="btn-secondary">Relancer</Submit>
                </ActionForm>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-sm text-muted">Aucune tâche abandonnée.</p>
        )}
      </Section>
    </div>
  );
}
