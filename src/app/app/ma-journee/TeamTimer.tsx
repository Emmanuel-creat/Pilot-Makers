"use client";

import { useActionState, useEffect, useState } from "react";
import { startTimerAction, stopTimerAction } from "@/app/actions";
import { Submit } from "@/components/forms/Submit";
import { Icon } from "@/components/Icon";
import type { TeamDictionary } from "@/lib/i18n/team";
import { formatMinutes } from "@/lib/services/timesheet-calc";

type Texts = Pick<TeamDictionary, "runningSince" | "noJob" | "job" | "note" | "notePlaceholder" | "start" | "stop" | "geo" | "started" | "stopped" | "saving">;

function Elapsed({ since }: { since: string }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);
  return <span className="tabular">{formatMinutes(Math.max(0, Math.floor((now - new Date(since).getTime()) / 60000)))}</span>;
}

/** Chronomètre de l'écran « Ma journée » : mêmes actions que le pointage, textes dans la langue de la personne. */
export function TeamTimer({
  t,
  running,
  jobs,
  canEdit,
}: {
  t: Texts;
  running: { since: string; startLabel: string; jobTitle: string } | null;
  jobs: { id: string; title: string }[];
  canEdit: boolean;
}) {
  const [startState, start] = useActionState(startTimerAction, null);
  const [stopState, stop] = useActionState(stopTimerAction, null);
  const [geo, setGeo] = useState(true);
  const [coords, setCoords] = useState({ lat: "", lng: "" });
  useEffect(() => {
    if (!geo || running || typeof navigator === "undefined" || !navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (p) => setCoords({ lat: p.coords.latitude.toFixed(5), lng: p.coords.longitude.toFixed(5) }),
      () => setCoords({ lat: "", lng: "" }),
      { timeout: 8000, maximumAge: 300_000 },
    );
  }, [geo, running]);
  // Les erreurs viennent du serveur en français ; les confirmations sont traduites.
  const message = (s: typeof startState, ok: string) =>
    s ? (
      <p role={s.ok ? "status" : "alert"} className={`text-sm ${s.ok ? "text-success" : "text-danger"}`}>
        {s.ok ? ok : s.message}
      </p>
    ) : null;

  if (running) {
    return (
      <section className="card space-y-4 p-5" aria-live="polite">
        <div>
          <p className="text-sm text-muted">
            {t.runningSince} {running.startLabel}
          </p>
          <p className="text-3xl font-semibold">
            <Elapsed since={running.since} />
          </p>
          <p className="mt-1">{running.jobTitle || t.noJob}</p>
        </div>
        {canEdit ? (
          <form action={stop} className="space-y-3">
            <div>
              <label className="label" htmlFor="tt-note">
                {t.note}
              </label>
              <input id="tt-note" name="note" className="field" maxLength={500} placeholder={t.notePlaceholder} />
            </div>
            <Submit className="btn-primary min-h-14 w-full text-lg" pendingLabel={t.saving}>
              <Icon name="check" /> {t.stop}
            </Submit>
            {message(stopState, t.stopped)}
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
            <label className="label" htmlFor="tt-job">
              {t.job}
            </label>
            <select id="tt-job" name="jobId" className="field" defaultValue={jobs[0]?.id ?? ""}>
              <option value="">{t.noJob}</option>
              {jobs.map((j) => (
                <option key={j.id} value={j.id}>
                  {j.title}
                </option>
              ))}
            </select>
          </div>
          <label className="flex min-h-6 items-center gap-2 text-sm">
            <input type="checkbox" className="h-4 w-4" checked={geo} onChange={(e) => setGeo(e.target.checked)} />
            {t.geo}
          </label>
          <input type="hidden" name="latitude" value={geo ? coords.lat : ""} />
          <input type="hidden" name="longitude" value={geo ? coords.lng : ""} />
          <Submit className="btn-primary min-h-14 w-full text-lg" pendingLabel={t.saving}>
            <Icon name="play" /> {t.start}
          </Submit>
          {message(startState, t.started)}
        </form>
      ) : null}
    </section>
  );
}
