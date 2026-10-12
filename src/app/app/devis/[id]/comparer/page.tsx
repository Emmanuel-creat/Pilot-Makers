import Link from "next/link";
import { notFound } from "next/navigation";
import { Empty, PageHeader } from "@/components/ui";
import { formatEuros } from "@/lib/calc/format";
import { requirePageCtx } from "@/lib/server/session";
import { compareVersions, listVersions } from "@/lib/services/quotes";

export const metadata = { title: "Comparer les versions" };

export default async function ComparePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ a?: string; b?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  const ctx = await requirePageCtx();
  const versions = await listVersions(ctx, id).catch(() => notFound());
  if (versions.length < 2) {
    return (
      <>
        <PageHeader title="Comparer les versions" back={{ href: `/app/devis/${id}`, label: "Retour au devis" }} />
        <Empty icon="compare" title="Une seule version">
          La comparaison est disponible dès qu'une deuxième version est émise.
        </Empty>
      </>
    );
  }
  const latest = versions[0].version;
  const b = Number(sp.b ?? latest);
  const a = Number(sp.a ?? b - 1);
  const diff = await compareVersions(ctx, id, a, b);
  const opts = versions.map((v) => v.version);
  return (
    <>
      <PageHeader title={`Comparer les versions de ${versions[0].number}`} back={{ href: `/app/devis/${id}`, label: "Retour au devis" }} />
      <form className="card mb-6 flex flex-wrap items-end gap-3 p-4">
        <div>
          <label className="label" htmlFor="va">
            Version de départ
          </label>
          <select id="va" name="a" defaultValue={a} className="field">
            {opts.map((v) => (
              <option key={v} value={v}>
                Version {v}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="vb">
            Comparée à
          </label>
          <select id="vb" name="b" defaultValue={b} className="field">
            {opts.map((v) => (
              <option key={v} value={v}>
                Version {v}
              </option>
            ))}
          </select>
        </div>
        <button className="btn-secondary">Comparer</button>
      </form>
      <div className="space-y-6">
        <section className="card p-5">
          <h2 className="font-semibold">Total TTC</h2>
          <p className="tabular mt-1">
            {formatEuros(diff.totals.before)} en version {a}, {formatEuros(diff.totals.after)} en version {b}
            <span className={`ml-2 font-medium ${diff.totals.after >= diff.totals.before ? "text-success" : "text-danger"}`}>
              ({diff.totals.after >= diff.totals.before ? "+" : ""}
              {formatEuros(diff.totals.after - diff.totals.before)})
            </span>
          </p>
        </section>
        <section className="card p-5">
          <h2 className="mb-3 font-semibold">Informations générales</h2>
          {diff.fields.length ? (
            <dl className="space-y-3 text-sm">
              {diff.fields.map((f) => (
                <div key={f.field}>
                  <dt className="font-medium">{f.field}</dt>
                  <dd className="text-danger line-through">{f.before || "(vide)"}</dd>
                  <dd className="text-success">{f.after || "(vide)"}</dd>
                </div>
              ))}
            </dl>
          ) : (
            <p className="text-sm text-muted">Aucun changement.</p>
          )}
        </section>
        <section className="card p-5">
          <h2 className="mb-3 font-semibold">Lignes</h2>
          {diff.lines.length ? (
            <ul className="space-y-2 text-sm">
              {diff.lines.map((l, i) => (
                <li key={i} className="rounded-md border border-line p-3">
                  <span
                    className={`mr-2 rounded px-1.5 py-0.5 text-xs font-medium ${
                      l.status === "added" ? "bg-success-soft text-success" : l.status === "removed" ? "bg-danger-soft text-danger" : "bg-warning-soft text-warning"
                    }`}
                  >
                    {l.status === "added" ? "Ajoutée" : l.status === "removed" ? "Supprimée" : "Modifiée"}
                  </span>
                  <strong>{l.label || "Sans libellé"}</strong>
                  {l.changes.length ? (
                    <ul className="mt-1 list-disc pl-5 text-muted">
                      {l.changes.map((c) => (
                        <li key={c}>{c}</li>
                      ))}
                    </ul>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted">Aucune ligne modifiée.</p>
          )}
        </section>
        <p className="text-sm">
          <Link className="link" href={`/api/quotes/${id}/pdf?version=${a}`} target="_blank">
            PDF version {a}
          </Link>
          {" - "}
          <Link className="link" href={`/api/quotes/${id}/pdf?version=${b}`} target="_blank">
            PDF version {b}
          </Link>
        </p>
      </div>
    </>
  );
}
