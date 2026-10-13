import Link from "next/link";
import { notFound } from "next/navigation";
import { Icon } from "@/components/Icon";
import { Notice, fmtDate } from "@/components/ui";
import { formatEuros } from "@/lib/calc/format";
import { HttpError } from "@/lib/http";
import { NOTICE_DELAY_DAYS, RECOVERY_STAGES, addDays, type RecoveryStage } from "@/lib/recovery";
import { requirePageCtx } from "@/lib/server/session";
import { getInvoice, INVOICE_KINDS } from "@/lib/services/invoices";
import { parisDate } from "@/lib/services/quotes";
import { getRecovery } from "@/lib/services/recovery";
import { CopyButton } from "@/app/app/entreprise/CopyButton";
import { ClearNotice, NoticeForm } from "./NoticeForm";

export const metadata = { title: "Recouvrement" };

const STEPS: { key: RecoveryStage[]; title: string }[] = [
  { key: ["relances"], title: "Relances amiables" },
  { key: ["mise_en_demeure", "attente_reponse"], title: "Mise en demeure" },
  { key: ["injonction"], title: "Injonction de payer" },
];

function parseRate(v: string | undefined): number | null | undefined {
  if (v === undefined || !v.trim()) return undefined;
  const n = Number(v.replace(",", ".").replace("%", "").trim());
  return Number.isFinite(n) && n >= 0 && n <= 50 ? Math.round(n * 100) : undefined;
}

export default async function RecoveryPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ taux?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  const ctx = await requirePageCtx();
  const rateBp = parseRate(sp.taux);
  const [inv, r] = await Promise.all([getInvoice(ctx, id), getRecovery(ctx, id, { rateBp })]).catch((e) => {
    if (e instanceof HttpError && (e.status === 404 || e.status === 400)) notFound();
    throw e;
  });
  const writable = !ctx.entitlements.readOnly && !ctx.supportAccess;
  const today = parisDate(new Date());
  const current = STEPS.findIndex((x) => x.key.includes(r.stage));
  const c = r.claim;

  return (
    <div className="space-y-6">
      <div>
        <Link href={`/app/factures/${id}`} className="mb-1 inline-flex items-center gap-1 text-sm text-muted hover:text-ink">
          <Icon name="left" size={16} /> {INVOICE_KINDS[inv.kind]} {inv.number}
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">Recouvrement</h1>
        <p className="mt-1 text-sm text-muted">
          {inv.snapshot.customer.name}, échue le {fmtDate(inv.due_date)}. Étape : <span className="font-medium text-ink">{RECOVERY_STAGES[r.stage]}</span>.
        </p>
      </div>

      {r.stage === "a_jour" ? (
        <Notice tone="success">Cette facture n&apos;est pas en retard de paiement : il n&apos;y a rien à recouvrer.</Notice>
      ) : (
        <>
          <ol className="grid gap-2 sm:grid-cols-3" aria-label="Étapes du recouvrement">
            {STEPS.map((step, i) => (
              <li
                key={step.title}
                className={`card flex items-center gap-2 p-3 text-sm ${i === current ? "border-accent font-medium" : i < current ? "text-muted" : ""}`}
                aria-current={i === current ? "step" : undefined}
              >
                <Icon name={i < current ? "check" : i === current ? "right" : "clock"} size={16} />
                {i + 1}. {step.title}
              </li>
            ))}
          </ol>

          <section className="card space-y-3 p-4" data-testid="decompte">
            <h2 className="text-sm font-semibold">Sommes réclamées au {fmtDate(today)}</h2>
            <dl className="space-y-1 text-sm">
              <div className="flex justify-between gap-2">
                <dt className="text-muted">Principal restant dû</dt>
                <dd className="tabular">{formatEuros(c.principalCents)}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-muted">
                  Pénalités de retard ({c.days} jours
                  {c.rateBp ? ` à ${(c.rateBp / 100).toLocaleString("fr-FR")} % par an` : ", aucun taux"})
                </dt>
                <dd className="tabular">{formatEuros(c.penaltyCents)}</dd>
              </div>
              {c.flatFeeCents ? (
                <div className="flex justify-between gap-2">
                  <dt className="text-muted">Indemnité forfaitaire de recouvrement</dt>
                  <dd className="tabular">{formatEuros(c.flatFeeCents)}</dd>
                </div>
              ) : null}
              <div className="flex justify-between gap-2 border-t border-line pt-1 font-semibold">
                <dt>Total</dt>
                <dd className="tabular">{formatEuros(c.totalCents)}</dd>
              </div>
            </dl>
            <form className="flex flex-wrap items-end gap-2" method="get">
              <div>
                <label className="label" htmlFor="taux">
                  Taux annuel des pénalités (%)
                </label>
                <input
                  id="taux"
                  name="taux"
                  className="field w-32 tabular"
                  inputMode="decimal"
                  defaultValue={c.rateBp ? String(c.rateBp / 100).replace(".", ",") : ""}
                />
              </div>
              <button className="btn-secondary">
                <Icon name="refresh" size={16} /> Recalculer
              </button>
            </form>
            <p className="text-xs text-muted">
              {r.rateFromSettings
                ? "Taux repris de la mention de pénalités de vos factures."
                : "Indiquez le taux prévu par vos conditions de vente. Entre professionnels, il ne peut être inférieur à trois fois le taux d'intérêt légal."}
            </p>
          </section>

          <section className="card space-y-3 p-4">
            <h2 className="text-sm font-semibold">1. Relances amiables</h2>
            <p className="text-sm text-muted">
              {inv.reminder_count
                ? `${inv.reminder_count} relance${inv.reminder_count > 1 ? "s" : ""} envoyée${inv.reminder_count > 1 ? "s" : ""} automatiquement.`
                : "Aucune relance envoyée pour l'instant : activez les relances de factures dans les réglages, ou appelez le client."}{" "}
              Un appel reste souvent le moyen le plus rapide d&apos;obtenir un règlement ou un échéancier.
            </p>
          </section>

          <section className="card space-y-3 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm font-semibold">2. Mise en demeure</h2>
              <CopyButton text={r.letter} label="Copier la lettre" />
            </div>
            <p className="text-sm text-muted">
              À envoyer en recommandé avec accusé de réception, signée. Elle fait courir le délai de {NOTICE_DELAY_DAYS} jours et prouve que le client a été
              averti.
            </p>
            <label className="label" htmlFor="lettre">
              Lettre prête à imprimer, modifiable avant copie
            </label>
            <textarea id="lettre" className="field min-h-72 font-mono text-xs" defaultValue={r.letter} />
            {r.noticeSentOn ? (
              <div className="space-y-1 text-sm" data-testid="mise-en-demeure-envoyee">
                <p>
                  Envoyée le {fmtDate(r.noticeSentOn)}
                  {r.noticeRef ? `, recommandé n° ${r.noticeRef}` : ""}. Fin du délai le {fmtDate(addDays(r.noticeSentOn, NOTICE_DELAY_DAYS))}.
                </p>
                {writable ? <ClearNotice invoiceId={id} /> : null}
              </div>
            ) : writable ? (
              <NoticeForm invoiceId={id} today={today} min={inv.issue_date} />
            ) : null}
          </section>

          <section className="card space-y-3 p-4" data-testid="injonction">
            <h2 className="text-sm font-semibold">3. Injonction de payer</h2>
            <p className="text-sm text-muted">
              Procédure sans audience : le juge examine les pièces et, s&apos;il est convaincu, ordonne au client de payer. La requête est gratuite au tribunal
              judiciaire ; un commissaire de justice signifie ensuite l&apos;ordonnance au client.
            </p>
            {r.file.warnings.map((w) => (
              <Notice key={w} tone="warning">
                {w}
              </Notice>
            ))}
            <dl className="grid gap-2 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-muted">Juridiction</dt>
                <dd className="font-medium">{r.file.court}</dd>
                <dd className="text-xs text-muted">{r.file.courtHint}</dd>
              </div>
              <div>
                <dt className="text-muted">Formulaire</dt>
                <dd className="font-medium">{r.file.form}</dd>
                <dd className="text-xs text-muted">Prescription le {fmtDate(r.file.prescriptionDate)}.</dd>
              </div>
            </dl>
            <h3 className="text-sm font-medium">Pièces à joindre</h3>
            <ul className="space-y-1 text-sm">
              {r.file.pieces.map((p) => (
                <li key={p.label} className="flex items-start gap-2">
                  <span className={p.ok ? "text-success" : "text-muted"}>
                    <Icon name={p.ok ? "check" : "clock"} size={16} />
                  </span>
                  <span>
                    {p.label}
                    {p.hint ? <span className="block text-xs text-muted">{p.hint}</span> : null}
                  </span>
                </li>
              ))}
            </ul>
            <div className="flex flex-wrap gap-2">
              <a href={`/api/invoices/${id}/pdf?download=1`} className="btn-secondary">
                <Icon name="download" size={16} /> Facture en PDF
              </a>
              {inv.quote_id ? (
                <Link href={`/app/devis/${inv.quote_id}`} className="btn-secondary">
                  <Icon name="quote" size={16} /> Devis signé
                </Link>
              ) : null}
            </div>
            <p className="text-xs text-muted">
              Ces informations aident à préparer le dossier ; elles ne remplacent pas le conseil d&apos;un professionnel du droit. Vérifiez le formulaire en
              vigueur sur service-public.fr avant de déposer.
            </p>
          </section>
        </>
      )}
    </div>
  );
}
