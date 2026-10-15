import { templateAcquireAction, templateSettleAction, templateWithdrawAction } from "@/app/actions";
import { Icon } from "@/components/Icon";
import { ActionForm } from "@/components/forms/ActionForm";
import { Submit } from "@/components/forms/Submit";
import { Empty, Notice, PageHeader, Section, fmtDate } from "@/components/ui";
import { formatEuros } from "@/lib/calc/format";
import { requirePageCtx } from "@/lib/server/session";
import { marketListings, marketTrades, myMarket } from "@/lib/services/template-market";
import { EXPERIENCE_MIN, PURCHASE_STATUS } from "@/lib/template-market";

export const metadata = { title: "Bourse aux modèles" };

const cap = (v: string) => v.charAt(0).toUpperCase() + v.slice(1);

/** Modèles de devis publiés par des confrères, gratuits ou vendus, et suivi de ses propres publications. */
export default async function TemplateMarketPage({ searchParams }: { searchParams: Promise<{ metier?: string; q?: string }> }) {
  const ctx = await requirePageCtx();
  const sp = await searchParams;
  const [list, trades, mine] = await Promise.all([marketListings(ctx, { trade: sp.metier, q: sp.q }), marketTrades(ctx), myMarket(ctx)]);
  const manager = ctx.role !== "member";
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader
        title="Bourse aux modèles"
        subtitle="Des devis types construits par des artisans expérimentés : sections, lignes et prix de vente prêts à adapter. Le coût de revient et les notes internes du vendeur ne sont jamais transmis."
        back={{ href: "/app/modeles", label: "Modèles de devis" }}
      />
      {mine.pending.length ? (
        <Section
          title="Demandes d'achat à régler"
          description="Transmettez vos coordonnées de règlement à l'acheteur, puis confirmez le règlement reçu : le modèle lui est livré aussitôt."
        >
          <ul className="divide-y divide-line" data-testid="bourse-demandes">
            {mine.pending.map((p) => (
              <li key={p.id} className="flex flex-col gap-2 py-3 text-sm sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="font-medium">
                    {p.title} : {formatEuros(p.price_cents)}
                  </p>
                  <p className="text-muted">
                    {p.buyer}
                    {p.email ? `, ${p.email}` : ""}, le {fmtDate(String(p.created_at))}
                  </p>
                </div>
                {manager ? (
                  <ActionForm action={templateSettleAction} className="shrink-0">
                    <input type="hidden" name="purchaseId" value={p.id} />
                    <Submit className="btn-secondary">Règlement reçu</Submit>
                  </ActionForm>
                ) : null}
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      <form method="get" className="card flex flex-wrap items-end gap-3 p-4">
        <div className="min-w-0 flex-1">
          <label className="label" htmlFor="bm-q">
            Rechercher
          </label>
          <input id="bm-q" name="q" className="field" defaultValue={sp.q ?? ""} placeholder="Salle de bain, toiture..." />
        </div>
        <div>
          <label className="label" htmlFor="bm-metier">
            Métier
          </label>
          <select id="bm-metier" name="metier" className="field" defaultValue={sp.metier ?? ""}>
            <option value="">Tous les métiers</option>
            {trades.map((t) => (
              <option key={t} value={t}>
                {cap(t)}
              </option>
            ))}
          </select>
        </div>
        <button type="submit" className="btn-secondary">
          <Icon name="search" size={16} /> Filtrer
        </button>
      </form>

      {list.length ? (
        <ul className="space-y-3" data-testid="bourse-modeles">
          {list.map((l) => (
            <li key={l.id} className="card space-y-3 p-4">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <h2 className="font-semibold">{l.title}</h2>
                  <p className="text-xs text-muted">
                    {l.seller}
                    {l.trade ? `, ${l.trade}` : ""} : {l.sellerAccepted} devis acceptés
                    {l.sellerRating != null ? `, avis ${String(l.sellerRating).replace(".", ",")} sur 5` : ""}. Repris {l.buyers} fois.
                  </p>
                </div>
                <p className="shrink-0 text-lg font-semibold">{l.priceCents ? formatEuros(l.priceCents) : "Gratuit"}</p>
              </div>
              {l.summary ? <p className="text-sm">{l.summary}</p> : null}
              <ul className="space-y-1 text-sm text-muted">
                {l.preview.map((s, i) => (
                  <li key={i}>
                    <span className="font-medium text-ink">{s.title}</span> : {s.lines} ligne{s.lines > 1 ? "s" : ""}
                    {s.sample.length ? ` (${s.sample.join(", ")}${s.lines > s.sample.length ? "..." : ""})` : ""}
                  </li>
                ))}
              </ul>
              {l.mine ? (
                <p className="flex items-center gap-2 text-sm text-success">
                  <Icon name="check" size={16} /> {PURCHASE_STATUS[l.mine]}
                </p>
              ) : manager ? (
                <ActionForm action={templateAcquireAction}>
                  <input type="hidden" name="listingId" value={l.id} />
                  <Submit>{l.priceCents ? `Acheter pour ${formatEuros(l.priceCents)}` : "Ajouter à mes modèles"}</Submit>
                </ActionForm>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <Empty icon="copy" title="Aucun modèle ne correspond">
          Les modèles publiés par vos confrères apparaîtront ici.
        </Empty>
      )}

      <Section
        title="Vos modèles dans la bourse"
        description={`Publiez un modèle depuis Modèles de devis. La vente est ouverte à partir de ${EXPERIENCE_MIN} devis acceptés (vous en avez ${mine.accepted}) ; le partage gratuit, à tous.`}
      >
        {!mine.canSell ? <Notice tone="info">Vous pouvez dès maintenant céder vos modèles gratuitement à vos confrères.</Notice> : null}
        {mine.listings.length ? (
          <ul className="mt-3 divide-y divide-line" data-testid="bourse-mes-modeles">
            {mine.listings.map((l) => (
              <li key={l.id} className="flex flex-col gap-2 py-3 text-sm sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="font-medium">{l.title}</p>
                  <p className="text-muted">
                    {l.price_cents ? formatEuros(l.price_cents) : "Gratuit"}, repris {l.buyers} fois, {l.status === "publie" ? "publié" : "retiré"}
                  </p>
                </div>
                {manager && l.status === "publie" ? (
                  <ActionForm action={templateWithdrawAction} className="shrink-0">
                    <input type="hidden" name="listingId" value={l.id} />
                    <Submit className="btn-ghost">Retirer</Submit>
                  </ActionForm>
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-sm text-muted">Aucun modèle publié.</p>
        )}
        {mine.earnedCents ? <p className="mt-3 text-sm">Ventes réglées : {formatEuros(mine.earnedCents)}</p> : null}
      </Section>
    </div>
  );
}
