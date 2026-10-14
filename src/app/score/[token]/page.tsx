import { HealthReport } from "@/components/HealthReport";
import { Notice } from "@/components/ui";
import { formatEuros } from "@/lib/calc/format";
import { getDb } from "@/lib/db";
import { sharedHealthScore } from "@/lib/services/health-score";

export const dynamic = "force-dynamic";
export const metadata = { title: "Score de santé", robots: { index: false, follow: false } };

const date = (iso: string) => new Date(iso).toLocaleDateString("fr-FR", { timeZone: "Europe/Paris" });

/** Lien partagé en lecture seule : note, indicateurs et trois montants, sans client ni document. */
export default async function SharedHealthPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const h = await sharedHealthScore(await getDb(), token);
  return (
    <main className="min-h-screen bg-bg px-4 py-8">
      <div className="card mx-auto max-w-2xl space-y-4 p-6">
        {!h ? (
          <Notice tone="warning" title="Lien invalide">
            Ce lien n&apos;existe pas, a expiré ou a été révoqué par l&apos;entreprise.
          </Notice>
        ) : (
          <>
            <div>
              <h1 className="text-xl font-semibold">Score de santé de {h.org?.name ?? "l'entreprise"}</h1>
              <p className="text-sm text-muted">{[h.org?.legal_form, h.org?.siret ? `SIRET ${h.org.siret}` : "", h.org?.city].filter(Boolean).join(", ")}</p>
              <p className="text-sm text-muted">
                Calculé le {date(h.date)} sur les douze derniers mois. Lien valable jusqu&apos;au {date(h.expiresAt)}.
              </p>
            </div>
            <HealthReport score={h.score} grade={h.grade} indicators={h.indicators} advice={false} />
            <dl className="grid gap-2 text-sm sm:grid-cols-3">
              <div>
                <dt className="text-muted">Chiffre d&apos;affaires HT</dt>
                <dd className="tabular-nums">{formatEuros(h.figures.revenueCents)}</dd>
              </div>
              <div>
                <dt className="text-muted">Reste à encaisser TTC</dt>
                <dd className="tabular-nums">{formatEuros(h.figures.outstandingCents)}</dd>
              </div>
              <div>
                <dt className="text-muted">Carnet à facturer HT</dt>
                <dd className="tabular-nums">{formatEuros(h.figures.backlogCents)}</dd>
              </div>
            </dl>
            <p className="text-xs text-muted">Données issues du logiciel de gestion de l&apos;entreprise, non auditées.</p>
          </>
        )}
      </div>
    </main>
  );
}
