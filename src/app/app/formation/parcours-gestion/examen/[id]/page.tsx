import Link from "next/link";
import { courseExamSubmitAction } from "@/app/actions";
import { ActionForm } from "@/components/forms/ActionForm";
import { Submit } from "@/components/forms/Submit";
import { Notice, PageHeader } from "@/components/ui";
import { COURSE } from "@/lib/management-course";
import { requirePageCtx } from "@/lib/server/session";
import { getExam } from "@/lib/services/management-course";

export const metadata = { title: "Examen final" };

export default async function ExamPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requirePageCtx();
  const questions = await getExam(ctx, id);
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader
        title="Examen final"
        subtitle={`${COURSE.examSize} questions, réussite à ${COURSE.passMark} bonnes réponses. Le sujet reste ouvert deux heures.`}
        back={{ href: "/app/formation/parcours-gestion", label: "Parcours" }}
      />
      {questions ? (
        <div className="card p-5">
          <ActionForm action={courseExamSubmitAction} className="space-y-5 text-sm">
            <input type="hidden" name="examId" value={id} />
            {questions.map((q, i) => (
              <fieldset key={i} className="space-y-1">
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
            <Submit>Rendre ma copie</Submit>
          </ActionForm>
        </div>
      ) : (
        <Notice tone="warning" title="Sujet fermé">
          Cet examen a été corrigé ou a expiré.{" "}
          <Link href="/app/formation/parcours-gestion" className="link">
            Revenir au parcours
          </Link>
        </Notice>
      )}
    </div>
  );
}
