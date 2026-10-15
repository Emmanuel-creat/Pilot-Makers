import { Icon } from "@/components/Icon";
import { Empty, PageHeader, fmtDate } from "@/components/ui";
import { requirePageCtx } from "@/lib/server/session";
import { feedbackCount, myFeedback } from "@/lib/services/feedback";

export const metadata = { title: "Mes retours" };

export default async function MyFeedbackPage() {
  const ctx = await requirePageCtx();
  const [rows, count] = await Promise.all([myFeedback(ctx), feedbackCount(ctx)]);
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Mes retours"
        back={{ href: "/app/plus", label: "Plus" }}
        subtitle={`En bas de chaque page, la question « utile ou à améliorer ? » nous dit chaque semaine ce qui progresse et ce qui gêne. Vous avez répondu ${count} fois.`}
      />
      {rows.length ? (
        <ol className="space-y-3">
          {rows.map((r) => (
            <li key={r.id} className="card p-4 text-sm">
              <p className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-semibold">
                  {r.area} : {r.useful ? "utile" : "à améliorer"}
                </span>
                <span className="text-xs text-muted">{fmtDate(r.created_at)}</span>
              </p>
              <p className="mt-1 whitespace-pre-line">{r.comment}</p>
              {r.status === "traite" ? (
                <p className="mt-2 flex items-start gap-2 rounded-md bg-surface-2 p-2">
                  <Icon name="check" size={16} /> <span>{r.response || "Pris en compte par l'équipe."}</span>
                </p>
              ) : (
                <p className="mt-2 text-xs text-muted">En attente de lecture par l'équipe.</p>
              )}
            </li>
          ))}
        </ol>
      ) : (
        <Empty icon="note" title="Aucun commentaire envoyé pour l'instant. Un mot en bas d'une page suffit." />
      )}
    </div>
  );
}
