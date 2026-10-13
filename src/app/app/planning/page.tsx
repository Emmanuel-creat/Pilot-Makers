import Link from "next/link";
import { Icon } from "@/components/Icon";
import { Notice, PageHeader, Section } from "@/components/ui";
import { requirePageCtx } from "@/lib/server/session";
import { listResources, planning, plannableJobs } from "@/lib/services/planning";
import { addDays, mondayOf, monthRange, range } from "@/lib/services/planning-dates";
import { parisDate } from "@/lib/services/quotes";
import { AssignForm, PlanningGrid, SlotEditor, VehicleForm } from "./PlanningGrid";
import { getFeed } from "@/lib/services/calendar";
import { CalendarFeed } from "./CalendarFeed";

export const metadata = { title: "Planning" };

const fr = (iso: string) =>
  new Date(`${iso}T12:00:00Z`).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

export default async function PlanningPage({ searchParams }: { searchParams: Promise<{ vue?: string; date?: string }> }) {
  const sp = await searchParams;
  const ctx = await requirePageCtx();
  const month = sp.vue === "mois";
  const today = parisDate(new Date());
  const anchor = /^\d{4}-\d{2}-\d{2}$/.test(sp.date ?? "") ? sp.date! : today;
  const { from, to } = month ? monthRange(anchor) : { from: mondayOf(anchor), to: addDays(mondayOf(anchor), 6) };
  const [resources, slots, jobs, feed] = await Promise.all([listResources(ctx), planning(ctx, from, to), plannableJobs(ctx), getFeed(ctx)]);
  const canEdit = !ctx.entitlements.readOnly && !ctx.supportAccess;
  const prev = month ? monthRange(addDays(from, -1)).from : addDays(from, -7);
  const next = month ? addDays(to, 1) : addDays(from, 7);
  const link = (date: string, vue = month ? "mois" : "semaine") => `/app/planning?vue=${vue}&date=${date}`;
  const conflicts = slots.filter((s) => s.conflict);
  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader
        title="Planning"
        subtitle={month ? `${fr(from).replace(/^1 /, "")}` : `Semaine du ${fr(from)} au ${fr(to)}`}
        actions={
          <>
            <Link className="btn-secondary px-2" href={link(prev)} aria-label={month ? "Mois précédent" : "Semaine précédente"}>
              <Icon name="left" size={16} />
            </Link>
            <Link className="btn-secondary" href={link(today)}>
              Aujourd'hui
            </Link>
            <Link className="btn-secondary px-2" href={link(next)} aria-label={month ? "Mois suivant" : "Semaine suivante"}>
              <Icon name="right" size={16} />
            </Link>
            <Link className="btn-secondary" href={`/app/planning/trajets?jour=${anchor >= from && anchor <= to ? anchor : from}`}>
              <Icon name="truck" size={16} /> Trajets
            </Link>
            <Link className={month ? "btn-secondary" : "btn-primary"} href={link(from, "semaine")} aria-current={month ? undefined : "page"}>
              Semaine
            </Link>
            <Link className={month ? "btn-primary" : "btn-secondary"} href={link(from, "mois")} aria-current={month ? "page" : undefined}>
              Mois
            </Link>
          </>
        }
      />
      {conflicts.length ? (
        <div className="mb-4">
          <Notice tone="warning" title="Conflits de planning">
            {[...new Set(conflicts.map((c) => c.title))].join(", ")} : une même personne ou un même véhicule est prévu sur deux chantiers les mêmes
            jours.
          </Notice>
        </div>
      ) : null}
      {canEdit && jobs.length && resources.length ? (
        <section className="card mb-4 p-4">
          <AssignForm jobs={jobs} resources={resources} defaultStart={from > today ? from : today} />
        </section>
      ) : null}
      <PlanningGrid resources={resources} days={range(from, to)} slots={slots} canEdit={canEdit} />
      {canEdit ? (
        <p className="mt-2 text-xs text-muted">
          Glissez une affectation vers une autre case pour changer de jour ou de personne. Au clavier, utilisez la liste ci-dessous.
        </p>
      ) : null}
      <div className="mt-6 grid gap-6 lg:grid-cols-[2fr_1fr]">
        <Section title="Affectations de la période">
          {slots.length ? (
            <ul className="divide-y divide-line">
              {slots.map((s) => (
                <li key={s.id} className="space-y-2 py-2 text-sm">
                  <div className="flex flex-wrap justify-between gap-2">
                    <Link href={`/app/chantiers/${s.jobId}`} className="link font-medium">
                      {s.title}
                    </Link>
                    <span className={s.conflict ? "text-danger" : "text-muted"}>
                      {resources.find((r) => r.type === s.resourceType && r.id === s.resourceId)?.name ?? "?"}, du {fr(s.start)} au {fr(s.end)}
                      {s.conflict ? " (conflit)" : ""}
                    </span>
                  </div>
                  {canEdit ? <SlotEditor slot={s} resources={resources} /> : null}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted">Aucune affectation sur la période.</p>
          )}
        </Section>
        <Section title="Véhicules">{canEdit ? <VehicleForm vehicles={resources.filter((r) => r.type === "vehicle")} /> : null}</Section>
        <Section
          title="Abonnement d'agenda"
          description="Retrouvez le planning dans Google Agenda, Outlook ou l'agenda de l'iPhone, mis à jour tout seul."
        >
          <CalendarFeed
            feed={
              feed
                ? {
                    prefix: feed.prefix,
                    scope: feed.scope,
                    lastUsed: feed.last_used_at
                      ? new Date(feed.last_used_at).toLocaleString("fr-FR", { timeZone: "Europe/Paris", dateStyle: "short", timeStyle: "short" })
                      : null,
                  }
                : null
            }
            canChooseCompany={ctx.role !== "member"}
            canEdit={canEdit}
          />
        </Section>
      </div>
    </div>
  );
}
