import Link from "next/link";
import { notFound } from "next/navigation";
import { Icon } from "@/components/Icon";
import { PageHeader, Section } from "@/components/ui";
import { HttpError } from "@/lib/http";
import { requirePageCtx } from "@/lib/server/session";
import { getJob, JOB_STATUSES } from "@/lib/services/jobs";
import { pct } from "@/lib/services/jobs-labels";
import { AddTaskForm, DeleteTask, JobInfoForm, TaskProgress } from "./JobForms";

export const metadata = { title: "Chantier" };

export default async function JobPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requirePageCtx();
  const data = await getJob(ctx, id).catch((e) => {
    if (e instanceof HttpError && e.status === 404) notFound();
    throw e;
  });
  const { job, sections, progressBp } = data;
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
    </div>
  );
}
