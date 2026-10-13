import { PageHeader, fmtDate } from "@/components/ui";
import { requireAdminPage } from "@/lib/server/session";
import { listTickets } from "@/lib/services/admin";
import { answerTicketAction, cancelSessionAction, closeCallbackAction, createSessionAction } from "@/app/actions";
import { ActionForm } from "@/components/forms/ActionForm";
import { Submit } from "@/components/forms/Submit";
import { CALLBACK_SLOTS, CALLBACK_STATUSES, listCallbacks, sessionAttendees, upcomingSessions } from "@/lib/services/support-desk";

export const metadata = { title: "Assistance" };

export default async function AdminSupportPage() {
  const ctx = await requireAdminPage();
  const [tickets, callbacks, sessions] = await Promise.all([listTickets(ctx, true), listCallbacks(ctx), upcomingSessions(ctx, { all: true })]);
  const attendees = await Promise.all(sessions.map((x) => sessionAttendees(ctx, x.id)));
  const open = callbacks.filter((c) => c.status === "demande");
  const done = callbacks.filter((c) => c.status !== "demande").slice(0, 20);
  const when = (d: Date) => new Date(d).toLocaleString("fr-FR", { timeZone: "Europe/Paris", dateStyle: "full", timeStyle: "short" });
  return (
    <>
      <PageHeader title="Demandes d'assistance" />
      <section className="mb-8" aria-labelledby="rappels">
        <h2 id="rappels" className="mb-3 text-lg font-semibold">
          Rappels à passer ({open.length})
        </h2>
        {open.length === 0 ? <p className="text-sm text-muted">Aucun rappel en attente.</p> : null}
        <div className="space-y-3">
          {open.map((c) => (
            <article key={c.id} className="card p-4 text-sm">
              <div className="flex flex-wrap justify-between gap-2">
                <p className="font-semibold">
                  {fmtDate(c.wished_on)}, {CALLBACK_SLOTS[c.slot].toLowerCase()} :{" "}
                  <a href={`tel:${c.phone.replace(/\s/g, "")}`} className="link tabular">
                    {c.phone}
                  </a>
                </p>
                <span className="text-xs text-muted">
                  {c.user_name || c.user_email}, {c.org_name}
                </span>
              </div>
              {c.topic ? <p className="mt-1 whitespace-pre-line">{c.topic}</p> : null}
              <form action={closeCallbackAction} className="mt-3 flex flex-col gap-2 sm:flex-row">
                <input type="hidden" name="id" value={c.id} />
                <input name="outcome" className="field" placeholder="Compte rendu" aria-label="Compte rendu de l'appel" />
                <button name="status" value="fait" className="btn-secondary min-h-9">
                  Rappel effectué
                </button>
                <button name="status" value="injoignable" className="btn-ghost min-h-9">
                  Injoignable
                </button>
              </form>
            </article>
          ))}
        </div>
        {done.length ? (
          <details className="mt-3 text-sm">
            <summary className="cursor-pointer text-muted">Rappels traités récemment</summary>
            <ul className="mt-2 space-y-1">
              {done.map((c) => (
                <li key={c.id}>
                  {fmtDate(c.wished_on)}, {c.org_name} : {CALLBACK_STATUSES[c.status]}
                  {c.outcome ? ` (${c.outcome})` : ""}
                </li>
              ))}
            </ul>
          </details>
        ) : null}
      </section>
      <section className="mb-8" aria-labelledby="seances">
        <h2 id="seances" className="mb-3 text-lg font-semibold">
          Séances de prise en main
        </h2>
        <ActionForm action={createSessionAction} resetOnSuccess className="card mb-4 grid gap-3 p-4 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="se-title">
              Titre
            </label>
            <input id="se-title" name="title" className="field" required minLength={3} maxLength={120} defaultValue="Premiers pas : du devis à la facture" />
          </div>
          <div>
            <label className="label" htmlFor="se-start">
              Date et heure (Paris)
            </label>
            <input id="se-start" name="startsAt" type="datetime-local" className="field" required />
          </div>
          <div>
            <label className="label" htmlFor="se-duration">
              Durée (minutes)
            </label>
            <input id="se-duration" name="duration" type="number" min={15} max={240} defaultValue={45} className="field" />
          </div>
          <div>
            <label className="label" htmlFor="se-capacity">
              Places
            </label>
            <input id="se-capacity" name="capacity" type="number" min={1} max={500} defaultValue={12} className="field" />
          </div>
          <div className="sm:col-span-2">
            <label className="label" htmlFor="se-url">
              Lien de la visioconférence
            </label>
            <input id="se-url" name="url" type="url" className="field" placeholder="https://" />
          </div>
          <div className="sm:col-span-2">
            <label className="label" htmlFor="se-desc">
              Programme
            </label>
            <textarea id="se-desc" name="description" rows={2} className="field" maxLength={1000} />
          </div>
          <div className="flex justify-end sm:col-span-2">
            <Submit>Programmer la séance</Submit>
          </div>
        </ActionForm>
        {sessions.length === 0 ? <p className="text-sm text-muted">Aucune séance à venir.</p> : null}
        <div className="space-y-3">
          {sessions.map((x, i) => (
            <article key={x.id} className="card p-4 text-sm">
              <div className="flex flex-wrap justify-between gap-2">
                <p className="font-semibold">
                  {x.title}
                  {x.canceled_at ? " (annulée)" : ""}
                </p>
                <span className="text-xs text-muted">
                  {when(x.starts_at)}, {x.registered}/{x.capacity} inscrit(s)
                </span>
              </div>
              {attendees[i].length ? (
                <ul className="mt-2 text-xs text-muted">
                  {attendees[i].map((a) => (
                    <li key={a.email}>
                      {a.name || a.email} ({a.org_name}), {a.email}
                    </li>
                  ))}
                </ul>
              ) : null}
              {!x.canceled_at ? (
                <form action={cancelSessionAction} className="mt-2">
                  <input type="hidden" name="id" value={x.id} />
                  <button className="btn-ghost min-h-9">Annuler et prévenir les inscrits</button>
                </form>
              ) : null}
            </article>
          ))}
        </div>
      </section>
      <h2 className="mb-3 text-lg font-semibold">Messages</h2>
      <div className="space-y-4">
        {tickets.length === 0 ? <p className="text-sm text-muted">Aucune demande.</p> : null}
        {tickets.map((t) => (
          <article key={t.id} className="card p-4 text-sm">
            <div className="flex flex-wrap justify-between gap-2">
              <h2 className="font-semibold">{t.subject}</h2>
              <span className="text-xs text-muted">
                {t.org_name} ({t.user_email}), {fmtDate(t.created_at, true)}, {t.status}
              </span>
            </div>
            <p className="mt-2 whitespace-pre-line">{t.body}</p>
            <form action={answerTicketAction} className="mt-3 space-y-2">
              <input type="hidden" name="id" value={t.id} />
              <textarea name="answer" rows={2} defaultValue={t.answer} className="field" placeholder="Réponse" aria-label="Réponse" />
              <div className="flex gap-2">
                <button className="btn-secondary min-h-9">Répondre</button>
                <button name="close" value="1" className="btn-ghost min-h-9">
                  Répondre et clore
                </button>
              </div>
            </form>
          </article>
        ))}
      </div>
    </>
  );
}
