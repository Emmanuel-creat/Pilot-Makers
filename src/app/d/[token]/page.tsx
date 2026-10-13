import { Logo } from "@/components/Icon";
import { SnapshotView } from "@/components/SnapshotView";
import { plainSummary } from "@/lib/plain-summary";
import { Notice } from "@/components/ui";
import { getDb } from "@/lib/db";
import { requestMeta } from "@/lib/server/session";
import { HttpError } from "@/lib/http";
import { recordClientView } from "@/lib/services/quotes";
import { reducedVatAttestation } from "@/lib/services/consumer";
import { publicOptionSource } from "@/lib/services/options";
import { ClientResponse } from "./ClientResponse";
import { ClientMessages } from "@/components/ClientMessages";
import { LANGS } from "@/lib/pdf/i18n";
import { publicThread, requestableLines } from "@/lib/services/client-space";

export const dynamic = "force-dynamic";
export const metadata = { title: "Votre devis", robots: { index: false, follow: false } };

/** Page de consultation du devis par le client final, via un lien temporaire et révocable. */
export default async function ClientQuotePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const r = await recordClientView(await getDb(), token, await requestMeta()).catch((e) => {
    if (e instanceof HttpError && e.status === 429) return "limited" as const;
    throw e;
  });
  if (r === "limited") {
    return (
      <Frame>
        <Notice tone="warning" title="Trop de consultations">
          Ce devis a été ouvert trop souvent depuis votre connexion en peu de temps. Patientez une minute puis rechargez la page.
        </Notice>
      </Frame>
    );
  }
  if (!r) {
    return (
      <Frame>
        <Notice tone="warning" title="Lien invalide ou expiré">
          Ce lien de consultation n'est plus valable. Contactez l'entreprise qui vous a transmis le devis pour en recevoir un nouveau.
        </Notice>
      </Frame>
    );
  }
  const s = r.version.snapshot;
  const thread = await publicThread(await getDb(), r.link.org_id, r.link.quote_id);
  const when = (d: Date) => new Date(d).toLocaleString("fr-FR", { timeZone: "Europe/Paris", dateStyle: "short", timeStyle: "short" });
  return (
    <Frame>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold">Devis {s.number}</h1>
          <p className="text-sm text-muted">Proposé par {s.org.trade_name}</p>
        </div>
        <div className="flex flex-col items-start gap-1 sm:items-end">
          <a className="btn-secondary" href={`/api/public/quotes/${token}/pdf`} target="_blank" rel="noreferrer">
            Télécharger le PDF
          </a>
          {s.documents?.length ? (
            <a className="link text-sm" href={`/api/public/quotes/${token}/documents`} target="_blank" rel="noreferrer">
              Fiches techniques et certificats ({s.documents.length})
            </a>
          ) : null}
          <p className="text-xs text-muted">
            Translation:{" "}
            {(Object.entries(LANGS) as [string, string][]).map(([code, name], i) => (
              <span key={code}>
                {i ? " · " : ""}
                <a className="link" href={`/api/public/quotes/${token}/pdf?langue=${code}`} target="_blank" rel="noreferrer" lang={code} hrefLang={code}>
                  {name}
                </a>
              </span>
            ))}
          </p>
        </div>
      </div>
      {r.revoked ? <Notice tone="warning">Ce lien a été désactivé par l'entreprise.</Notice> : null}
      {!r.isCurrent ? (
        <Notice tone="warning" title="Une version plus récente existe">
          Ce devis a été modifié depuis l'envoi de ce lien. Utilisez le dernier lien reçu pour répondre.
        </Notice>
      ) : null}
      {r.status === "accepted" ? (
        <Notice tone="success">
          Ce devis a été accepté. Merci pour votre confiance.{" "}
          {r.isCurrent ? (
            <a href={`/api/public/quotes/${token}/pdf?signe=1`} className="link">
              Télécharger l'exemplaire accepté
            </a>
          ) : null}
        </Notice>
      ) : null}
      {r.status === "refused" ? <Notice tone="info">Ce devis a été refusé.</Notice> : null}
      {r.status === "expired" ? <Notice tone="warning">La durée de validité de ce devis est dépassée.</Notice> : null}
      {r.status === "canceled" ? <Notice tone="warning">Ce devis a été annulé par l'entreprise.</Notice> : null}
      {s.customer.type === "particulier" ? (
        <section className="card mt-4 p-5" aria-labelledby="en-bref">
          <h2 id="en-bref" className="font-semibold">
            Ce devis en bref
          </h2>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
            {plainSummary(s).map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
        </section>
      ) : null}
      <div className="mt-4">
        <SnapshotView s={s} />
      </div>
      {r.canRespond ? (
        <div className="mt-6">
          <ClientResponse
            token={token}
            number={s.number}
            version={s.version}
            ttc={s.calc.totalTtcCents}
            withdrawal={Boolean(s.consumer?.withdrawal)}
            optionSource={publicOptionSource(s)}
            vatAttestation={s.consumer?.reducedVatBp.length ? reducedVatAttestation(s.consumer.reducedVatBp) : ""}
          />
        </div>
      ) : null}
      {!r.revoked && r.status !== "canceled" ? (
        <section className="card mt-6 p-5" aria-labelledby="echanges">
          <h2 id="echanges" className="mb-1 text-lg font-semibold">
            Une question, une modification ?
          </h2>
          <p className="mb-4 text-sm text-muted">Écrivez directement à {s.org.trade_name} : votre message est rattaché à ce devis.</p>
          <ClientMessages
            endpoint={`/api/public/quotes/${token}/messages`}
            orgName={s.org.trade_name}
            lines={r.canRespond ? requestableLines(s).map((l) => ({ id: l.id, label: l.label })) : []}
            thread={thread.map((m) => ({
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
        <Logo size={14} /> Devis transmis avec Pilot-Makers. Lien personnel : ne le partagez pas.
      </footer>
    </div>
  );
}
