import Link from "next/link";
import { requirePageCtx } from "@/lib/server/session";
import { parisDate } from "@/lib/services/quotes";
import { pointableJobs, runningEntry } from "@/lib/services/timesheets";
import { todaySummary } from "@/lib/services/today";
import { watchAlerts } from "@/lib/watch";
import { WatchTimer } from "./WatchTimer";

export const dynamic = "force-dynamic";
export const metadata = { title: "Montre", robots: { index: false } };

/** Écran pour montre connectée : pointage en un appui et trois alertes au plus, lisibles sur un petit cadran. */
export default async function WatchPage() {
  const ctx = await requirePageCtx();
  const [running, jobs, today] = await Promise.all([runningEntry(ctx), pointableJobs(ctx, parisDate(new Date())), todaySummary(ctx)]);
  const planned = jobs.filter((j) => j.planned);
  const target = planned[0] ?? null;
  const alerts = watchAlerts({ quotes: today.quotes.items, running: !!running, plannedJobs: planned.length });
  const canEdit = !ctx.entitlements.readOnly && !ctx.supportAccess;
  return (
    <main className="mx-auto flex min-h-screen max-w-56 flex-col gap-3 bg-bg p-2 text-center text-ink">
      <h1 className="sr-only">Montre</h1>
      <WatchTimer
        canEdit={canEdit}
        running={running ? { since: new Date(running.started_at!).toISOString(), jobTitle: running.job_title ?? "" } : null}
        job={target ? { id: target.id, title: target.title } : null}
      />
      <section aria-labelledby="montre-alertes">
        <h2 id="montre-alertes" className="text-xs text-muted">
          {alerts.length ? `${alerts.length} alerte${alerts.length > 1 ? "s" : ""}` : "Aucune alerte"}
        </h2>
        <ul className="mt-1 space-y-1 text-sm" data-testid="montre-alertes">
          {alerts.map((a) => (
            <li key={a} className="rounded-md bg-surface-2 px-2 py-1">
              {a}
            </li>
          ))}
        </ul>
      </section>
      <Link href="/app/aujourdhui" className="link text-xs">
        Ouvrir sur le téléphone
      </Link>
    </main>
  );
}
