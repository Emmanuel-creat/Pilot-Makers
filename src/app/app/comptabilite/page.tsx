import Link from "next/link";
import { Icon, type IconName } from "@/components/Icon";
import { PageHeader } from "@/components/ui";
import { requirePageCtx } from "@/lib/server/session";
import { getPlan, PLAN_FIELDS } from "@/lib/services/accounting-plan";
import { can, isReadOnlyMember } from "@/lib/services/context";
import { ACCOUNTING_FORMATS } from "@/lib/services/fec";

export const metadata = { title: "Comptabilité" };

function Tile({ href, icon, title, children }: { href: string; icon: IconName; title: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="card block p-5 transition-colors hover:border-accent/40">
      <div className="flex items-center gap-2 font-semibold">
        <Icon name={icon} size={18} className="text-accent" /> {title}
      </div>
      <p className="mt-1 text-sm text-muted">{children}</p>
    </Link>
  );
}

export default async function AccountingPage() {
  const ctx = await requirePageCtx();
  if (!can(ctx, "billing")) {
    return (
      <div className="mx-auto max-w-4xl">
        <PageHeader title="Comptabilité" />
        <p className="card p-5 text-sm">La comptabilité est réservée aux personnes qui gèrent la facturation.</p>
      </div>
    );
  }
  const plan = await getPlan(ctx);
  const year = new Date().getFullYear();
  const accountant = isReadOnlyMember(ctx);
  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title="Comptabilité"
        subtitle={
          accountant ? "Pièces et exports de l'entreprise, en consultation." : "Tout ce que votre expert-comptable attend de vous, au même endroit."
        }
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <Tile href="/app/factures" icon="euro" title="Factures et avoirs">
          Factures émises, règlements reçus et PDF d&apos;origine.
        </Tile>
        <Tile href="/app/rapports/tva" icon="note" title="TVA à déclarer">
          TVA collectée sur les encaissements, par taux et par période.
        </Tile>
        <Tile href="/app/rapports/tresorerie" icon="chart" title="Trésorerie">
          Prévision sur 3 mois et factures en retard.
        </Tile>
        <Tile href="/app/comptabilite/bilan" icon="calendar" title="Préparation du bilan">
          Points de clôture de l&apos;exercice et dossier pour l&apos;expert-comptable.
        </Tile>
      </div>

      <section className="card mt-6 p-5" aria-labelledby="fec-titre">
        <h2 id="fec-titre" className="font-semibold">
          Écritures comptables
        </h2>
        <form action="/api/exports/fec" method="get" className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-end">
          <div>
            <label className="label" htmlFor="cpt-du">
              Du
            </label>
            <input id="cpt-du" name="du" type="date" className="field" defaultValue={`${year}-01-01`} required />
          </div>
          <div>
            <label className="label" htmlFor="cpt-au">
              Au
            </label>
            <input id="cpt-au" name="au" type="date" className="field" defaultValue={`${year}-12-31`} required />
          </div>
          <div>
            <label className="label" htmlFor="cpt-format">
              Format
            </label>
            <select id="cpt-format" name="format" className="field" defaultValue="fec">
              {Object.entries(ACCOUNTING_FORMATS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </div>
          <button className="btn-secondary">
            <Icon name="download" size={16} /> Télécharger
          </button>
        </form>
        <p className="mt-2 text-xs text-muted">
          Ventes, règlements, notes de frais validées et leurs remboursements, avec les comptes du plan ci-dessous. Pennylane, Sage, Cegid, EBP, Quadra et
          QuickBooks importent le FEC ; le format tableur sert aux imports paramétrables.{" "}
          <Link href="/aide/exporter-vers-le-logiciel-comptable" className="underline">
            Importer dans votre logiciel
          </Link>
        </p>
      </section>

      <section className="card mt-6 p-5" aria-labelledby="plan-titre">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <h2 id="plan-titre" className="font-semibold">
            Plan comptable utilisé
          </h2>
          {can(ctx, "settings") ? (
            <Link className="link text-sm" href="/app/entreprise?onglet=comptabilite">
              Modifier les comptes
            </Link>
          ) : null}
        </div>
        <dl className="mt-3 grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2" data-testid="plan-comptable">
          {PLAN_FIELDS.filter((f) => plan.ventilate || !["goods", "subcontracting", "travel"].includes(f.key)).map((f) => (
            <div key={f.key} className="flex justify-between gap-3 border-b border-line py-1">
              <dt className="text-muted">{f.label}</dt>
              <dd className="tabular font-medium">{plan[f.key]}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-2 text-xs text-muted">
          {plan.ventilate ? "Chiffre d'affaires ventilé par nature de ligne." : "Tout le chiffre d'affaires passe sur un seul compte de prestations."}
        </p>
      </section>

      {can(ctx, "settings") ? (
        <section className="card mt-6 flex flex-wrap items-center justify-between gap-3 p-5 text-sm">
          <p>
            Donnez à votre cabinet un accès en lecture : il consulte et télécharge lui-même, sans rien pouvoir modifier, et ne compte pas dans vos
            utilisateurs.
          </p>
          <Link className="btn-secondary" href="/app/equipe">
            <Icon name="send" size={16} /> Inviter mon expert-comptable
          </Link>
        </section>
      ) : null}
    </div>
  );
}
