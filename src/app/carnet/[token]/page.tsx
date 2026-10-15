import { HomeTimeline, frDate } from "@/components/HomeTimeline";
import { Notice } from "@/components/ui";
import { getDb } from "@/lib/db";
import { sharedHomeRecord } from "@/lib/services/home-records";

export const dynamic = "force-dynamic";
export const metadata = { title: "Carnet de logement", robots: { index: false, follow: false } };

/** Carnet transmis en lecture seule : adresse, historique et garanties, sans montant ni nom du client. */
export default async function SharedHomeRecordPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const h = await sharedHomeRecord(await getDb(), token);
  return (
    <main className="min-h-screen bg-bg px-4 py-8">
      <div className="card mx-auto max-w-2xl space-y-5 p-6">
        {!h ? (
          <Notice tone="warning" title="Lien invalide">
            Ce lien n&apos;existe pas, a expiré ou a été révoqué.
          </Notice>
        ) : (
          <>
            <div>
              <h1 className="text-xl font-semibold">Carnet du logement</h1>
              <p className="text-sm">
                {h.address.line1}, {h.address.postalCode} {h.address.city}
              </p>
              <p className="text-sm text-muted">
                Tenu par {h.org?.name}
                {h.org?.city ? ` (${h.org.city})` : ""}
                {h.org?.phone ? `, ${h.org.phone}` : ""}
                {h.org?.email ? `, ${h.org.email}` : ""}.
              </p>
            </div>
            <p className="text-sm">
              <a href={`/api/public/carnet/${token}/export`} className="link" download>
                Télécharger le fichier du carnet
              </a>{" "}
              <span className="text-muted">(format ouvert, à garder et à confier au prochain artisan)</span>
            </p>
            <section className="space-y-2">
              <h2 className="font-semibold">Garanties en cours</h2>
              {h.warranties.length ? (
                <ul className="divide-y divide-border text-sm" data-testid="garanties-logement">
                  {h.warranties.map((w, i) => (
                    <li key={i} className="flex flex-wrap justify-between gap-2 py-2">
                      <span>
                        <span className="font-medium">{w.label}</span> <span className="text-muted">{w.source}</span>
                      </span>
                      <span className="tabular-nums">jusqu&apos;au {frDate(w.end)}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted">Aucune garantie en cours.</p>
              )}
            </section>
            <section className="space-y-2">
              <h2 className="font-semibold">Historique</h2>
              {h.items.length ? <HomeTimeline items={h.items} /> : <p className="text-sm text-muted">Aucune entrée.</p>}
            </section>
          </>
        )}
      </div>
    </main>
  );
}
