import Link from "next/link";
import { notFound } from "next/navigation";
import { Icon } from "@/components/Icon";
import { Notice, PageHeader, Section, fmtDate } from "@/components/ui";
import { JobLocation } from "./JobLocation";
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
import { jobCosts, listPurchases, PURCHASE_CATEGORIES } from "@/lib/services/job-costs";
import { parisDate } from "@/lib/services/quotes";
import { DeletePurchase, PurchaseForm, ThresholdForm } from "./CostForms";
import { listOrders, ORDER_STATUSES } from "@/lib/services/purchase-orders";
import { PrepareOrders } from "./OrderForms";
import { jobSubcontractors, listSubcontractors } from "@/lib/services/subcontractors";
import { JobSubcontractorForm, RemoveJobSubcontractor } from "../../sous-traitants/SubForms";
import { StatusBadge } from "../../sous-traitants/StatusBadge";
import { can } from "@/lib/services/context";
import { publishedJournalIds } from "@/lib/services/showcase";
import { PublishPhoto } from "./PublishPhoto";
import { getWarranty } from "@/lib/services/warranties";
import { WarrantySummary } from "../garanties/WarrantySummary";
import { listJobMessages } from "@/lib/services/job-chat";
import { deleteJobMessageAction } from "@/app/actions";
import { JobMessageForm } from "./JobChat";

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
  const [journal, rec, hours, published, warranty, messages] = await Promise.all([
    listJournal(ctx, id),
    getReception(ctx, id),
    jobHours(ctx, id),
    publishedJournalIds(ctx, id),
    getWarranty(ctx, id),
    listJobMessages(ctx, id),
  ]);
  const canEdit = !ctx.entitlements.readOnly && !ctx.supportAccess;
  const costsAllowed = can(ctx, "costs");
  const showCosts = costsAllowed && !!ctx.entitlements.plan.features.margin;
  const [costs, purchases] = showCosts ? await Promise.all([jobCosts(ctx, id), listPurchases(ctx, id)]) : [null, []];
  const orders = costsAllowed ? await listOrders(ctx, id) : null;
  const [subs, allSubs] = costsAllowed ? await Promise.all([jobSubcontractors(ctx, id), listSubcontractors(ctx)]) : [null, []];
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
            <a className="btn-secondary" href={`https://www.openstreetmap.org/search?query=${encodeURIComponent(address)}`} target="_blank" rel="noreferrer">
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
            {costsAllowed && hours.costCents ? `, coût ${formatEuros(hours.costCents)}` : ""}
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
          <div className="mt-4 border-t border-line pt-4">
            <h3 className="mb-2 text-sm font-semibold">Emplacement</h3>
            <JobLocation jobId={job.id} located={job.latitude !== null} source={job.geo_source} label={job.geo_label} canEdit={canEdit} />
          </div>
        </Section>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div id="messages" className="scroll-mt-4 lg:col-span-2">
          <Section
            title="Messages de l'équipe"
            description="Consignes et questions entre le bureau et le chantier. Les personnes affectées au chantier sont prévenues sur leur téléphone."
          >
            {messages.length ? (
              <ol className="mb-4 space-y-2" aria-label="Messages du chantier">
                {messages.map((m) => (
                  <li key={m.id} className={`flex ${m.mine ? "justify-end" : ""}`}>
                    <div className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${m.mine ? "bg-accent-soft" : "bg-surface-2"}`}>
                      <div className="text-xs text-muted">
                        {m.mine ? "Vous" : m.authorName}, {when(m.createdAt)}
                      </div>
                      <p className="whitespace-pre-line break-words">{m.body}</p>
                      {canEdit && (m.mine || can(ctx, "settings")) ? (
                        <form action={deleteJobMessageAction}>
                          <input type="hidden" name="id" value={m.id} />
                          <input type="hidden" name="jobId" value={job.id} />
                          <button className="link inline-flex min-h-6 items-center text-xs text-danger">Retirer</button>
                        </form>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="mb-4 text-sm text-muted">Aucun message pour l&apos;instant.</p>
            )}
            {canEdit ? <JobMessageForm jobId={job.id} /> : null}
          </Section>
        </div>
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
                    {e.has_photo && canEdit && can(ctx, "settings") ? (
                      <PublishPhoto jobId={job.id} entryId={e.id} published={published.has(e.id)} defaultCaption={e.note} />
                    ) : null}
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
              {warranty ? (
                <div className="border-t border-line pt-4">
                  <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                    <h3 className="font-medium">Garanties</h3>
                    <Link className="link text-xs" href="/app/chantiers/garanties">
                      Tous les chantiers
                    </Link>
                  </div>
                  <WarrantySummary w={warranty} canEdit={canEdit} />
                </div>
              ) : null}
            </div>
          ) : canEdit ? (
            <ReceptionForm jobId={job.id} defaultPlace={job.site_city} defaultClient={job.customer_name ?? ""} defaultCompany={ctx.userName} />
          ) : (
            <p className="text-sm text-muted">Pas encore de réception.</p>
          )}
        </Section>
      </div>
      {costs ? (
        <div className="mt-6">
          <Section title="Coûts et marge" description="Achats affectés et heures pointées, comparés aux coûts prévus au devis.">
            {costs.alert !== "none" ? (
              <div className="mb-4">
                <Notice tone={costs.alert === "over" ? "danger" : "warning"} title={costs.alert === "over" ? "Budget dépassé" : "Budget presque consommé"}>
                  {pct(costs.consumedBp ?? 0)} % du coût prévu est déjà dépensé, pour un avancement de {pct(costs.progressBp)} %.
                </Notice>
              </div>
            ) : null}
            {!costs.hasPlannedCosts ? (
              <p className="mb-3 text-sm text-muted">Les lignes du devis n'avaient pas de coût d'achat : seul le réel est suivi.</p>
            ) : null}
            <div className="overflow-x-auto" tabIndex={0} role="region" aria-label="Coûts prévus et réels">
              <table className="w-full text-sm">
                <thead className="table-head">
                  <tr>
                    <th className="px-3 py-2"></th>
                    <th className="px-3 py-2 text-right">Prévu</th>
                    <th className="px-3 py-2 text-right">Réel</th>
                    <th className="px-3 py-2 text-right">Écart</th>
                  </tr>
                </thead>
                <tbody>
                  {(
                    [
                      ["Main-d'oeuvre", costs.planned.laborCents, costs.real.laborCents, `${formatMinutes(costs.real.laborMinutes)} pointées`],
                      ["Achats", costs.planned.purchasesCents, costs.real.purchasesCents, ""],
                      ["Coût total", costs.planned.totalCents, costs.real.totalCents, ""],
                    ] as const
                  ).map(([label, planned, real, note]) => (
                    <tr key={label} className="border-b border-line">
                      <td className="px-3 py-2">
                        {label}
                        {note ? <span className="block text-xs text-muted">{note}</span> : null}
                      </td>
                      <td className="tabular px-3 py-2 text-right">{formatEuros(planned)}</td>
                      <td className="tabular px-3 py-2 text-right">{formatEuros(real)}</td>
                      <td className={`tabular px-3 py-2 text-right ${real > planned ? "text-danger" : ""}`}>{formatEuros(planned - real)}</td>
                    </tr>
                  ))}
                  <tr className="font-semibold">
                    <td className="px-3 py-2">Marge (vendu {formatEuros(costs.soldCents)} HT)</td>
                    <td className="tabular px-3 py-2 text-right">{formatEuros(costs.planned.marginCents)}</td>
                    <td className={`tabular px-3 py-2 text-right ${costs.real.marginCents < costs.planned.marginCents ? "text-danger" : "text-success"}`}>
                      {formatEuros(costs.real.marginCents)}
                    </td>
                    <td className="tabular px-3 py-2 text-right">{formatEuros(costs.real.marginCents - costs.planned.marginCents)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <details className="mt-4">
              <summary className="cursor-pointer text-sm font-medium">Détail ligne par ligne</summary>
              <div className="mt-2 overflow-x-auto" tabIndex={0} role="region" aria-label="Coûts par ligne du devis">
                <table className="w-full text-sm">
                  <thead className="table-head">
                    <tr>
                      <th className="px-3 py-2">Ligne</th>
                      <th className="px-3 py-2 text-right">Vendu HT</th>
                      <th className="px-3 py-2 text-right">Coût prévu</th>
                      <th className="px-3 py-2 text-right">Achats affectés</th>
                      <th className="px-3 py-2 text-right">Écart</th>
                    </tr>
                  </thead>
                  <tbody>
                    {costs.tasks.map((t) => (
                      <tr key={t.id} className="border-b border-line last:border-0">
                        <td className="px-3 py-2">
                          {t.label}
                          {t.nature === "main_oeuvre" ? <span className="block text-xs text-muted">Main-d'oeuvre : suivie par les heures pointées</span> : null}
                        </td>
                        <td className="tabular px-3 py-2 text-right">{formatEuros(t.soldCents)}</td>
                        <td className="tabular px-3 py-2 text-right">{t.plannedCostCents === null ? "" : formatEuros(t.plannedCostCents)}</td>
                        <td className="tabular px-3 py-2 text-right">{t.realPurchasesCents ? formatEuros(t.realPurchasesCents) : ""}</td>
                        <td className={`tabular px-3 py-2 text-right ${t.gapCents !== null && t.gapCents < 0 ? "text-danger" : ""}`}>
                          {t.gapCents === null ? "" : formatEuros(t.gapCents)}
                        </td>
                      </tr>
                    ))}
                    {costs.unassignedPurchasesCents ? (
                      <tr>
                        <td className="px-3 py-2">Achats pour le chantier en général</td>
                        <td></td>
                        <td></td>
                        <td className="tabular px-3 py-2 text-right">{formatEuros(costs.unassignedPurchasesCents)}</td>
                        <td></td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </details>
            <div className="mt-6 grid gap-6 lg:grid-cols-2">
              <div>
                <h3 className="mb-2 text-sm font-semibold">Achats</h3>
                {purchases.length ? (
                  <ul className="divide-y divide-line text-sm">
                    {purchases.map((p) => (
                      <li key={p.id} className="flex items-center justify-between gap-2 py-2">
                        <div className="min-w-0">
                          <div className="truncate">{p.label}</div>
                          <div className="text-xs text-muted">
                            {fmtDate(p.purchase_date)} · {PURCHASE_CATEGORIES[p.category]}
                            {p.supplier ? ` · ${p.supplier}` : ""}
                            {p.task_label ? ` · ${p.task_label}` : ""}
                            {p.reference ? ` · ${p.reference}` : ""}
                          </div>
                        </div>
                        <span className="flex shrink-0 items-center gap-1">
                          <span className="tabular">{formatEuros(p.amount_ht_cents)}</span>
                          {canEdit ? <DeletePurchase id={p.id} label={p.label} /> : null}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-muted">Aucun achat pour l'instant.</p>
                )}
                {canEdit ? (
                  <div className="mt-4">
                    <ThresholdForm jobId={job.id} percent={Math.round(costs.thresholdBp / 100)} />
                  </div>
                ) : null}
              </div>
              {canEdit ? (
                <PurchaseForm
                  jobId={job.id}
                  categories={PURCHASE_CATEGORIES}
                  today={parisDate(new Date())}
                  tasks={costs.tasks.filter((t) => t.nature !== "main_oeuvre").map((t) => ({ id: t.id, label: t.label }))}
                />
              ) : null}
            </div>
          </Section>
        </div>
      ) : null}
      {orders ? (
        <div className="mt-6">
          <Section title="Commandes fournisseurs" description="Fournitures et sous-traitance du devis, commandées, reçues puis rapprochées de la facture.">
            {orders.length ? (
              <ul className="mb-4 divide-y divide-line text-sm">
                {orders.map((o) => (
                  <li key={o.id}>
                    <Link href={`/app/chantiers/${job.id}/commandes/${o.id}`} className="flex items-center justify-between gap-2 py-2 hover:bg-surface-2">
                      <span className="min-w-0">
                        <span className="font-medium">{o.number}</span>
                        <span className="block truncate text-xs text-muted">
                          {o.supplier || "Fournisseur à préciser"} · {ORDER_STATUSES[o.status]}
                        </span>
                      </span>
                      <span className="tabular shrink-0">{formatEuros(o.total_cents)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mb-4 text-sm text-muted">Aucune commande pour ce chantier.</p>
            )}
            {canEdit ? <PrepareOrders jobId={job.id} hasQuote={!!job.quote_id} /> : null}
          </Section>
        </div>
      ) : null}
      {subs ? (
        <div className="mt-6">
          <Section title="Sous-traitants" description="Entreprises intervenant sur ce chantier et état de leurs documents.">
            {subs.some((s) => s.vigilance && s.compliance.status !== "valide") ? (
              <div className="mb-4">
                <Notice tone="danger" title="Obligation de vigilance">
                  Un marché d'au moins 5 000 euros HT impose une attestation URSSAF de moins de six mois : réclamez les documents manquants avant le démarrage.
                </Notice>
              </div>
            ) : null}
            {subs.length ? (
              <ul className="mb-4 divide-y divide-line text-sm">
                {subs.map((s) => (
                  <li key={s.id} className="flex items-center justify-between gap-2 py-2">
                    <span className="min-w-0">
                      <Link className="link" href={`/app/sous-traitants/${s.id}`}>
                        {s.name}
                      </Link>
                      <span className="block truncate text-xs text-muted">
                        {[s.scope || s.trade, s.amount_ht_cents ? `${formatEuros(s.amount_ht_cents)} HT` : ""].filter(Boolean).join(" · ")}
                      </span>
                    </span>
                    <span className="flex shrink-0 items-center gap-1">
                      <StatusBadge status={s.compliance.status} />
                      {canEdit ? <RemoveJobSubcontractor jobId={job.id} subId={s.id} name={s.name} /> : null}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mb-4 text-sm text-muted">Aucun sous-traitant sur ce chantier.</p>
            )}
            {canEdit ? (
              allSubs.length ? (
                <JobSubcontractorForm jobId={job.id} subs={allSubs.map((s) => ({ id: s.id, name: s.name }))} />
              ) : (
                <Link className="btn-secondary" href="/app/sous-traitants">
                  Créer une fiche sous-traitant
                </Link>
              )
            ) : null}
          </Section>
        </div>
      ) : null}
    </div>
  );
}
