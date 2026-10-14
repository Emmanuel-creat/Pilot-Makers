import Link from "next/link";
import { PageHeader, Section } from "@/components/ui";
import { DISTANCE_BANDS, osmUrl, project } from "@/lib/map";
import { requirePageCtx } from "@/lib/server/session";
import { JOB_STATUSES } from "@/lib/services/jobs-labels";
import { mapData } from "@/lib/services/map";
import { LocateButton } from "./LocateButton";

export const metadata = { title: "Carte" };

const W = 800;
const H = 520;
const VIEWS = { tout: "Tout", chantiers: "Chantiers", clients: "Clients" } as const;
const FILL: Record<string, string> = {
  a_planifier: "var(--color-warning)",
  en_cours: "var(--color-accent)",
  termine: "var(--color-success)",
  receptionne: "var(--color-muted)",
  client: "var(--color-danger)",
};

export default async function MapPage({ searchParams }: { searchParams: Promise<{ vue?: string }> }) {
  const ctx = await requirePageCtx();
  const sp = await searchParams;
  const view = (sp.vue && sp.vue in VIEWS ? sp.vue : "tout") as keyof typeof VIEWS;
  const d = await mapData(ctx);
  const places = d.places.filter((p) => view === "tout" || (view === "chantiers" ? p.kind === "chantier" : p.kind === "client"));
  const pts = project([...(d.depot ? [d.depot.point] : []), ...places.map((p) => p.point)], W, H);
  const depotXY = d.depot ? pts[0] : null;
  const xy = d.depot ? pts.slice(1) : pts;
  const writable = !ctx.entitlements.readOnly && !ctx.supportAccess;
  const missing = d.missing.jobs + d.missing.customers;
  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title="Carte des chantiers et des clients" subtitle="Où vous intervenez, d'après les adresses localisées des chantiers et des clients." />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
        <Section
          title={`${places.length} lieu${places.length > 1 ? "x" : ""} sur la carte`}
          actions={
            <nav className="flex gap-1 text-sm" aria-label="Filtrer la carte">
              {Object.entries(VIEWS).map(([k, label]) => (
                <Link
                  key={k}
                  href={k === "tout" ? "/app/carte" : `/app/carte?vue=${k}`}
                  className={k === view ? "btn-primary" : "btn-ghost"}
                  aria-current={k === view ? "page" : undefined}
                >
                  {label}
                </Link>
              ))}
            </nav>
          }
        >
          {places.length || d.depot ? (
            <svg
              viewBox={`0 0 ${W} ${H}`}
              className="h-auto w-full rounded-md border border-line bg-surface-2"
              role="group"
              aria-label={`Carte de ${places.length} lieux`}
              data-testid="carte"
            >
              {depotXY ? (
                <g>
                  <title>Dépôt de l&apos;entreprise</title>
                  <rect x={depotXY.x - 7} y={depotXY.y - 7} width={14} height={14} fill="var(--color-ink)" />
                </g>
              ) : null}
              {places.map((p, i) => (
                <a key={`${p.kind}-${p.id}`} href={p.kind === "chantier" ? `/app/chantiers/${p.id}` : `/app/clients/${p.id}`}>
                  <title>{`${p.kind === "chantier" ? "Chantier" : "Client"} : ${p.name}${p.detail ? `, ${p.detail}` : ""}`}</title>
                  <circle
                    cx={xy[i].x}
                    cy={xy[i].y}
                    r={7}
                    fill={FILL[p.kind === "client" ? "client" : (p.status ?? "en_cours")]}
                    stroke="var(--color-surface)"
                    strokeWidth={2}
                  />
                </a>
              ))}
            </svg>
          ) : (
            <p className="text-sm text-muted">Aucun lieu localisé pour l&apos;instant.</p>
          )}
          <ul className="mt-3 flex flex-wrap gap-4 text-xs text-muted">
            {Object.entries(JOB_STATUSES).map(([k, label]) => (
              <li key={k} className="flex items-center gap-1.5">
                <svg width="10" height="10" aria-hidden="true">
                  <circle cx="5" cy="5" r="5" fill={FILL[k]} />
                </svg>
                Chantier {label.toLowerCase()}
              </li>
            ))}
            <li className="flex items-center gap-1.5">
              <svg width="10" height="10" aria-hidden="true">
                <circle cx="5" cy="5" r="5" fill={FILL.client} />
              </svg>
              Client
            </li>
            <li className="flex items-center gap-1.5">
              <svg width="10" height="10" aria-hidden="true">
                <rect width="10" height="10" fill="currentColor" />
              </svg>
              Dépôt
            </li>
          </ul>
        </Section>
        <aside className="h-fit space-y-4">
          <section className="card p-4 text-sm">
            <h2 className="mb-2 font-semibold">Adresses à localiser</h2>
            <p className="mb-3 text-muted">
              {missing
                ? `${d.missing.jobs} chantier${d.missing.jobs > 1 ? "s" : ""} et ${d.missing.customers} client${d.missing.customers > 1 ? "s" : ""} sans position.`
                : "Toutes les adresses connues sont localisées."}
            </p>
            {writable && (missing || !d.depot) ? <LocateButton /> : null}
          </section>
          {d.bands ? (
            <section className="card p-4 text-sm">
              <h2 className="mb-2 font-semibold">Distance des chantiers au dépôt</h2>
              <table className="w-full">
                <tbody>
                  {DISTANCE_BANDS.map((b, i) => (
                    <tr key={b.label}>
                      <th scope="row" className="py-1 text-left font-normal">
                        {b.label}
                      </th>
                      <td className="py-1 text-right tabular">{d.bands![i]}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          ) : null}
          {places.length ? (
            <section className="card p-4 text-sm">
              <h2 className="mb-2 font-semibold">Lieux</h2>
              <ul className="max-h-80 space-y-2 overflow-y-auto">
                {places.map((p) => (
                  <li key={`${p.kind}-${p.id}`} className="min-w-0">
                    <Link href={p.kind === "chantier" ? `/app/chantiers/${p.id}` : `/app/clients/${p.id}`} className="link font-medium">
                      {p.name}
                    </Link>
                    <div className="text-xs text-muted">
                      {p.kind === "chantier" ? `Chantier ${JOB_STATUSES[p.status ?? "en_cours"].toLowerCase()}` : "Client"}
                      {p.detail ? ` · ${p.detail}` : ""} ·{" "}
                      <a href={osmUrl(p.point)} className="underline" target="_blank" rel="noreferrer">
                        plan<span className="sr-only"> de {p.name} sur OpenStreetMap</span>
                      </a>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </aside>
      </div>
    </div>
  );
}
