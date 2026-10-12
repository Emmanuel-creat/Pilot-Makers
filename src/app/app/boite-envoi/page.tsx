import Link from "next/link";
import { Empty, Notice, PageHeader, fmtDate } from "@/components/ui";
import { requirePageCtx } from "@/lib/server/session";

export const metadata = { title: "E-mails envoyés" };

const KINDS: Record<string, string> = { quote: "Envoi de devis", reminder: "Relance", notification: "Notification", invite: "Invitation" };

export default async function OutboxPage({ searchParams }: { searchParams: Promise<{ id?: string }> }) {
  const sp = await searchParams;
  const ctx = await requirePageCtx();
  const rows = await ctx.db.query<{ id: string; quote_id: string | null; kind: string; to_address: string; subject: string; body: string; status: string; error: string | null; created_at: Date }>(
    "SELECT id, quote_id, kind, to_address, subject, body, status, error, created_at FROM emails WHERE org_id=$1 ORDER BY created_at DESC LIMIT 200",
    [ctx.orgId],
  );
  const open = rows.find((r) => r.id === sp.id) ?? null;
  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader title="E-mails envoyés" subtitle="Historique des messages envoyés au nom de votre entreprise." />
      {process.env.MAIL_PROVIDER !== "smtp" ? (
        <div className="mb-4">
          <Notice tone="info">
            Mode démonstration : les e-mails sont conservés ici au lieu d'être réellement envoyés. Le branchement d'un service d'envoi nécessite un
            compte chez un prestataire.
          </Notice>
        </div>
      ) : null}
      {rows.length === 0 ? (
        <Empty icon="mail" title="Aucun e-mail envoyé" />
      ) : (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <ul className="card divide-y divide-line">
            {rows.map((r) => (
              <li key={r.id}>
                <Link href={`/app/boite-envoi?id=${r.id}`} className={`block px-4 py-3 text-sm hover:bg-surface-2 ${open?.id === r.id ? "bg-surface-2" : ""}`}>
                  <div className="flex justify-between gap-2">
                    <span className="truncate font-medium">{r.subject}</span>
                    <span className={`shrink-0 text-xs ${r.status === "sent" ? "text-success" : "text-danger"}`}>{r.status === "sent" ? "Envoyé" : "Échec"}</span>
                  </div>
                  <div className="truncate text-xs text-muted">
                    {KINDS[r.kind] ?? r.kind} à {r.to_address}, le {fmtDate(r.created_at, true)}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
          {open ? (
            <article className="card h-fit p-5 text-sm">
              <h2 className="font-semibold">{open.subject}</h2>
              <p className="mt-1 text-muted">
                À {open.to_address}, le {fmtDate(open.created_at, true)}
              </p>
              {open.error ? <p className="mt-2 text-danger">{open.error}</p> : null}
              <pre className="mt-4 font-sans whitespace-pre-wrap">{open.body}</pre>
              {open.quote_id ? (
                <Link href={`/app/devis/${open.quote_id}`} className="link mt-4 inline-block">
                  Voir le devis
                </Link>
              ) : null}
            </article>
          ) : (
            <p className="hidden text-sm text-muted lg:block">Sélectionnez un message pour le lire.</p>
          )}
        </div>
      )}
    </div>
  );
}
