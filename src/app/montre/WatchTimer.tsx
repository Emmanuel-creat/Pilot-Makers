"use client";

import { useActionState, useEffect, useState } from "react";
import { startTimerAction, stopTimerAction } from "@/app/actions";
import { watchDuration } from "@/lib/watch";

/** Gros bouton unique : pointer sur le chantier du jour, puis arrêter. */
export function WatchTimer({
  running,
  job,
  canEdit,
}: {
  running: { since: string; jobTitle: string } | null;
  job: { id: string; title: string } | null;
  canEdit: boolean;
}) {
  const [startState, start] = useActionState(startTimerAction, null);
  const [stopState, stop] = useActionState(stopTimerAction, null);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);
  const error = (running ? stopState : startState)?.error;

  if (running) {
    return (
      <section aria-live="polite" className="space-y-2">
        <p className="text-3xl font-semibold tabular-nums" data-testid="montre-duree">
          {watchDuration((now - new Date(running.since).getTime()) / 60000)}
        </p>
        <p className="truncate text-sm">{running.jobTitle || "Sans chantier"}</p>
        {canEdit ? (
          <form action={stop}>
            <button className="btn-danger min-h-16 w-full rounded-full text-lg">Arrêter</button>
          </form>
        ) : null}
        {error ? <p className="text-xs text-danger">{error}</p> : null}
      </section>
    );
  }
  return (
    <section aria-live="polite" className="space-y-2">
      <p className="truncate text-sm">{job ? job.title : "Aucun chantier planifié"}</p>
      {canEdit ? (
        <form action={start}>
          {job ? <input type="hidden" name="jobId" value={job.id} /> : null}
          <button className="btn-primary min-h-16 w-full rounded-full text-lg">Pointer</button>
        </form>
      ) : null}
      {error ? <p className="text-xs text-danger">{error}</p> : null}
    </section>
  );
}
