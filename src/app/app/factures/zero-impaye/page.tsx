import Link from "next/link";
import { Icon } from "@/components/Icon";
import { Empty, Notice, PageHeader } from "@/components/ui";
import { formatEuros } from "@/lib/calc/format";
import { requirePageCtx } from "@/lib/server/session";
import { unpaidExposure } from "@/lib/services/unpaid-exposure";
import { LEVEL_LABELS } from "@/lib/unpaid-exposure";

export const metadata = { title: "Zéro impayé" };

const TONE = { ok: "text-success", surveiller: "text-warning", risque: "text-danger" } as const;

/** Zéro impayé : ce que l'entreprise a avancé à chaque client, et comment le réduire. */
export default async function ZeroUnpaidPage() {
  const ctx = await requirePageCtx();
  const p = await unpaidExposure(ctx);
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageHeader
        title="Zéro impayé"
        subtitle="Sur chaque chantier en cours, la valeur des travaux réalisés comparée à ce qui est facturé et encaissé : l'écart est l'avance consentie au client."
        back={{ href: "/app/factures", label: "Factures" }}
      />
      <section className="grid gap-3 sm:grid-cols-3" aria-label="Synthèse">
        <div className="card p-4">
          <p className="text-sm text-muted">Avance totale aux clients</p>
          <p className="text-2xl font-semibold tabular-nums" data-testid="avance-totale">
            {formatEuros(p.totalExposureCents)}
          </p>
        </div>
        <div className="card p-4">
          <p className="text-sm text-muted">Chantiers à risque ou à surveiller</p>
          <p className="text-2xl font-semibold tabular-nums">
            {p.atRisk} <span className="text-base font-normal text-muted">et</span> {p.toWatch}
          </p>
        </div>
        <div className="card p-4">
          <p className="text-sm text-muted">Chantiers payés par étapes validées</p>
          <p className="text-2xl font-semibold tabular-nums">{p.stagesCoverage == null ? "aucun chantier" : `${p.stagesCoverage} %`}</p>
        </div>
      </section>

      {p.atRisk ? (
        <Notice tone="warning" title="Avance importante sur certains chantiers">
          Facturez la part réalisée et proposez le paiement par étapes validées : chaque étape approuvée en photo par le client se facture aussitôt.
        </Notice>
      ) : null}

      {p.jobs.length ? (
        <ul className="space-y-3">
          {p.jobs.map((j) => (
            <li key={j.jobId} className="card space-y-2 p-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <div className="min-w-0">
                  <Link href={`/app/chantiers/${j.jobId}`} className="link font-medium">
                    {j.title}
                  </Link>
                  {j.customer ? <span className="text-sm text-muted">, {j.customer}</span> : null}
                </div>
                <p className={`flex items-center gap-1 text-sm font-medium ${TONE[j.level]}`}>
                  <Icon name={j.level === "ok" ? "check" : "alert"} size={16} /> {LEVEL_LABELS[j.level]}
                </p>
              </div>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-4">
                <div>
                  <dt className="text-muted">Réalisé</dt>
                  <dd className="tabular-nums">
                    {formatEuros(j.doneValueCents)} ({Math.round(j.progressBp / 100)} %)
                  </dd>
                </div>
                <div>
                  <dt className="text-muted">Facturé</dt>
                  <dd className="tabular-nums">{formatEuros(j.invoicedTtcCents)}</dd>
                </div>
                <div>
                  <dt className="text-muted">Encaissé</dt>
                  <dd className="tabular-nums">{formatEuros(j.paidTtcCents)}</dd>
                </div>
                <div>
                  <dt className="text-muted">Avance au client</dt>
                  <dd className="font-semibold tabular-nums">{formatEuros(j.exposureCents)}</dd>
                </div>
              </dl>
              {j.advice.length ? (
                <ul className="list-disc space-y-0.5 pl-5 text-sm">
                  {j.advice.map((a) => (
                    <li key={a}>{a}</li>
                  ))}
                </ul>
              ) : null}
              <div className="flex flex-wrap gap-3 text-sm">
                <Link href={`/app/devis/${j.quoteId}/etapes`} className="link">
                  {j.hasStages ? "Étapes de paiement" : "Mettre en place le paiement par étapes"}
                </Link>
                <Link href={`/app/devis/${j.quoteId}`} className="link">
                  Facturer depuis le devis
                </Link>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <Empty icon="euro" title="Aucun chantier en cours">
          Les chantiers en cours issus d&apos;un devis accepté apparaissent ici, avec l&apos;avance consentie à chaque client.
        </Empty>
      )}
    </div>
  );
}
