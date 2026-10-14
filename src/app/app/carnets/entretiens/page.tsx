import Link from "next/link";
import { maintenanceDoneAction } from "@/app/actions";
import { frDate } from "@/components/HomeTimeline";
import { ActionForm } from "@/components/forms/ActionForm";
import { Submit } from "@/components/forms/Submit";
import { Empty, PageHeader } from "@/components/ui";
import { MAINTENANCE_STATES, NOTICE_DAYS, type MaintenanceState } from "@/lib/maintenance";
import { requirePageCtx } from "@/lib/server/session";
import { maintenanceBoard } from "@/lib/services/maintenance";
import { parisDate } from "@/lib/services/quotes";

export const metadata = { title: "Entretiens préventifs" };

const TONE: Record<MaintenanceState, string> = { en_retard: "text-accent", bientot: "text-warning", a_jour: "text-success" };

export default async function MaintenancePage() {
  const ctx = await requirePageCtx();
  const list = await maintenanceBoard(ctx);
  const writable = !ctx.entitlements.readOnly && !ctx.supportAccess;
  const today = parisDate(new Date());
  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title="Entretiens préventifs"
        subtitle={`Les équipements des carnets de logement avec une fréquence d'entretien. Le client reçoit un e-mail ${NOTICE_DAYS} jours avant l'échéance, sauf s'il a refusé vos messages.`}
        back={{ href: "/app/carnets", label: "Carnets" }}
      />
      {list.length ? (
        <ul className="card divide-y divide-border text-sm" data-testid="entretiens">
          {list.map((m) => (
            <li key={m.id} className="flex flex-wrap items-start gap-3 p-4">
              <div className="min-w-0 flex-1">
                <p className={`text-xs font-medium uppercase tracking-wide ${TONE[m.state]}`}>
                  {MAINTENANCE_STATES[m.state]}
                  {m.notified ? ", client prévenu" : ""}
                </p>
                <Link href={`/app/carnets/${m.recordId}`} className="font-medium underline-offset-2 hover:underline">
                  {m.label}
                  {m.brand ? ` (${m.brand})` : ""}
                </Link>
                <p className="text-muted">
                  {m.customer}, {m.address}
                </p>
                <p className="text-muted">
                  Échéance le {frDate(m.due)}, tous les {m.months} mois,{" "}
                  {m.lastService ? `dernier entretien le ${frDate(m.lastService)}` : `installé le ${frDate(m.installed)}`}
                </p>
              </div>
              {writable ? (
                <ActionForm action={maintenanceDoneAction} className="flex flex-wrap items-end gap-2">
                  <input type="hidden" name="id" value={m.id} />
                  <label className="text-xs">
                    <span className="mb-1 block font-medium">Fait le</span>
                    <input type="date" name="date" className="field" defaultValue={today} max={today} required />
                  </label>
                  <Submit className="btn-secondary">Entretien fait</Submit>
                </ActionForm>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <Empty icon="calendar" title="Aucun équipement à entretenir">
          Ajoutez un équipement avec une fréquence d&apos;entretien dans le carnet d&apos;un logement.
        </Empty>
      )}
    </div>
  );
}
