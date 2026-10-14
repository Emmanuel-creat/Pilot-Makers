import { ActionForm } from "@/components/forms/ActionForm";
import { Submit } from "@/components/forms/Submit";
import { Icon } from "@/components/Icon";
import { PageHeader, Section, fmtDate } from "@/components/ui";
import { REPORT_REASONS, TOPICS } from "@/lib/community";
import { requirePageCtx } from "@/lib/server/session";
import { getQuestion } from "@/lib/services/community";
import { communityAcceptAction, communityAnswerAction, communityReportAction, communityVoteAction } from "@/app/actions";

export const metadata = { title: "Question d'entraide" };

function ReportForm({ kind, id }: { kind: "question" | "reponse"; id: string }) {
  return (
    <details className="text-xs">
      <summary className="link inline-flex min-h-6 cursor-pointer items-center">Signaler</summary>
      <ActionForm action={communityReportAction} className="mt-2 flex flex-wrap items-end gap-2">
        <input type="hidden" name="kind" value={kind} />
        <input type="hidden" name="id" value={id} />
        <div>
          <label className="label" htmlFor={`r-${id}`}>
            Motif
          </label>
          <select id={`r-${id}`} name="reason" className="field">
            {Object.entries(REPORT_REASONS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </div>
        <Submit className="btn-secondary">Envoyer le signalement</Submit>
      </ActionForm>
    </details>
  );
}

export default async function QuestionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requirePageCtx();
  const q = await getQuestion(ctx, id);
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader
        title={q.title}
        subtitle={[TOPICS[q.topic], q.author, fmtDate(q.createdAt)].join(" · ")}
        back={{ href: "/app/entraide", label: "Entraide" }}
      />
      {q.body ? <p className="card whitespace-pre-line p-4 text-sm">{q.body}</p> : null}
      {q.mine ? null : <ReportForm kind="question" id={q.id} />}
      <Section title={q.answers.length ? `${q.answers.length} réponse${q.answers.length > 1 ? "s" : ""}` : "Pas encore de réponse"}>
        <ul className="divide-y divide-line" data-testid="reponses-entraide">
          {q.answers.map((a) => {
            const accepted = a.id === q.acceptedAnswerId;
            return (
              <li key={a.id} className={`space-y-2 py-3 text-sm ${accepted ? "rounded border border-success px-3" : ""}`}>
                {accepted ? (
                  <div className="flex items-center gap-1 text-xs font-medium text-success">
                    <Icon name="check" size={14} /> Réponse retenue par l&apos;auteur
                  </div>
                ) : null}
                <p className="whitespace-pre-line">{a.body}</p>
                <div className="flex flex-wrap items-center gap-3 text-xs text-muted">
                  <span>
                    {a.author}, {fmtDate(a.createdAt)}
                  </span>
                  <span>
                    {a.votes} vote{a.votes > 1 ? "s" : ""} utile{a.votes > 1 ? "s" : ""}
                  </span>
                  {a.mine ? null : (
                    <ActionForm action={communityVoteAction} className="inline">
                      <input type="hidden" name="answerId" value={a.id} />
                      <input type="hidden" name="questionId" value={q.id} />
                      <button className="link min-h-6" aria-pressed={a.voted}>
                        {a.voted ? "Retirer mon vote" : "Utile"}
                      </button>
                    </ActionForm>
                  )}
                  {q.mine ? (
                    <ActionForm action={communityAcceptAction} className="inline">
                      <input type="hidden" name="questionId" value={q.id} />
                      <input type="hidden" name="answerId" value={accepted ? "" : a.id} />
                      <button className="link min-h-6">{accepted ? "Ne plus retenir" : "Retenir cette réponse"}</button>
                    </ActionForm>
                  ) : null}
                </div>
                {a.mine ? null : <ReportForm kind="reponse" id={a.id} />}
              </li>
            );
          })}
        </ul>
      </Section>
      <Section title="Répondre">
        <ActionForm action={communityAnswerAction} className="space-y-3 text-sm" resetOnSuccess>
          <input type="hidden" name="questionId" value={q.id} />
          <div>
            <label className="label" htmlFor="a-body">
              Votre réponse
            </label>
            <textarea id="a-body" name="body" rows={4} className="field" required />
          </div>
          <p className="text-xs text-muted">Citez la norme ou le DTU quand c&apos;est possible. Pas de téléphone ni d&apos;e-mail.</p>
          <Submit>Publier la réponse</Submit>
        </ActionForm>
      </Section>
    </div>
  );
}
