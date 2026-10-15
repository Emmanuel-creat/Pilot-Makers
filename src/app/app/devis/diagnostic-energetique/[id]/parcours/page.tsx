import Link from "next/link";
import { notFound } from "next/navigation";
import { aidStepAction } from "@/app/actions";
import { ActionForm } from "@/components/forms/ActionForm";
import { Submit } from "@/components/forms/Submit";
import { Icon } from "@/components/Icon";
import { fmtDate, Notice, PageHeader } from "@/components/ui";
import { formatEuros } from "@/lib/calc/format";
import { requirePageCtx } from "@/lib/server/session";
import { energyJourney } from "@/lib/services/energy-diagnoses";
import { parisDate } from "@/lib/services/quotes";

export const metadata = { title: "Parcours de rénovation" };

const WITH_AMOUNT = new Set(["aide_accord", "aide_versee"]);
const day = (iso: string) => fmtDate(new Date(`${iso}T12:00:00Z`));

/** Du diagnostic au versement de l'aide : un seul fil pour l'artisan, étape par étape. */
export default async function JourneyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requirePageCtx();
  const j = await energyJourney(ctx, id).catch(() => null);
  if (!j) notFound();
  const r = j.diagnosis;
  const writable = !ctx.entitlements.readOnly && !ctx.supportAccess;
  const today = parisDate(new Date());
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader
        title="Parcours de rénovation"
        back={{ href: `/app/devis/diagnostic-energetique/${id}`, label: "Diagnostic" }}
        subtitle={`${r.customer_name ?? "Sans client"} : étiquette ${r.current_class} aujourd'hui, ${r.after_class} visée. Diagnostic, devis, aide et travaux suivis dans un seul fil.`}
      />
      <section className="card flex flex-wrap items-center gap-6 p-4" aria-labelledby="pr-avancement" data-testid="parcours-avancement">
        <div>
          <p id="pr-avancement" className="text-3xl font-semibold tabular-nums">
            {j.done} / {j.total}
          </p>
          <p className="text-sm text-muted">étapes franchies</p>
        </div>
        <div className="min-w-0 flex-1 text-sm">
          {j.next ? (
            <>
              <p className="font-semibold">Prochaine étape : {j.next.label}</p>
              <p className="text-muted">{j.next.help}</p>
            </>
          ) : (
            <p className="font-semibold">Parcours terminé : travaux faits et aide versée.</p>
          )}
        </div>
        <dl className="grid grid-cols-3 gap-4 text-sm">
          <div>
            <dt className="text-muted">Aide estimée</dt>
            <dd className="tabular-nums">{formatEuros(j.aid.estimatedCents)}</dd>
          </div>
          <div>
            <dt className="text-muted">Accordée</dt>
            <dd className="tabular-nums">{j.aid.grantedCents == null ? "--" : formatEuros(j.aid.grantedCents)}</dd>
          </div>
          <div>
            <dt className="text-muted">Versée</dt>
            <dd className="tabular-nums">{j.aid.receivedCents == null ? "--" : formatEuros(j.aid.receivedCents)}</dd>
          </div>
        </dl>
      </section>
      {j.alerts.map((a) => (
        <Notice key={a} tone="warning">
          {a}
        </Notice>
      ))}
      {j.aid.gapCents ? (
        <Notice tone="info">
          L&apos;aide versée diffère de l&apos;aide accordée de {formatEuros(Math.abs(j.aid.gapCents))} : vérifiez auprès du financeur.
        </Notice>
      ) : null}
      <ol className="space-y-3">
        {j.stages.map((s, n) => (
          <li key={s.key} className="card p-4" data-testid={`etape-${s.key}`}>
            <div className="flex items-start gap-3">
              <span
                className={`flex size-8 shrink-0 items-center justify-center rounded-full border text-sm font-semibold ${s.done ? "border-success text-success" : "border-line text-muted"}`}
              >
                {s.done ? <Icon name="check" size={16} title="Fait" /> : n + 1}
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-semibold">{s.label}</p>
                <p className="text-sm text-muted">
                  {s.done && s.on ? `Le ${day(s.on)}` : s.help}
                  {s.amountCents != null ? `, ${formatEuros(s.amountCents)}` : ""}
                  {s.note ? ` : ${s.note}` : ""}
                </p>
                {!s.manual && !s.done && s.key === "devis" ? (
                  <Link href={`/app/devis/diagnostic-energetique/${id}`} className="link text-sm">
                    Créer le devis depuis le diagnostic
                  </Link>
                ) : null}
                {!s.manual && s.key === "devis" && r.quote_id ? (
                  <Link href={`/app/devis/${r.quote_id}`} className="link text-sm">
                    Ouvrir le devis {r.quote_number ?? ""}
                  </Link>
                ) : null}
                {s.manual && writable ? (
                  s.done ? (
                    <ActionForm action={aidStepAction} className="mt-2">
                      <input type="hidden" name="id" value={id} />
                      <input type="hidden" name="key" value={s.key} />
                      <input type="hidden" name="undo" value="1" />
                      <Submit className="btn-ghost min-h-9">Décocher</Submit>
                    </ActionForm>
                  ) : (
                    <ActionForm action={aidStepAction} className="mt-2 flex flex-wrap items-end gap-2">
                      <input type="hidden" name="id" value={id} />
                      <input type="hidden" name="key" value={s.key} />
                      <div>
                        <label className="label" htmlFor={`on-${s.key}`}>
                          Date
                        </label>
                        <input id={`on-${s.key}`} name="on" type="date" className="field" defaultValue={today} max={today} required />
                      </div>
                      {WITH_AMOUNT.has(s.key) ? (
                        <div>
                          <label className="label" htmlFor={`amount-${s.key}`}>
                            Montant en euros
                          </label>
                          <input id={`amount-${s.key}`} name="amount" inputMode="decimal" className="field w-32" />
                        </div>
                      ) : null}
                      <div className="min-w-0 flex-1">
                        <label className="label" htmlFor={`note-${s.key}`}>
                          Note (facultatif)
                        </label>
                        <input id={`note-${s.key}`} name="note" className="field" maxLength={300} placeholder="Numéro de dossier, interlocuteur..." />
                      </div>
                      <Submit className="btn-secondary min-h-9">Marquer fait</Submit>
                    </ActionForm>
                  )
                ) : null}
              </div>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
