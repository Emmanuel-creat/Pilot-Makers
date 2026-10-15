import Link from "next/link";
import { Icon } from "@/components/Icon";
import { PageHeader, Section, fmtDate } from "@/components/ui";
import { MODULES, TRAINING_TOPICS } from "@/lib/training";
import { requirePageCtx } from "@/lib/server/session";
import { myTraining, teamTraining } from "@/lib/services/training";

export const metadata = { title: "Formation continue" };

export default async function TrainingPage() {
  const ctx = await requirePageCtx();
  const mine = await myTraining(ctx);
  const team = ctx.role === "member" ? null : await teamTraining(ctx);
  const done = MODULES.filter((m) => mine.get(m.id)?.passed).length;
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageHeader
        title="Formation continue"
        subtitle={`Des modules de cinq minutes sur les règles et techniques qui changent, chacun terminé par trois questions. ${done} module${done > 1 ? "s" : ""} validé${done > 1 ? "s" : ""} sur ${MODULES.length}.`}
      />
      <ul className="grid gap-4 sm:grid-cols-2" data-testid="modules-formation">
        {MODULES.map((m) => {
          const r = mine.get(m.id);
          return (
            <li key={m.id} className="card flex flex-col gap-2 p-4 text-sm">
              <span className="text-xs text-muted">
                {TRAINING_TOPICS[m.topic]} · {m.minutes} min
              </span>
              <Link href={`/app/formation/${m.id}`} className="link font-medium">
                {m.title}
              </Link>
              <span className={`mt-auto flex items-center gap-1 text-xs ${r?.passed ? "text-success" : "text-muted"}`}>
                {r?.passed ? (
                  <>
                    <Icon name="check" size={14} /> Validé le {fmtDate(r.completedAt)}
                  </>
                ) : r ? (
                  `${r.score} sur 3 à la dernière tentative`
                ) : (
                  "À suivre"
                )}
              </span>
            </li>
          );
        })}
      </ul>
      {team ? (
        <Section title="Suivi de l'équipe">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="table-head">
                  <th className="px-2 py-2">Personne</th>
                  <th className="px-2 py-2 text-right">Modules validés</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {team.map((t) => (
                  <tr key={t.userId}>
                    <td className="px-2 py-2">{t.name}</td>
                    <td className="tabular px-2 py-2 text-right">
                      {t.passed.length} / {t.total}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      ) : null}
      <p className="text-xs text-muted">
        Ces modules aident à se tenir à jour ; ils ne remplacent ni une formation certifiante ni les textes officiels cités en source.
      </p>
    </div>
  );
}
