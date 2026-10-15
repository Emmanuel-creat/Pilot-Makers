import type { OpenWork } from "@/lib/services/open-works";

/** Contenu d'une fiche d'ouvrage, commun à l'application et à la page publique. */
export function WorkSheet({ work }: { work: OpenWork }) {
  return (
    <div className="card space-y-3 p-4 text-sm" data-testid="fiche-ouvrage">
      <p className="whitespace-pre-line">{work.description}</p>
      {work.composition.length ? (
        <div>
          <h2 className="mb-1 text-sm font-semibold">Composition par {work.unit}</h2>
          <ul className="space-y-0.5">
            {work.composition.map((c) => (
              <li key={c.label} className="flex justify-between gap-2">
                <span className="min-w-0">{c.label}</span>
                <span className="tabular">
                  {c.quantity} {c.unit}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <dl className="grid grid-cols-2 gap-2 text-xs">
        {work.labourMinutes != null ? (
          <div>
            <dt className="text-muted">Temps de pose</dt>
            <dd>
              {work.labourMinutes} min par {work.unit}
            </dd>
          </div>
        ) : null}
        {work.refs ? (
          <div>
            <dt className="text-muted">Références</dt>
            <dd>{work.refs}</dd>
          </div>
        ) : null}
      </dl>
    </div>
  );
}
