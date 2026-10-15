import { notFound } from "next/navigation";
import { ActionForm } from "@/components/forms/ActionForm";
import { Submit } from "@/components/forms/Submit";
import { PageHeader, Section, fmtDate } from "@/components/ui";
import { TRAINING_TOPICS, moduleById } from "@/lib/training";
import { requirePageCtx } from "@/lib/server/session";
import { quizAction } from "@/app/actions";

export const metadata = { title: "Module de formation" };

export default async function TrainingModulePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requirePageCtx();
  const m = moduleById(id);
  if (!m) notFound();
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader
        title={m.title}
        back={{ href: "/app/formation", label: "Formation continue" }}
        subtitle={`${TRAINING_TOPICS[m.topic]}, ${m.minutes} minutes. Contenu à jour au ${fmtDate(m.updated)}.`}
      />
      <Section title="L'essentiel">
        <ol className="list-decimal space-y-2 pl-5 text-sm">
          {m.points.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ol>
        <p className="mt-3 text-xs text-muted">Source : {m.source}.</p>
      </Section>
      <Section title="Trois questions pour valider">
        <ActionForm action={quizAction} className="space-y-5 text-sm">
          <input type="hidden" name="moduleId" value={m.id} />
          {m.quiz.map((q, i) => (
            <fieldset key={q.q} className="space-y-1">
              <legend className="font-medium">
                {i + 1}. {q.q}
              </legend>
              {q.choices.map((c, j) => (
                <label key={c} className="flex min-h-6 items-center gap-2">
                  <input type="radio" name={`q${i}`} value={j} required /> {c}
                </label>
              ))}
            </fieldset>
          ))}
          <Submit>Valider mes réponses</Submit>
        </ActionForm>
      </Section>
    </div>
  );
}
