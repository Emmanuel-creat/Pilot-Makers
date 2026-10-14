import Link from "next/link";
import { delayAutoNoticeAction, delayNoticeAction } from "@/app/actions";
import { ActionForm } from "@/components/forms/ActionForm";
import { Submit } from "@/components/forms/Submit";
import { Empty, PageHeader, Section } from "@/components/ui";
import { DELAY_STATES, type DelayState } from "@/lib/delays";
import { requirePageCtx } from "@/lib/server/session";
import { can } from "@/lib/services/context";
import { delayBoard } from "@/lib/services/delays";

export const metadata = { title: "Retards de chantier" };

const TONE: Record<DelayState, string> = { depasse: "text-accent", en_retard: "text-warning", a_l_heure: "text-success" };
const fr = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString("fr-FR", { day: "numeric", month: "short", timeZone: "UTC" });
const pct = (v: number) => `${Math.round(v * 100)} %`;

export default async function DelaysPage() {
  const ctx = await requirePageCtx();
  const b = await delayBoard(ctx);
  const writable = !ctx.entitlements.readOnly && !ctx.supportAccess;
  const canSet = writable && can(ctx, "settings");
  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title="Retards de chantier"
        subtitle="Les chantiers commencés : avancement saisi face au temps écoulé, fin probable d'après le reste à faire et solutions."
        back={{ href: "/app/chantiers", label: "Chantiers" }}
      />
      <div className="space-y-6">
        <Section title="Chantiers en cours">
          {b.jobs.length ? (
            <ul className="divide-y divide-border text-sm" data-testid="retards">
              {b.jobs.map((j) => (
                <li key={j.jobId} className="flex flex-wrap items-start gap-3 py-3">
                  <div className="min-w-0 flex-1">
                    <p className={`text-xs font-medium uppercase tracking-wide ${TONE[j.state]}`}>
                      {DELAY_STATES[j.state]}
                      {j.lateDays ? `, ${j.lateDays} jour${j.lateDays > 1 ? "s" : ""} ouvré${j.lateDays > 1 ? "s" : ""} de plus` : ""}
                    </p>
                    <Link href={`/app/chantiers/${j.jobId}`} className="font-medium underline-offset-2 hover:underline">
                      {j.title}
                    </Link>
                    <p className="text-muted">
                      {j.customer ? `${j.customer}, ` : ""}avancement {pct(j.progress)} pour {pct(j.expected)} du temps écoulé, fin prévue le {fr(j.end)}, fin
                      probable le {fr(j.projectedEnd)}
                    </p>
                    {j.state !== "a_l_heure" ? (
                      <ul className="mt-1 list-disc pl-5 text-muted">
                        {j.withOneMore ? (
                          <li>
                            Une personne de plus sur le chantier ramène la fin au {fr(j.withOneMore)} :{" "}
                            <Link href="/app/planning/equilibre" className="underline">
                              voir qui est libre
                            </Link>
                            .
                          </li>
                        ) : null}
                        <li>Prévenir le client de la nouvelle date évite les mauvaises surprises et les appels.</li>
                      </ul>
                    ) : null}
                    {j.lastNotice ? <p className="mt-1 text-xs text-muted">Client prévenu d&apos;une fin le {fr(j.lastNotice.newEnd)}.</p> : null}
                  </div>
                  {writable && j.state !== "a_l_heure" && j.customerEmail && j.lastNotice?.newEnd !== j.projectedEnd ? (
                    <ActionForm action={delayNoticeAction}>
                      <input type="hidden" name="jobId" value={j.jobId} />
                      <Submit className="btn-secondary">Prévenir le client</Submit>
                    </ActionForm>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : (
            <Empty icon="clock" title="Aucun chantier commencé avec des dates" />
          )}
        </Section>
        <Section
          title="Prévenance automatique"
          description="Chaque jour, le client d'un chantier en retard reçoit un e-mail avec la nouvelle date de fin, une fois par date et au plus une fois par semaine."
        >
          {canSet ? (
            <ActionForm action={delayAutoNoticeAction} className="flex flex-wrap items-center gap-3 text-sm">
              <input type="hidden" name="on" value={b.autoNotice ? "0" : "1"} />
              <span>{b.autoNotice ? "Activée." : "Désactivée."}</span>
              <Submit className={b.autoNotice ? "btn-secondary" : "btn-primary"}>{b.autoNotice ? "Désactiver" : "Activer"}</Submit>
            </ActionForm>
          ) : (
            <p className="text-sm text-muted">{b.autoNotice ? "Activée." : "Désactivée."} Seul un administrateur peut la changer.</p>
          )}
        </Section>
      </div>
    </div>
  );
}
