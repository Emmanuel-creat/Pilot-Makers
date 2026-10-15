import Link from "next/link";
import { awayEndAction, awaySaveAction } from "@/app/actions";
import { Icon } from "@/components/Icon";
import { ActionForm } from "@/components/forms/ActionForm";
import { Submit } from "@/components/forms/Submit";
import { Notice, PageHeader, Section, fmtDate } from "@/components/ui";
import { MAX_AWAY_DAYS, clientMessage, isAway, isPlanned } from "@/lib/away-mode";
import { formatEuros } from "@/lib/calc/format";
import { requirePageCtx } from "@/lib/server/session";
import { awayDigest, awayReadiness, getAway } from "@/lib/services/away-mode";
import { parisDate } from "@/lib/services/quotes";

export const metadata = { title: "Mode absence" };

const shift = (iso: string, days: number) => {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

/** Partir plusieurs semaines : relances automatiques, message aux clients, urgences transmises, bilan au retour. */
export default async function AwayPage({ searchParams }: { searchParams: Promise<{ retour?: string }> }) {
  const sp = await searchParams;
  const ctx = await requirePageCtx();
  const a = await getAway(ctx);
  const today = parisDate(new Date());
  const away = isAway(a, today);
  const planned = isPlanned(a, today);
  const period = a.from && a.to ? { from: a.from, to: a.to } : { from: today, to: shift(today, 27) };
  const [ready, digest] = await Promise.all([awayReadiness(ctx, period), away ? awayDigest(ctx, period) : null]);
  const manager = ctx.role !== "member";
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader
        title="Mode absence"
        subtitle="Partez jusqu'à trois mois : les relances de devis et de factures tournent seules, vos clients connaissent votre date de retour, les urgences vont à votre contact de secours."
      />
      {sp.retour && !away && !planned ? (
        <Notice tone="success" title="Bon retour">
          Le mode absence est terminé : vos clients ne reçoivent plus le message d&apos;absence.
        </Notice>
      ) : null}
      {away ? (
        <Notice tone="success" title={`Absence en cours jusqu'au ${fmtDate(a.to!)}`}>
          {clientMessage(a, "")}
        </Notice>
      ) : planned ? (
        <Notice tone="info" title={`Absence prévue du ${fmtDate(a.from!)} au ${fmtDate(a.to!)}`}>
          Le message aux clients s&apos;affichera à partir du départ.
        </Notice>
      ) : null}
      {digest ? (
        <Section title="Pendant votre absence" description="Depuis le départ, ce qui s'est passé sans vous.">
          <dl className="grid gap-3 text-sm sm:grid-cols-3" data-testid="absence-bilan">
            <div>
              <dt className="text-muted">Demandes reçues</dt>
              <dd className="text-lg font-semibold">{digest.leads}</dd>
            </div>
            <div>
              <dt className="text-muted">Urgences transmises</dt>
              <dd className="text-lg font-semibold">{digest.urgent}</dd>
            </div>
            <div>
              <dt className="text-muted">Devis acceptés</dt>
              <dd className="text-lg font-semibold">{digest.accepted}</dd>
            </div>
            <div>
              <dt className="text-muted">Relances envoyées</dt>
              <dd className="text-lg font-semibold">{digest.reminders}</dd>
            </div>
            <div>
              <dt className="text-muted">Encaissé</dt>
              <dd className="text-lg font-semibold">{formatEuros(digest.paidCents)}</dd>
            </div>
          </dl>
        </Section>
      ) : null}
      <Section
        title={away || planned ? "Avant et pendant l'absence" : "Avant de partir"}
        description={`Pour la période du ${fmtDate(period.from)} au ${fmtDate(period.to)}.`}
      >
        <ul className="space-y-3 text-sm" data-testid="absence-preparation">
          {ready.map((i) => (
            <li key={i.key} className="flex items-start gap-2">
              <span className={i.ok ? "text-success" : "text-warning"}>
                <Icon name={i.ok ? "check" : "alert"} size={16} />
              </span>
              <span className="min-w-0">
                <Link href={i.href} className="link font-medium">
                  {i.label}
                </Link>
                <span className="block text-muted">{i.detail}</span>
              </span>
            </li>
          ))}
        </ul>
      </Section>
      {manager ? (
        <Section title="Période et contacts">
          <ActionForm action={awaySaveAction}>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="label" htmlFor="ab-from">
                  Départ
                </label>
                <input id="ab-from" name="from" type="date" className="field" defaultValue={a.from ?? today} required />
              </div>
              <div>
                <label className="label" htmlFor="ab-to">
                  Dernier jour d&apos;absence
                </label>
                <input id="ab-to" name="to" type="date" className="field" defaultValue={a.to ?? shift(today, 27)} min={today} required />
              </div>
            </div>
            <div>
              <label className="label" htmlFor="ab-message">
                Message aux clients (vide : message avec la date de retour)
              </label>
              <textarea id="ab-message" name="message" className="field" rows={3} maxLength={600} defaultValue={a.message} />
            </div>
            <fieldset className="grid gap-3 sm:grid-cols-3">
              <legend className="mb-1 text-sm font-medium">Contact de secours pour les urgences (fuite, panne, plus de chauffage...)</legend>
              <div>
                <label className="label" htmlFor="ab-bname">
                  Nom
                </label>
                <input id="ab-bname" name="backupName" className="field" defaultValue={a.backupName} maxLength={120} />
              </div>
              <div>
                <label className="label" htmlFor="ab-bphone">
                  Téléphone
                </label>
                <input id="ab-bphone" name="backupPhone" type="tel" className="field" defaultValue={a.backupPhone} maxLength={30} />
              </div>
              <div>
                <label className="label" htmlFor="ab-bemail">
                  E-mail
                </label>
                <input id="ab-bemail" name="backupEmail" type="email" className="field" defaultValue={a.backupEmail} maxLength={254} />
              </div>
            </fieldset>
            <p className="text-xs text-muted">Une absence dure {MAX_AWAY_DAYS} jours au plus. Le contact de secours reçoit les demandes urgentes par e-mail.</p>
            <Submit>{away || planned ? "Mettre à jour" : "Programmer l'absence"}</Submit>
          </ActionForm>
          {away || planned ? (
            <ActionForm action={awayEndAction} className="mt-3">
              <Submit className="btn-secondary">{away ? "Je suis de retour" : "Annuler l'absence"}</Submit>
            </ActionForm>
          ) : null}
        </Section>
      ) : null}
    </div>
  );
}
