import Link from "next/link";
import { locateMissingAction } from "@/app/actions";
import { ActionForm } from "@/components/forms/ActionForm";
import { Submit } from "@/components/forms/Submit";
import { Icon } from "@/components/Icon";
import { Notice, PageHeader } from "@/components/ui";
import { requirePageCtx } from "@/lib/server/session";
import { addDays } from "@/lib/services/planning-dates";
import { parisDate } from "@/lib/services/quotes";
import { dayRoutes, formatMinutes } from "@/lib/services/routes";

export const metadata = { title: "Trajets du jour" };

const fr = (iso: string) =>
  new Date(`${iso}T12:00:00Z`).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
const km = (v: number) => `${String(v).replace(".", ",")} km`;

/** Tournée de chaque personne pour la journée : ordre conseillé, distances et temps de trajet estimés. */
export default async function RoutesPage({ searchParams }: { searchParams: Promise<{ jour?: string }> }) {
  const sp = await searchParams;
  const ctx = await requirePageCtx();
  const day = /^\d{4}-\d{2}-\d{2}$/.test(sp.jour ?? "") ? sp.jour! : parisDate(new Date());
  const { depot, routes } = await dayRoutes(ctx, day);
  const canEdit = !ctx.entitlements.readOnly && !ctx.supportAccess;
  const unlocated = routes.reduce((n, r) => n + r.unlocated, 0);
  const link = (d: string) => `/app/planning/trajets?jour=${d}`;
  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title="Trajets du jour"
        subtitle={fr(day)}
        back={{ href: `/app/planning?date=${day}`, label: "Planning" }}
        actions={
          <>
            <Link className="btn-secondary px-2" href={link(addDays(day, -1))} aria-label="Jour précédent">
              <Icon name="left" size={16} />
            </Link>
            <Link className="btn-secondary" href={link(parisDate(new Date()))}>
              Aujourd'hui
            </Link>
            <Link className="btn-secondary px-2" href={link(addDays(day, 1))} aria-label="Jour suivant">
              <Icon name="right" size={16} />
            </Link>
          </>
        }
      />
      <p className="mb-4 text-sm text-muted">
        Distances et durées estimées depuis le dépôt, détours routiers compris. L'ordre proposé va toujours au chantier le plus proche ; le lien ouvre
        l'itinéraire exact dans votre application de navigation.
      </p>
      {!depot ? (
        <div className="mb-4">
          <Notice tone="info" title="Dépôt non localisé">
            L'adresse de l'entreprise sert de point de départ et d'arrivée. Elle sera localisée avec les chantiers.
          </Notice>
        </div>
      ) : null}
      {canEdit && (unlocated || !depot) && routes.length ? (
        <ActionForm action={locateMissingAction} className="mb-6 space-y-2">
          <input type="hidden" name="date" value={day} />
          <Submit className="btn-secondary" pendingLabel="Localisation...">
            <Icon name="pin" size={16} /> Localiser les adresses manquantes
          </Submit>
        </ActionForm>
      ) : null}
      {routes.length === 0 ? <p className="card p-5 text-sm text-muted">Personne n'est affecté à un chantier ce jour-là.</p> : null}
      <div className="space-y-4">
        {routes.map((r) => (
          <section key={r.userId} className="card p-5" aria-labelledby={`t-${r.userId}`}>
            <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
              <div>
                <h2 id={`t-${r.userId}`} className="font-semibold">
                  {r.name}
                </h2>
                <p className="text-sm text-muted">
                  {r.stops.length} chantier(s) · {km(r.totalKm)} · {formatMinutes(r.totalMinutes)} de route
                  {r.unlocated ? ` (hors ${r.unlocated} chantier(s) non localisé(s))` : ""}
                </p>
              </div>
              {r.mapsUrl ? (
                <a className="btn-primary" href={r.mapsUrl} target="_blank" rel="noreferrer">
                  <Icon name="truck" size={16} /> Ouvrir l'itinéraire
                </a>
              ) : null}
            </div>
            <ol className="space-y-2 text-sm">
              {depot ? <li className="text-muted">Départ du dépôt : {depot.address}</li> : null}
              {r.stops.map((s, i) => (
                <li key={s.jobId} className="flex flex-wrap items-baseline justify-between gap-2 rounded-md border border-line p-2">
                  <span>
                    <span className="mr-2 font-semibold tabular">{i + 1}.</span>
                    <Link className="link" href={`/app/chantiers/${s.jobId}`}>
                      {s.title}
                    </Link>
                    <span className="block text-xs text-muted">{s.address || "Adresse non renseignée"}</span>
                  </span>
                  <span className="text-xs tabular text-muted">
                    {s.km !== null ? `${km(s.km)} · ${formatMinutes(s.minutes!)}` : s.point ? "Point de départ" : "Non localisé"}
                  </span>
                </li>
              ))}
              {r.returnKm !== null ? (
                <li className="text-muted">
                  Retour au dépôt : {km(r.returnKm)} · {formatMinutes(r.returnMinutes!)}
                </li>
              ) : null}
            </ol>
          </section>
        ))}
      </div>
    </div>
  );
}
