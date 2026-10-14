import Link from "next/link";
import { Notice, PageHeader, fmtDate } from "@/components/ui";
import { WATCH_AREAS, daysUntil } from "@/lib/regulatory-watch";
import { requirePageCtx } from "@/lib/server/session";
import { regulatoryWatch } from "@/lib/services/regulatory-watch";
import { MarkRead } from "./MarkRead";

export const metadata = { title: "Veille réglementaire" };

export default async function WatchPage() {
  const ctx = await requirePageCtx();
  const w = await regulatoryWatch(ctx);
  const writable = !ctx.entitlements.readOnly && !ctx.supportAccess;
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Veille réglementaire"
        subtitle="Les évolutions qui touchent vos devis et factures, leur date d'entrée en vigueur et ce qu'il faut faire."
        actions={writable && w.alerts.length > 1 ? <MarkRead id="tout" label="Tout marquer comme lu" /> : null}
      />
      <div className="space-y-4">
        {w.entries.map((e) => {
          const d = daysUntil(e.effective, w.today);
          const alert = w.alerts.includes(e.id);
          return (
            <article key={e.id} className={`card space-y-2 p-5 ${alert ? "border-warning/60" : ""}`} data-testid="veille-entree">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="text-xs uppercase tracking-wide text-muted">{WATCH_AREAS[e.area]}</p>
                <p className={`text-sm ${d > 0 && d <= 120 ? "text-warning" : "text-muted"}`}>
                  {d > 0 ? `En vigueur le ${fmtDate(e.effective)}, dans ${d} jour${d > 1 ? "s" : ""}` : `En vigueur depuis le ${fmtDate(e.effective)}`}
                </p>
              </div>
              <h2 className="text-lg font-semibold">
                {e.title}
                {alert ? <span className="ml-2 rounded bg-warning-soft px-2 py-0.5 align-middle text-xs font-medium text-warning">À lire</span> : null}
              </h2>
              <p className="text-sm">{e.summary}</p>
              <p className="text-sm">
                <span className="font-medium">À faire : </span>
                {e.action}
              </p>
              <p className="text-xs text-muted">Source : {e.source}</p>
              <div className="flex flex-wrap items-center gap-3">
                {e.href ? (
                  <Link href={e.href} className="link text-sm">
                    En savoir plus
                  </Link>
                ) : null}
                {alert && writable ? <MarkRead id={e.id} label="Marquer comme lu" /> : null}
              </div>
            </article>
          );
        })}
        <Notice tone="info">Ces informations aident à vous organiser. Faites valider votre situation par votre expert-comptable ou votre conseil.</Notice>
      </div>
    </div>
  );
}
