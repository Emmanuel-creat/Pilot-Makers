import type { TimelineItem } from "@/lib/home-record";
import { ENTRY_KINDS } from "@/lib/home-record";
import type { ReactNode } from "react";

export const frDate = (iso: string) =>
  new Date(`${iso}T12:00:00Z`).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

/** Frise du carnet de logement, commune à la page interne et au lien de transmission. */
export function HomeTimeline({ items, action }: { items: TimelineItem[]; action?: (item: TimelineItem) => ReactNode }) {
  return (
    <ol className="space-y-3 border-l-2 border-border pl-4 text-sm" data-testid="frise-logement">
      {items.map((it) => (
        <li key={it.type === "chantier" ? `j${it.job.id}` : `e${it.entry.id}`} className="relative">
          <span className="absolute -left-[1.4rem] top-1.5 h-2.5 w-2.5 rounded-full bg-accent" aria-hidden="true" />
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <p className="text-xs text-muted">
                {frDate(it.date)},{" "}
                {it.type === "chantier" ? (it.job.receptionDate ? "chantier réceptionné" : "chantier") : ENTRY_KINDS[it.entry.kind].toLowerCase()}
              </p>
              <p className="font-medium">{it.type === "chantier" ? it.job.title : it.entry.label}</p>
              {it.type === "entree" ? (
                <>
                  {it.entry.source ? <p className="text-muted">Écrit par {it.entry.source}</p> : null}
                  {it.entry.brand ? <p className="text-muted">Marque et modèle : {it.entry.brand}</p> : null}
                  {it.entry.detail ? <p className="whitespace-pre-line text-muted">{it.entry.detail}</p> : null}
                  {it.entry.maintenanceMonths ? <p className="text-muted">Entretien conseillé tous les {it.entry.maintenanceMonths} mois</p> : null}
                </>
              ) : it.warranties.length ? (
                <p className="text-muted">{it.warranties.map((w) => `${w.label} jusqu'au ${frDate(w.end)}`).join(", ")}</p>
              ) : null}
            </div>
            {action ? action(it) : null}
          </div>
        </li>
      ))}
    </ol>
  );
}
