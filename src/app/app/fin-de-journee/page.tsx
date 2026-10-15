import Link from "next/link";
import { dayCloseReminderAction } from "@/app/actions";
import { ActionForm } from "@/components/forms/ActionForm";
import { Submit } from "@/components/forms/Submit";
import { Icon } from "@/components/Icon";
import { PageHeader } from "@/components/ui";
import { CLOSE_HOUR } from "@/lib/day-close";
import { requirePageCtx } from "@/lib/server/session";
import { myDayClose } from "@/lib/services/day-close";

export const metadata = { title: "Fin de journée" };

/** Zéro administratif le soir : ce qui reste à boucler avant 18 heures. */
export default async function DayClosePage() {
  const ctx = await requirePageCtx();
  const d = await myDayClose(ctx);
  const left = CLOSE_HOUR * 60 - d.nowMinutes;
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <PageHeader title="Fin de journée" subtitle="Tout ce qui reste à boucler aujourd'hui, pour ne rien emporter à la maison le soir." />
      {d.items.length ? (
        <section className="card p-4" aria-labelledby="fj-reste">
          <h2 id="fj-reste" className="mb-1 font-semibold">
            {d.items.length} point{d.items.length > 1 ? "s" : ""} à boucler, environ {d.minutesLeft} minute{d.minutesLeft > 1 ? "s" : ""}
          </h2>
          <p className="mb-3 text-sm text-muted">
            {left > 0
              ? `Il reste ${Math.floor(left / 60)} h ${String(left % 60).padStart(2, "0")} avant ${CLOSE_HOUR} heures.`
              : `Il est plus de ${CLOSE_HOUR} heures : ce sera pour demain matin.`}
          </p>
          <ul className="divide-y divide-line">
            {d.items.map((i) => (
              <li key={i.key}>
                <Link href={i.href} className="flex items-center justify-between gap-3 py-3 hover:bg-surface-2">
                  <span className="min-w-0">{i.label}</span>
                  <span className="flex shrink-0 items-center gap-1 text-sm text-muted">
                    {i.minutes} min <Icon name="right" size={16} />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : (
        <section className="card flex items-center gap-3 p-6" data-testid="journee-bouclee">
          <Icon name="check" size={28} className="text-success" />
          <div>
            <h2 className="font-semibold">Journée bouclée</h2>
            <p className="text-sm text-muted">Rien ne reste à faire ce soir. Bonne soirée.</p>
          </div>
        </section>
      )}
      <section className="card space-y-2 p-4" aria-labelledby="fj-rappel">
        <h2 id="fj-rappel" className="font-semibold">
          Rappel à 16 h 30
        </h2>
        <p className="text-sm text-muted">
          {d.reminder
            ? "Activé : vous recevez une notification à 16 h 30 s'il reste quelque chose à boucler."
            : "Recevez une notification à 16 h 30 s'il reste quelque chose à boucler, pour finir avant 18 heures."}
        </p>
        <ActionForm action={dayCloseReminderAction}>
          <input type="hidden" name="on" value={d.reminder ? "0" : "1"} />
          <Submit className={d.reminder ? "btn-secondary" : "btn-primary"}>{d.reminder ? "Désactiver le rappel" : "Activer le rappel"}</Submit>
        </ActionForm>
      </section>
    </div>
  );
}
