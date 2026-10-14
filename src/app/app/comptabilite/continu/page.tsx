import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm } from "@/components/forms/ActionForm";
import { Submit } from "@/components/forms/Submit";
import { Icon } from "@/components/Icon";
import { Notice, PageHeader, Section, fmtDate } from "@/components/ui";
import { MONTH_CHECKS, type MonthState } from "@/lib/continuous-accounting";
import { requirePageCtx } from "@/lib/server/session";
import { continuousAccounting } from "@/lib/services/continuous-accounting";
import { can, isReadOnlyMember } from "@/lib/services/context";
import { parisDate } from "@/lib/services/quotes";
import { monthReopenAction, monthVerifyAction } from "@/app/actions";

export const metadata = { title: "Comptabilité au fil de l'eau" };

const STATE: Record<MonthState, { label: string; tone: string }> = {
  a_venir: { label: "À venir", tone: "text-muted" },
  en_cours: { label: "En cours", tone: "text-muted" },
  a_corriger: { label: "À corriger", tone: "text-warning" },
  pret: { label: "Prêt à vérifier", tone: "text-accent" },
  verifie: { label: "Vérifié", tone: "text-success" },
};

export default async function ContinuousAccountingPage({ searchParams }: { searchParams: Promise<{ annee?: string }> }) {
  const ctx = await requirePageCtx();
  if (!can(ctx, "billing")) notFound();
  const sp = await searchParams;
  const asked = Number(sp.annee);
  const year = Number.isInteger(asked) && asked >= 2000 && asked <= 2100 ? asked : Number(parisDate(new Date()).slice(0, 4));
  const r = await continuousAccounting(ctx, year);
  const readOnly = ctx.entitlements.readOnly || !!ctx.supportAccess || isReadOnlyMember(ctx);
  const p = r.progress;
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageHeader
        title="Comptabilité au fil de l'eau"
        back={{ href: "/app/comptabilite", label: "Comptabilité" }}
        subtitle="Chaque mois terminé, quatre contrôles puis une vérification : quand tous les mois sont vérifiés, la clôture de l'exercice tient en un jour."
        actions={
          <form className="flex items-end gap-2" action="/app/comptabilite/continu">
            <div>
              <label className="label" htmlFor="cc-year">
                Exercice
              </label>
              <input id="cc-year" name="annee" type="number" min={2000} max={2100} className="field w-28 tabular" defaultValue={year} />
            </div>
            <button className="btn-secondary">Afficher</button>
          </form>
        }
      />
      <Notice
        tone={p.oneDayClose ? "success" : p.late ? "warning" : "info"}
        title={`${p.verified} mois vérifié${p.verified > 1 ? "s" : ""} sur ${r.months.length}`}
      >
        {p.oneDayClose ? (
          <>
            Exercice entièrement vérifié : il reste les points de{" "}
            <Link href={`/app/comptabilite/bilan?annee=${year}`} className="link">
              préparation du bilan
            </Link>
            , à faire en une journée.
          </>
        ) : p.late ? (
          `${p.late} mois terminé${p.late > 1 ? "s" : ""} à vérifier. Dix minutes par mois évitent une semaine de rattrapage à la clôture.`
        ) : (
          "Tous les mois terminés sont vérifiés. Continuez au fil des mois."
        )}
      </Notice>
      <Section title={`Exercice du ${fmtDate(r.from)} au ${fmtDate(r.to)}`}>
        <ul className="divide-y divide-line" data-testid="mois-comptables">
          {r.months.map((m) => (
            <li key={m.month} className="space-y-2 py-3 text-sm">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="font-medium first-letter:uppercase">{m.label}</span>
                <span className={`text-xs font-medium ${STATE[m.state].tone}`}>{STATE[m.state].label}</span>
              </div>
              {m.state === "a_venir" ? null : (
                <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
                  {m.checks.map((c) => {
                    const def = MONTH_CHECKS.find((d) => d.id === c.id)!;
                    return (
                      <li key={c.id} className={`flex items-center gap-1 ${c.ok ? "text-success" : "text-warning"}`}>
                        <Icon name={c.ok ? "check" : "alert"} size={14} />
                        {c.ok ? (
                          def.label
                        ) : (
                          <Link href={def.href} className="link">
                            {def.fix}
                            {c.id === "releve" ? "" : ` (${c.count})`}
                          </Link>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
              {m.review ? (
                <div className="flex flex-wrap items-center gap-3 text-xs text-muted">
                  <span>
                    Vérifié le {fmtDate(m.review.verifiedAt)}
                    {m.review.vatDeclared ? ", TVA déclarée" : ""}
                    {m.review.note ? `, ${m.review.note}` : ""}
                  </span>
                  {readOnly ? null : (
                    <ActionForm action={monthReopenAction} className="inline">
                      <input type="hidden" name="month" value={m.month} />
                      <button className="link min-h-6">Rouvrir</button>
                    </ActionForm>
                  )}
                </div>
              ) : m.state === "pret" && !readOnly ? (
                <ActionForm action={monthVerifyAction} className="flex flex-wrap items-end gap-3">
                  <input type="hidden" name="month" value={m.month} />
                  <label className="flex min-h-6 items-center gap-2 text-xs">
                    <input type="checkbox" name="vatDeclared" /> TVA du mois déclarée
                  </label>
                  <div>
                    <label className="label" htmlFor={`note-${m.month}`}>
                      Note pour l&apos;expert-comptable
                    </label>
                    <input id={`note-${m.month}`} name="note" className="field" />
                  </div>
                  <Submit className="btn-secondary">Marquer {m.label} vérifié</Submit>
                </ActionForm>
              ) : null}
            </li>
          ))}
        </ul>
      </Section>
    </div>
  );
}
