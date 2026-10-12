import Link from "next/link";
import { Icon } from "@/components/Icon";
import { Empty, PageHeader, Section, Stat, fmtDate } from "@/components/ui";
import { formatEuros } from "@/lib/calc/format";
import { requirePageCtx } from "@/lib/server/session";
import { EVENT_LABELS, getDashboard } from "@/lib/services/dashboard";

export const metadata = { title: "Tableau de bord" };

export default async function Dashboard() {
  const ctx = await requirePageCtx();
  const d = await getDashboard(ctx);
  const c = d.counts;
  const total = Object.values(c).reduce((a, b) => a + b, 0);
  const org = await ctx.db.query<{ siret: string; address_line1: string }>("SELECT siret, address_line1 FROM organizations WHERE id=$1", [ctx.orgId]);
  const profileIncomplete = !org[0]?.siret || !org[0]?.address_line1;
  return (
    <>
      <PageHeader
        title={`Bonjour ${ctx.userName.split(" ")[0] ?? ""}`}
        subtitle="Ce qui demande votre attention aujourd'hui."
        actions={
          <Link href="/app/devis/nouveau" className="btn-primary">
            <Icon name="plus" /> Créer un devis
          </Link>
        }
      />
      {profileIncomplete ? (
        <Link href="/app/bienvenue" className="card mb-6 flex items-center gap-3 border-warning/40 bg-warning-soft p-4 text-sm">
          <Icon name="building" className="text-warning" />
          <span className="flex-1">Complétez le profil de votre entreprise (adresse, SIRET, assurance) pour pouvoir émettre vos devis.</span>
          <Icon name="right" />
        </Link>
      ) : null}
      {total === 0 ? (
        <Empty
          icon="quote"
          title="Aucun devis pour l'instant"
          action={
            <Link href="/app/devis/nouveau" className="btn-primary">
              Créer mon premier devis
            </Link>
          }
        >
          Commencez par votre catalogue de prestations, ou décrivez directement un chantier : l'assistant vous propose des lignes.
        </Empty>
      ) : (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat label="Brouillons" value={c.draft + c.incomplete} hint={c.incomplete ? `dont ${c.incomplete} à compléter` : undefined} href="/app/devis?status=drafts" />
            <Stat label="À envoyer" value={c.ready} href="/app/devis?status=ready" />
            <Stat label="En attente de réponse" value={c.sent + c.viewed} hint={c.viewed ? `dont ${c.viewed} consulté(s)` : undefined} href="/app/devis?status=pending" />
            <Stat label="Acceptés" value={c.accepted} href="/app/devis?status=accepted" />
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label="Montant des devis en cours" value={formatEuros(d.pendingAmountTtcCents)} hint="TTC, devis émis sans réponse" />
            <Stat label={`Devis acceptés (${d.periodDays} j)`} value={formatEuros(d.acceptedAmountHtCents)} hint="HT. Ce n'est pas du chiffre d'affaires encaissé." />
            <Stat label="Taux d'acceptation" value={d.acceptanceRate === null ? "-" : `${String(d.acceptanceRate).replace(".", ",")} %`} hint={`Sur ${d.periodDays} jours, acceptés / (acceptés + refusés)`} />
            <Stat label="Délai moyen de réponse" value={d.averageResponseDays === null ? "-" : `${String(d.averageResponseDays).replace(".", ",")} j`} hint="Entre l'envoi et la réponse" />
          </div>
          <div className="grid gap-6 lg:grid-cols-2">
            <Section title="Arrivent à expiration" description="Devis en attente dont la validité se termine sous 7 jours.">
              {d.expiringSoon.length === 0 ? (
                <p className="text-sm text-muted">Rien à signaler.</p>
              ) : (
                <ul className="divide-y divide-line">
                  {d.expiringSoon.map((q) => (
                    <li key={q.id}>
                      <Link href={`/app/devis/${q.id}`} className="flex items-center justify-between gap-3 py-2 text-sm hover:text-accent">
                        <span className="min-w-0 truncate">
                          <span className="font-medium">{q.number}</span> {q.title}
                        </span>
                        <span className="shrink-0 text-muted">{fmtDate(q.validUntil)}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </Section>
            <Section title="Chantiers à préparer" description="Devis acceptés : acompte, commande de matériaux, planning.">
              {d.toPrepare.length === 0 ? (
                <p className="text-sm text-muted">Aucun devis accepté pour le moment.</p>
              ) : (
                <ul className="divide-y divide-line">
                  {d.toPrepare.map((q) => (
                    <li key={q.id}>
                      <Link href={`/app/devis/${q.id}`} className="flex items-center justify-between gap-3 py-2 text-sm hover:text-accent">
                        <span className="min-w-0 truncate">
                          <span className="font-medium">{q.number}</span> {q.title}
                        </span>
                        <span className="tabular shrink-0">{formatEuros(q.totalTtcCents)}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </Section>
          </div>
          <div className="grid gap-6 lg:grid-cols-2">
            <Section title="Encaissements prévus" description="Factures restant dues par échéance, montants TTC.">
              <dl className="space-y-1.5 text-sm">
                {(
                  [
                    ["En retard", d.forecast.overdueCents, true],
                    ["Sous 30 jours", d.forecast.within30Cents, false],
                    ["De 30 à 60 jours", d.forecast.within60Cents, false],
                    ["De 60 à 90 jours", d.forecast.within90Cents, false],
                    ["Au-delà de 90 jours", d.forecast.laterCents, false],
                  ] as [string, number, boolean][]
                ).map(([label, cents, late]) => (
                  <div key={label} className="flex justify-between gap-3">
                    <dt className={late && cents > 0 ? "font-medium text-danger" : "text-muted"}>{label}</dt>
                    <dd className={`tabular ${late && cents > 0 ? "font-medium text-danger" : ""}`}>{formatEuros(cents)}</dd>
                  </div>
                ))}
                <div className="flex justify-between gap-3 border-t border-line pt-2">
                  <dt className="text-muted">Devis acceptés restant à facturer</dt>
                  <dd className="tabular">{formatEuros(d.forecast.notInvoicedCents)}</dd>
                </div>
              </dl>
              <Link href="/app/factures" className="link mt-3 inline-block text-sm">
                Voir les factures
              </Link>
            </Section>
            <Section title={`Raisons des refus (${d.periodDays} j)`} description="Ce que vos clients indiquent quand ils refusent un devis.">
              {d.refusals.length === 0 ? (
                <p className="text-sm text-muted">Aucun refus sur la période.</p>
              ) : (
                <ul className="space-y-2 text-sm">
                  {d.refusals.map((r) => {
                    const max = d.refusals[0].count;
                    return (
                      <li key={r.code || "none"}>
                        <div className="flex justify-between gap-3">
                          <span>{r.label}</span>
                          <span className="tabular text-muted">{r.count}</span>
                        </div>
                        <div className="mt-1 h-1.5 rounded-full bg-surface-2" aria-hidden="true">
                          <div className="h-1.5 rounded-full bg-accent" style={{ width: `${Math.max(6, Math.round((r.count / max) * 100))}%` }} />
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </Section>
          </div>
          <Section title="Activité récente">
            <ul className="divide-y divide-line">
              {d.recent.map((e, i) => (
                <li key={i} className="flex items-center gap-3 py-2 text-sm">
                  <Icon name={e.type === "accepted" ? "check" : e.type === "viewed" ? "eye" : e.type === "sent" ? "send" : "quote"} className="text-muted" size={16} />
                  <Link href={`/app/devis/${e.quoteId}`} className="min-w-0 flex-1 truncate hover:text-accent">
                    {EVENT_LABELS[e.type] ?? e.type} : {e.number ?? "brouillon"} {e.title}
                  </Link>
                  <span className="hidden shrink-0 text-muted sm:inline">{e.actor}</span>
                  <span className="shrink-0 text-muted">{fmtDate(e.createdAt, true)}</span>
                </li>
              ))}
            </ul>
          </Section>
        </div>
      )}
    </>
  );
}
