import Link from "next/link";
import { bandLabel, REASONS, REVENUE_BANDS, STAFF_BANDS } from "@/lib/business-takeover";
import { getDb } from "@/lib/db";
import { publicTransferListings, publicTransferTrades } from "@/lib/services/business-takeover";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Reprendre une entreprise artisanale",
  description:
    "Entreprises artisanales du bâtiment à reprendre, publiées de façon anonyme par leurs dirigeants, avec des chiffres tirés de leur activité réelle.",
};

const cap = (v: string) => v.charAt(0).toUpperCase() + v.slice(1);

/** Plateforme de reprise : annonces anonymes des artisans qui cherchent un successeur. */
export default async function TakeoverListPage({ searchParams }: { searchParams: Promise<{ departement?: string; metier?: string }> }) {
  const sp = await searchParams;
  const db = await getDb();
  const [list, trades] = await Promise.all([publicTransferListings(db, { department: sp.departement, trade: sp.metier }), publicTransferTrades(db)]);
  return (
    <div className="mx-auto max-w-3xl space-y-8 px-4 py-12">
      <header className="space-y-2">
        <h1 className="text-3xl font-semibold text-balance">Reprendre une entreprise artisanale</h1>
        <p className="text-muted">
          Des artisans du bâtiment cherchent un successeur. Chaque annonce est anonyme ; le chiffre d&apos;affaires et l&apos;effectif sont donnés en tranches,
          calculés à partir de l&apos;activité réellement facturée. Écrivez au cédant : il choisit de vous répondre.
        </p>
      </header>

      <form method="get" className="card flex flex-wrap items-end gap-3 p-4">
        <div>
          <label className="label" htmlFor="rp-dep">
            Département
          </label>
          <input id="rp-dep" name="departement" className="field w-28" defaultValue={sp.departement ?? ""} placeholder="69" maxLength={3} />
        </div>
        <div>
          <label className="label" htmlFor="rp-metier">
            Métier
          </label>
          <select id="rp-metier" name="metier" className="field" defaultValue={sp.metier ?? ""}>
            <option value="">Tous les métiers</option>
            {trades.map((t) => (
              <option key={t} value={t}>
                {cap(t)}
              </option>
            ))}
          </select>
        </div>
        <button type="submit" className="btn-secondary">
          Filtrer
        </button>
      </form>

      {list.length ? (
        <ul className="space-y-4" data-testid="reprise-annonces">
          {list.map((l) => (
            <li key={l.id} className="card space-y-2 p-5">
              <p className="text-xs uppercase tracking-wide text-muted">
                {l.ref} · {cap(l.trade)} · département {l.department}
              </p>
              <h2 className="text-lg font-semibold">
                <Link href={`/reprendre-une-entreprise/${l.id}`} className="hover:underline">
                  {l.headline}
                </Link>
              </h2>
              <p className="text-sm text-muted">
                {bandLabel(REVENUE_BANDS, l.revenueBand)} de chiffre d&apos;affaires · {bandLabel(STAFF_BANDS, l.staffBand)} ·{" "}
                {REASONS[l.reason as keyof typeof REASONS] ?? "Cession"}
              </p>
            </li>
          ))}
        </ul>
      ) : (
        <p className="card p-5 text-muted">Aucune entreprise à reprendre ne correspond pour le moment.</p>
      )}

      <section className="space-y-2" aria-labelledby="rp-cedant">
        <h2 id="rp-cedant" className="text-xl font-semibold">
          Vous cherchez un repreneur ?
        </h2>
        <p className="text-muted">
          Depuis Pilot-Makers, le dossier de transmission valorise votre entreprise à partir de votre historique, et l&apos;annonce se publie en un clic sans
          révéler votre nom.{" "}
          <Link href="/inscription" className="link">
            Créer un compte
          </Link>
        </p>
      </section>
    </div>
  );
}
