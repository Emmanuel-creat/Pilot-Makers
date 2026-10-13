import { Logo } from "@/components/Icon";
import { Notice } from "@/components/ui";
import { centsToInput, formatEuros } from "@/lib/calc/format";
import { getDb } from "@/lib/db";
import { HttpError } from "@/lib/http";
import { requestMeta } from "@/lib/server/session";
import { publicSubQuote } from "@/lib/services/subcontractor-quotes";
import { Answer } from "./Answer";

export const dynamic = "force-dynamic";
export const metadata = { title: "Demande de prix", robots: { index: false, follow: false } };

/** Page de réponse d'un sous-traitant à une demande de prix, sans compte. */
export default async function SubQuotePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const v = await publicSubQuote(await getDb(), token, await requestMeta()).catch((e) => {
    if (e instanceof HttpError && e.status === 429) return "limited" as const;
    throw e;
  });
  if (v === "limited") {
    return (
      <Frame>
        <Notice tone="warning" title="Trop de consultations">
          Cette page a été ouverte trop souvent depuis votre connexion en peu de temps. Patientez une minute puis rechargez la page.
        </Notice>
      </Frame>
    );
  }
  if (!v) {
    return (
      <Frame>
        <Notice tone="warning" title="Lien invalide ou fermé">
          Cette demande de prix n'est plus ouverte. Contactez l'entreprise qui vous l'a adressée.
        </Notice>
      </Frame>
    );
  }
  return (
    <Frame>
      <p className="text-sm text-muted">Demande de prix de {v.orgName}</p>
      <h1 className="mb-1 text-xl font-semibold">{v.title}</h1>
      <p className="mb-4 text-sm text-muted">Pour {v.subcontractorName}</p>
      {v.description ? <p className="card mb-6 whitespace-pre-wrap p-4 text-sm">{v.description}</p> : null}
      {v.status === "retenu" ? <Notice tone="success">Votre prix a été retenu. L'entreprise reviendra vers vous pour la suite.</Notice> : null}
      {v.status === "refuse" ? <Notice tone="info">L'entreprise n'a pas retenu cette proposition. Merci pour votre réponse.</Notice> : null}
      {v.expired && v.status === "demande" ? <Notice tone="warning">Ce lien a expiré : demandez-en un nouveau à l'entreprise.</Notice> : null}
      {v.answer && !v.canAnswer ? (
        <p className="mt-4 text-sm">
          Votre proposition : <strong>{formatEuros(v.answer.amountCents)} HT</strong>
          {v.answer.delay ? `, délai : ${v.answer.delay}` : ""}.
        </p>
      ) : null}
      {v.canAnswer ? (
        <section className="card p-5" aria-labelledby="reponse">
          <h2 id="reponse" className="mb-1 text-lg font-semibold">
            {v.answer ? "Votre proposition" : "Votre prix"}
          </h2>
          <p className="mb-4 text-sm text-muted">
            {v.answer
              ? "Vous pouvez la corriger tant que l'entreprise n'a pas décidé."
              : `Indiquez votre montant hors taxes. ${v.orgName} est prévenu dès votre réponse.`}
          </p>
          <Answer
            token={token}
            initial={v.answer ? { amount: centsToInput(v.answer.amountCents), delay: v.answer.delay, note: v.answer.note } : null}
          />
        </section>
      ) : null}
    </Frame>
  );
}

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-bg">
      <main className="mx-auto max-w-2xl px-4 py-8">{children}</main>
      <footer className="flex items-center justify-center gap-2 pb-8 text-xs text-muted">
        <Logo size={14} /> Demande transmise avec Pilot-Makers. Lien personnel : ne le partagez pas.
      </footer>
    </div>
  );
}
