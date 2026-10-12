import { PageHeader, fmtDate } from "@/components/ui";
import { requireAdminPage } from "@/lib/server/session";
import { listTickets } from "@/lib/services/admin";
import { answerTicketAction } from "@/app/actions";

export const metadata = { title: "Assistance" };

export default async function AdminSupportPage() {
  const ctx = await requireAdminPage();
  const tickets = await listTickets(ctx, true);
  return (
    <>
      <PageHeader title="Demandes d'assistance" />
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
