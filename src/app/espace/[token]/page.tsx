import { ClientMessages } from "@/components/ClientMessages";
import { Logo } from "@/components/Icon";
import { Notice } from "@/components/ui";
import { formatEuros } from "@/lib/calc/format";
import { getDb } from "@/lib/db";
import { HttpError } from "@/lib/http";
import { requestMeta } from "@/lib/server/session";
import { openPortal } from "@/lib/services/client-space";

export const dynamic = "force-dynamic";
export const metadata = { title: "Votre espace client", robots: { index: false, follow: false } };

const day = (d: unknown) => {
  const s = d instanceof Date ? d.toISOString().slice(0, 10) : String(d ?? "").slice(0, 10);
  return s ? s.split("-").reverse().join("/") : "";
};
const when = (d: Date) => new Date(d).toLocaleString("fr-FR", { timeZone: "Europe/Paris", dateStyle: "short", timeStyle: "short" });

/** Espace du client final : ses devis, factures, procès-verbaux de réception et échanges avec l'entreprise. */
export default async function PortalPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const p = await openPortal(await getDb(), token, await requestMeta()).catch((e) => {
    if (e instanceof HttpError && e.status === 429) return "limited" as const;
    throw e;
  });
  if (p === "limited") {
    return (
      <Frame>
        <Notice tone="warning" title="Trop de consultations">
          Cet espace a été ouvert trop souvent depuis votre connexion en peu de temps. Patientez une minute puis rechargez la page.
        </Notice>
      </Frame>
    );
  }
  if (!p) {
    return (
      <Frame>
        <Notice tone="warning" title="Lien invalide ou expiré">
          Ce lien vers votre espace client n'est plus valable. Demandez un nouveau lien à l'entreprise qui vous l'a transmis.
        </Notice>
      </Frame>
    );
  }
  const base = `/api/espace/${token}`;
  return (
    <Frame>
      <header className="mb-6">
        <h1 className="text-xl font-semibold">Bonjour {p.customerName}</h1>
        <p className="text-sm text-muted">
          Votre espace chez {p.org.trade_name} : devis, factures et échanges au même endroit.
          {p.org.email || p.org.phone ? <> Contact : {[p.org.email, p.org.phone].filter(Boolean).join(" · ")}</> : null}
        </p>
      </header>

      <section className="mb-6" aria-labelledby="devis">
        <h2 id="devis" className="mb-3 text-lg font-semibold">
          Devis
        </h2>
        {p.quotes.length === 0 ? <p className="text-sm text-muted">Aucun devis pour le moment.</p> : null}
        <div className="space-y-4">
          {p.quotes.map((q) => (
            <article key={q.id} className="card p-5">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h3 className="font-semibold">
                    {q.number} {q.title ? `· ${q.title}` : ""}
                  </h3>
                  <p className="text-sm text-muted">
                    {q.statusLabel} · {formatEuros(q.totalTtcCents)} TTC
                    {q.validUntil && q.awaitingAnswer ? ` · valable jusqu'au ${day(q.validUntil)}` : ""}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <a className="btn-secondary" href={`${base}/devis/${q.id}`} target="_blank" rel="noreferrer">
                    PDF
                  </a>
                  {q.awaitingAnswer ? (
                    <a className="btn-primary" href={`${base}/repondre/${q.id}`}>
                      Répondre au devis
                    </a>
                  ) : null}
                </div>
              </div>
              {q.status !== "canceled" ? (
                <details className="mt-4" open={q.messages.length > 0}>
                  <summary className="cursor-pointer text-sm font-medium">
                    Échanges sur ce devis {q.messages.length ? `(${q.messages.length})` : ""}
                  </summary>
                  <div className="mt-3">
                    <ClientMessages
                      endpoint={`${base}/messages`}
                      quoteId={q.id}
                      idPrefix={`q${q.id.slice(0, 8)}`}
                      orgName={p.org.trade_name}
                      lines={[]}
                      thread={q.messages.map((m) => ({
                        id: m.id,
                        author_type: m.author_type,
                        author_name: m.author_name,
                        kind: m.kind,
                        line_label: m.line_label,
                        body: m.body,
                        handled: !!m.handled_at,
                        at: when(m.created_at),
                      }))}
                    />
                  </div>
                </details>
              ) : null}
            </article>
          ))}
        </div>
      </section>

      <section className="mb-6" aria-labelledby="factures">
        <h2 id="factures" className="mb-3 text-lg font-semibold">
          Factures
        </h2>
        {p.invoices.length === 0 ? (
          <p className="text-sm text-muted">Aucune facture pour le moment.</p>
        ) : (
          <div className="card overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-muted">
                  <th className="p-3">Facture</th>
                  <th className="p-3">Date</th>
                  <th className="p-3 text-right">Montant TTC</th>
                  <th className="p-3 text-right">Reste à payer</th>
                  <th className="p-3">
                    <span className="sr-only">Document</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {p.invoices.map((i) => (
                  <tr key={i.id} className="border-t border-border">
                    <td className="p-3">
                      {i.number}
                      {i.title ? <span className="block text-xs text-muted">{i.title}</span> : null}
                    </td>
                    <td className="p-3">{day(i.issueDate)}</td>
                    <td className="p-3 text-right">{formatEuros(i.totalTtcCents)}</td>
                    <td className="p-3 text-right">{i.balanceCents > 0 ? formatEuros(i.balanceCents) : "Réglée"}</td>
                    <td className="p-3 text-right">
                      <a className="link" href={`${base}/facture/${i.id}`} target="_blank" rel="noreferrer">
                        PDF
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {p.receptions.length ? (
        <section className="mb-6" aria-labelledby="receptions">
          <h2 id="receptions" className="mb-3 text-lg font-semibold">
            Réceptions de travaux
          </h2>
          <ul className="card divide-y divide-border">
            {p.receptions.map((r) => (
              <li key={r.id} className="flex items-center justify-between p-3 text-sm">
                <span>
                  {r.title} · reçu le {day(r.date)}
                </span>
                <a className="link" href={`${base}/reception/${r.id}`} target="_blank" rel="noreferrer">
                  Procès-verbal
                </a>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </Frame>
  );
}

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-bg">
      <main className="mx-auto max-w-4xl px-4 py-8">{children}</main>
      <footer className="flex items-center justify-center gap-2 pb-8 text-xs text-muted">
        <Logo size={14} /> Espace client Pilot-Makers. Lien personnel : ne le partagez pas.
      </footer>
    </div>
  );
}
