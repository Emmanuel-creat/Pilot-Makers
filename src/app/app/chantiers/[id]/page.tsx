import Link from "next/link";
import { notFound } from "next/navigation";
import { Icon } from "@/components/Icon";
import { PageHeader, Section, fmtDate } from "@/components/ui";
import { HttpError } from "@/lib/http";
import { requirePageCtx } from "@/lib/server/session";
import { getJob, JOB_STATUSES } from "@/lib/services/jobs";
import { pct } from "@/lib/services/jobs-labels";
import { AddTaskForm, DeleteTask, JobInfoForm, TaskProgress } from "./JobForms";
import { DeleteJournal, JournalForm, LiftReserveForm, ReceptionForm } from "./SiteForms";
import { getReception, listJournal } from "@/lib/services/job-site";
import { formatMinutes } from "@/lib/services/timesheet-calc";
import { jobHours } from "@/lib/services/timesheets";
import { formatEuros } from "@/lib/calc/format";

const DECISIONS = { sans_reserve: "sans réserve", avec_reserves: "avec réserves", refus: "refusée" } as const;
const when = (d: Date) => new Date(d).toLocaleString("fr-FR", { timeZone: "Europe/Paris", dateStyle: "short", timeStyle: "short" });

export const metadata = { title: "Chantier" };

export default async function JobPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requirePageCtx();
  const data = await getJob(ctx, id).catch((e) => {
    if (e instanceof HttpError && e.status === 404) notFound();
    throw e;
  });
  const { job, sections, progressBp } = data;
  const [journal, rec, hours] = await Promise.all([listJournal(ctx, id), getReception(ctx, id), jobHours(ctx, id)]);
  const canEdit = !ctx.entitlements.readOnly && !ctx.supportAccess;
  const address = [job.site_line1, job.site_line2, [job.site_postal_code, job.site_city].filter(Boolean).join(" ")].filter(Boolean).join(", ");
  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title={job.title}
        back={{ href: "/app/chantiers", label: "Chantiers" }}
        subtitle={
          <>
            {JOB_STATUSES[job.status]}
            {job.customer_name ? `, ${job.customer_name}` : ""}
            {job.quote_id ? (
              <>
                {", devis "}
                <Link href={`/app/devis/${job.quote_id}`} className="link">
                  {job.quote_number}
                </Link>
              </>
            ) : null}
          </>
        }
        actions={
          address ? (
            <a
              className="btn-secondary"
              href={`https://www.openstreetmap.org/search?query=${encodeURIComponent(address)}`}
              target="_blank"
              rel="noreferrer"
            >
              <Icon name="pin" size={16} /> Voir sur la carte
            </a>
          ) : null
        }
      />

      <section className="card mb-6 p-4">
        <div className="flex items-center gap-3">
          <progress className="h-3 flex-1 accent-accent" max={10000} value={progressBp} aria-label="Avancement global du chantier" />
          <span className="tabular text-lg font-semibold">{pct(progressBp)} %</span>
        </div>
        <p className="mt-2 text-sm text-muted">
          Avancement pondéré par le montant de chaque ligne du devis.
          {job.quote_id && progressBp > 0 && progressBp < 10000 ? (
            <>
              {" "}
              Pour facturer cet avancement, ouvrez le{" "}
              <Link href={`/app/devis/${job.quote_id}`} className="link">
                devis
              </Link>{" "}
              et émettez une situation à {pct(progressBp)} %.
            </>
          ) : null}
        </p>
        <p className="mt-2 flex flex-wrap items-center gap-x-2 text-sm">
          <Icon name="clock" size={16} className="text-muted" />
          <span>
            Heures pointées : <strong className="tabular">{formatMinutes(hours.minutes)}</strong>
            {hours.minutes ? ` dont ${formatMinutes(hours.validatedMinutes)} validées` : ""}
            {ctx.role !== "member" && hours.costCents ? `, coût ${formatEuros(hours.costCents)}` : ""}
          </span>
          <Link href="/app/pointage" className="link">
            Pointer
          </Link>
        </p>
      </section>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Section title="Tâches et avancement" description="Touchez le pourcentage atteint pour chaque tâche.">
          <div className="space-y-5">
            {sections.map((s) => (
              <div key={s.section || "-"}>
                <div className="mb-2 flex items-center justify-between gap-2">
                  <h3 className="text-sm font-semibold">{s.section || "Travaux"}</h3>
                  <span className="tabular text-sm text-muted">{pct(s.progressBp)} %</span>
                </div>
                <ul className="divide-y divide-line">
                  {s.tasks.map((t) => (
                    <li key={t.id} className="space-y-2 py-2">
                      <div className="flex items-start justify-between gap-2 text-sm">
                        <span>
                          {t.label}
                          {t.quantity ? <span className="text-muted">{` (${t.quantity} ${t.unit})`}</span> : null}
                        </span>
                        {canEdit && t.weight_cents === 0 ? <DeleteTask taskId={t.id} jobId={job.id} label={t.label} /> : null}
                      </div>
                      <TaskProgress taskId={t.id} label={t.label} progressBp={t.progress_bp} canEdit={canEdit} />
                    </li>
                  ))}
                </ul>
              </div>
            ))}
            {canEdit ? <AddTaskForm jobId={job.id} /> : null}
          </div>
        </Section>
        <Section title="Fiche chantier">
          <JobInfoForm job={job} canEdit={canEdit} />
        </Section>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Section title="Journal de chantier" description="Photos et notes datées, avec la position si l'appareil la donne.">
          {canEdit ? <JournalForm jobId={job.id} /> : null}
          {journal.length ? (
            <ul className="mt-4 divide-y divide-line">
              {journal.map((e) => (
                <li key={e.id} className="flex gap-3 py-3">
                  {e.has_photo ? (
                    <a href={`/api/journal/${e.id}/photo`} target="_blank" rel="noreferrer" className="shrink-0">
                      <img
                        src={`/api/journal/${e.id}/photo`}
                        alt={e.note ? `Photo : ${e.note}` : `Photo du ${when(e.taken_at)}`}
                        className="size-20 rounded-md border border-line object-cover"
                        loading="lazy"
                      />
                    </a>
                  ) : null}
                  <div className="min-w-0 flex-1 text-sm">
                    <div className="text-xs text-muted">
                      {when(e.taken_at)}
                      {e.author_name ? `, ${e.author_name}` : ""}
                      {e.latitude !== null && e.longitude !== null ? (
                        <>
                          {", "}
                          <a
                            className="link"
                            target="_blank"
                            rel="noreferrer"
                            href={`https://www.openstreetmap.org/?mlat=${e.latitude}&mlon=${e.longitude}#map=18/${e.latitude}/${e.longitude}`}
                          >
                            position
                          </a>
                        </>
                      ) : null}
                    </div>
                    {e.note ? <p className="whitespace-pre-line">{e.note}</p> : null}
                  </div>
                  {canEdit ? <DeleteJournal entryId={e.id} /> : null}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-sm text-muted">Aucune photo ni note pour l'instant.</p>
          )}
        </Section>

        <Section title="Réception des travaux" description="Procès-verbal signé sur place par le client et l'entreprise, puis suivi des réserves.">
          {rec.reception ? (
            <div className="space-y-4 text-sm">
              <p>
                Réception {DECISIONS[rec.reception.decision]} le {fmtDate(String(rec.reception.reception_date))}.{" "}
                <a className="link" href={`/api/jobs/${job.id}/reception`} target="_blank" rel="noreferrer">
                  Procès-verbal signé (PDF)
                </a>
              </p>
              {rec.reserves.length ? (
                <>
                  <ul className="divide-y divide-line">
                    {rec.reserves.map((r, i) => (
                      <li key={r.id} className="space-y-2 py-2">
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <span className="font-medium">
                            {i + 1}. {r.label}
                            {r.location ? <span className="font-normal text-muted">{` (${r.location})`}</span> : null}
                          </span>
                          <span className={`text-xs ${r.lifted_at ? "text-success" : "text-warning"}`}>
                            {r.lifted_at ? `Levée le ${fmtDate(r.lifted_at)}` : r.due_date ? `À lever avant le ${fmtDate(r.due_date)}` : "À lever"}
                          </span>
                        </div>
                        {r.lifted_at && r.lifted_note ? <p className="text-xs text-muted">{r.lifted_note}</p> : null}
                        {!r.lifted_at && canEdit ? <LiftReserveForm reserveId={r.id} label={r.label} /> : null}
                      </li>
                    ))}
                  </ul>
                  {rec.open === 0 ? (
                    <a className="btn-secondary" href={`/api/jobs/${job.id}/levee`} target="_blank" rel="noreferrer">
                      <Icon name="download" size={16} /> Procès-verbal de levée des réserves
                    </a>
                  ) : (
                    <p className="text-xs text-muted">
                      {rec.open} réserve{rec.open > 1 ? "s" : ""} encore à lever.
                    </p>
                  )}
                </>
              ) : null}
            </div>
          ) : canEdit ? (
            <ReceptionForm jobId={job.id} defaultPlace={job.site_city} defaultClient={job.customer_name ?? ""} defaultCompany={ctx.userName} />
          ) : (
            <p className="text-sm text-muted">Pas encore de réception.</p>
          )}
        </Section>
      </div>
    </div>
  );
}
