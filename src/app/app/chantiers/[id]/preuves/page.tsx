import { Icon } from "@/components/Icon";
import { PageHeader } from "@/components/ui";
import { requirePageCtx } from "@/lib/server/session";
import { jobEvidence } from "@/lib/services/evidence";

export const metadata = { title: "Dossier de preuves" };

const ICONS: Record<string, string> = { devis: "quote", photo: "eye", note: "note", reception: "check", reserve: "hammer", facture: "euro", paiement: "card" };
const fmt = new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", dateStyle: "medium", timeStyle: "short" });

/** Dossier de preuves : chronologie horodatée, points de contrôle et archive vérifiable. */
export default async function EvidencePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requirePageCtx();
  const e = await jobEvidence(ctx, id);
  const done = e.checks.filter((c) => c.ok).length;
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader
        title="Dossier de preuves"
        subtitle={`${e.title} : tout ce qui a été signé, photographié et horodaté, avec l'empreinte de chaque pièce, à remettre au client, à l'assureur ou à un médiateur en cas de désaccord.`}
        back={{ href: `/app/chantiers/${id}`, label: "Chantier" }}
        actions={
          <a className="btn-primary" href={`/api/jobs/${id}/preuves`}>
            <Icon name="download" size={16} /> Télécharger le dossier
          </a>
        }
      />

      <section className="card p-4" aria-labelledby="dp-controle">
        <h2 id="dp-controle" className="mb-3 font-semibold">
          Points de contrôle : {done} sur {e.checks.length}
        </h2>
        <ul className="space-y-3">
          {e.checks.map((c) => (
            <li key={c.key} className="flex items-start gap-3">
              <Icon name={c.ok ? "check" : "alert"} size={18} className={c.ok ? "mt-0.5 text-success" : "mt-0.5 text-warning"} />
              <div className="min-w-0">
                <p className="font-medium">{c.label}</p>
                {!c.ok ? <p className="text-sm text-muted">{c.hint}</p> : null}
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section className="card p-4" aria-labelledby="dp-chrono">
        <h2 id="dp-chrono" className="mb-3 font-semibold">
          Chronologie
        </h2>
        {e.timeline.length ? (
          <ol className="space-y-3">
            {e.timeline.map((t, i) => (
              <li key={`${t.at}-${i}`} className="flex items-start gap-3">
                <Icon name={ICONS[t.kind] ?? "info"} size={18} className="mt-0.5 text-muted" />
                <div className="min-w-0">
                  <p className="text-sm text-muted tabular-nums">{fmt.format(new Date(t.at))}</p>
                  <p className="break-words">{t.text}</p>
                  {t.sha256 ? <p className="font-mono text-xs break-all text-muted">SHA-256 {t.sha256}</p> : null}
                </div>
              </li>
            ))}
          </ol>
        ) : (
          <p className="text-sm text-muted">Aucun événement pour l&apos;instant.</p>
        )}
      </section>

      <p className="text-sm text-muted">
        L&apos;archive contient le devis accepté, les photos du journal, le procès-verbal de réception, les factures, la chronologie et le fichier des
        empreintes SHA-256. Chaque téléchargement est enregistré avec l&apos;empreinte de l&apos;archive.
      </p>
    </div>
  );
}
