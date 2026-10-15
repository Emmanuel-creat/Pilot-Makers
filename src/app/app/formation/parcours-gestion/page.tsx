import Link from "next/link";
import { courseExamStartAction } from "@/app/actions";
import { Icon } from "@/components/Icon";
import { ActionForm } from "@/components/forms/ActionForm";
import { Submit } from "@/components/forms/Submit";
import { Notice, PageHeader, Section, fmtDate } from "@/components/ui";
import { COURSE } from "@/lib/management-course";
import { requirePageCtx } from "@/lib/server/session";
import { courseProgress } from "@/lib/services/management-course";
import { moduleById } from "@/lib/training";

export const metadata = { title: "Parcours gestion d'entreprise" };

/** Parcours de gestion : huit modules, un examen final et une attestation de réussite vérifiable. */
export default async function ManagementCoursePage() {
  const ctx = await requirePageCtx();
  const p = await courseProgress(ctx);
  const done = COURSE.modules.length - p.missing.length;
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader
        title={`Parcours ${COURSE.title}`}
        subtitle={`Prix de revient, marge, trésorerie, TVA, facturation, recouvrement, assurances et pilotage : huit modules, puis un examen de ${COURSE.examSize} questions. ${done} module${done > 1 ? "s" : ""} validé${done > 1 ? "s" : ""} sur ${COURSE.modules.length}.`}
        back={{ href: "/app/formation", label: "Formation continue" }}
      />
      {p.certificate ? (
        <Notice tone="success" title="Attestation obtenue">
          Délivrée le {fmtDate(p.certificate.issuedAt)} avec {p.certificate.score} bonnes réponses sur {p.certificate.total}, numéro{" "}
          <Link href={`/verifier-attestation?code=${p.certificate.code}`} className="link font-medium">
            {p.certificate.code}
          </Link>
          . Ce numéro permet à un client, une banque ou un donneur d&apos;ordre de la vérifier en ligne.
        </Notice>
      ) : null}
      <Section title="Les huit modules">
        <ol className="space-y-2 text-sm" data-testid="parcours-modules">
          {COURSE.modules.map((id, i) => {
            const m = moduleById(id)!;
            const ok = p.passed.has(id);
            return (
              <li key={id} className="flex items-center justify-between gap-3">
                <Link href={`/app/formation/${id}`} className="link">
                  {i + 1}. {m.title}
                </Link>
                <span className={`flex shrink-0 items-center gap-1 text-xs ${ok ? "text-success" : "text-muted"}`}>
                  {ok ? <Icon name="check" size={14} /> : null}
                  {ok ? "Validé" : `${m.minutes} min`}
                </span>
              </li>
            );
          })}
        </ol>
      </Section>
      <Section
        title="Examen final"
        description={`${COURSE.examSize} questions tirées au sort parmi celles des modules, au moins une par module. Réussite à ${COURSE.passMark} bonnes réponses ; trois tentatives par jour.`}
      >
        {p.missing.length ? (
          <p className="text-sm text-muted">Validez les huit modules pour ouvrir l&apos;examen.</p>
        ) : (
          <ActionForm action={courseExamStartAction}>
            <Submit>{p.openExamId ? "Reprendre l'examen" : p.certificate ? "Repasser l'examen" : "Commencer l'examen"}</Submit>
          </ActionForm>
        )}
        {p.attempts.length ? (
          <ul className="mt-3 space-y-1 text-xs text-muted">
            {p.attempts.map((a) => (
              <li key={a.at}>
                {fmtDate(a.at, true)} : {a.score} sur {COURSE.examSize}
              </li>
            ))}
          </ul>
        ) : null}
      </Section>
      <p className="text-xs text-muted">
        L&apos;attestation de réussite atteste des connaissances vérifiées par l&apos;examen. Ce n&apos;est pas une certification inscrite au répertoire
        national des certifications professionnelles.
      </p>
    </div>
  );
}
