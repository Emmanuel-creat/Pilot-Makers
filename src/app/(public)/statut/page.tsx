import { Icon } from "@/components/Icon";
import { getDb } from "@/lib/db";
import { LEVELS, serviceStatus, type Level } from "@/lib/services/status";

export const metadata = { title: "État du service" };
export const dynamic = "force-dynamic";

const TONE: Record<Level, { text: string; bg: string; icon: "check" | "alert" | "info" }> = {
  ok: { text: "text-success", bg: "border-success/30 bg-success-soft", icon: "check" },
  maintenance: { text: "text-accent", bg: "border-accent/30 bg-accent-soft", icon: "info" },
  perturbation: { text: "text-warning", bg: "border-warning/40 bg-warning-soft", icon: "alert" },
  panne: { text: "text-danger", bg: "border-danger/30 bg-danger-soft", icon: "alert" },
};
const when = (d: Date) => new Date(d).toLocaleString("fr-FR", { timeZone: "Europe/Paris", dateStyle: "long", timeStyle: "short" });

/** Page de statut publique : état mesuré à l'instant et incidents des 30 derniers jours. */
export default async function StatusPage() {
  const s = await serviceStatus(getDb);
  const t = TONE[s.overall];
  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="mb-2 text-2xl font-semibold">État du service</h1>
      <p className="mb-6 text-sm text-muted">Mesuré à l'ouverture de cette page, le {when(new Date(s.checkedAt))} (heure de Paris).</p>
      <div className={`mb-8 flex items-center gap-3 rounded-lg border p-4 ${t.bg}`} role="status">
        <Icon name={t.icon} className={t.text} />
        <p className="font-semibold">
          {s.overall === "ok" ? "Tous les services fonctionnent normalement." : `Service ${LEVELS[s.overall].toLowerCase()}.`}
        </p>
      </div>

      <h2 className="mb-3 text-lg font-semibold">Services</h2>
      <ul className="card mb-8 divide-y divide-line">
        {s.components.map((c) => (
          <li key={c.name} className="flex items-center justify-between gap-3 p-4 text-sm">
            <span>
              {c.name}
              {c.detail ? <span className="block text-xs text-muted">{c.detail}</span> : null}
            </span>
            <span className={`font-medium ${TONE[c.level].text}`}>{LEVELS[c.level]}</span>
          </li>
        ))}
      </ul>

      {s.active.length ? (
        <>
          <h2 className="mb-3 text-lg font-semibold">En cours ou prévu</h2>
          <IncidentList items={s.active} />
        </>
      ) : null}
      <h2 className="mb-3 text-lg font-semibold">30 derniers jours</h2>
      {s.resolved.length ? <IncidentList items={s.resolved} /> : <p className="text-sm text-muted">Aucun incident sur la période.</p>}
      <p className="mt-8 text-xs text-muted">
        Pour une sonde automatique, l'état est aussi disponible en JSON à l'adresse <code>/api/status</code>.
      </p>
    </div>
  );
}

function IncidentList({ items }: { items: Awaited<ReturnType<typeof serviceStatus>>["active"] }) {
  return (
    <ul className="mb-8 space-y-3">
      {items.map((i) => (
        <li key={i.id} className="card p-4 text-sm">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="font-semibold">{i.title}</h3>
            <span className={`text-xs font-medium ${TONE[i.severity].text}`}>{LEVELS[i.severity]}</span>
          </div>
          <p className="text-xs text-muted">
            Depuis le {when(i.started_at)}
            {i.resolved_at ? `, résolu le ${when(i.resolved_at)}` : ""}
          </p>
          {i.body ? <p className="mt-2 whitespace-pre-line">{i.body}</p> : null}
        </li>
      ))}
    </ul>
  );
}
