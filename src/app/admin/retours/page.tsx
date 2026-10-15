import { PageHeader, fmtDate } from "@/components/ui";
import { requireAdminPage } from "@/lib/server/session";
import { feedbackReport } from "@/lib/services/feedback";
import { resolveFeedbackAction } from "@/app/actions";

export const metadata = { title: "Retours" };

const pct = (v: number | null) => (v == null ? "aucune réponse" : `${v} %`);
const trend = (t: number | null) => (t == null ? "nouveau" : t === 0 ? "stable" : t > 0 ? `+${t} points` : `${t} points`);

export default async function AdminFeedbackPage() {
  const ctx = await requireAdminPage();
  const r = await feedbackReport(ctx);
  const open = r.comments.filter((c) => c.status === "nouveau");
  const done = r.comments.filter((c) => c.status !== "nouveau").slice(0, 20);
  return (
    <>
      <PageHeader
        title="Retours des utilisateurs"
        subtitle={`Sept derniers jours : ${r.total} réponse${r.total > 1 ? "s" : ""}, ${pct(r.satisfaction)} jugent la page utile (semaine précédente : ${pct(r.previousSatisfaction)}).`}
      />
      <section className="mb-8" aria-labelledby="rubriques">
        <h2 id="rubriques" className="mb-3 text-lg font-semibold">
          Par rubrique, les plus gênantes d'abord
        </h2>
        {r.areas.length ? (
          <div className="card overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-muted">
                  <th className="p-3">Rubrique</th>
                  <th className="p-3 text-right">Réponses</th>
                  <th className="p-3 text-right">Utile</th>
                  <th className="p-3 text-right">Semaine précédente</th>
                  <th className="p-3 text-right">Évolution</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {r.areas.map((a) => (
                  <tr key={a.area}>
                    <td className="p-3 font-medium">{a.area}</td>
                    <td className="p-3 text-right tabular">{a.count}</td>
                    <td className="p-3 text-right tabular">{pct(a.satisfaction)}</td>
                    <td className="p-3 text-right tabular">{pct(a.previousSatisfaction)}</td>
                    <td className={`p-3 text-right tabular ${a.trend != null && a.trend < 0 ? "text-danger" : ""}`}>{trend(a.trend)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-muted">Aucune réponse sur les deux dernières semaines.</p>
        )}
      </section>
      <section className="mb-8" aria-labelledby="commentaires">
        <h2 id="commentaires" className="mb-3 text-lg font-semibold">
          Commentaires à traiter ({open.length})
        </h2>
        {open.length === 0 ? <p className="text-sm text-muted">Aucun commentaire en attente.</p> : null}
        <div className="space-y-3">
          {open.map((c) => (
            <article key={c.id} className="card p-4 text-sm">
              <p className="flex flex-wrap justify-between gap-2">
                <span className="font-semibold">
                  {c.path} : {c.useful ? "utile" : "à améliorer"}
                </span>
                <span className="text-xs text-muted">{fmtDate(c.created_at, true)}</span>
              </p>
              <p className="mt-1 whitespace-pre-line">{c.comment}</p>
              <form action={resolveFeedbackAction} className="mt-3 flex flex-col gap-2 sm:flex-row">
                <input type="hidden" name="id" value={c.id} />
                <input name="response" className="field" placeholder="Réponse ou décision prise" aria-label="Réponse ou décision prise" maxLength={1000} />
                <button className="btn-secondary min-h-9">Marquer traité</button>
              </form>
            </article>
          ))}
        </div>
        {done.length ? (
          <details className="mt-3 text-sm">
            <summary className="cursor-pointer text-muted">Commentaires traités récemment</summary>
            <ul className="mt-2 space-y-1">
              {done.map((c) => (
                <li key={c.id}>
                  {c.path} : {c.comment}
                  {c.response ? ` (réponse : ${c.response})` : ""}
                </li>
              ))}
            </ul>
          </details>
        ) : null}
      </section>
    </>
  );
}
