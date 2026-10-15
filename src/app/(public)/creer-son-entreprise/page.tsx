import Link from "next/link";
import { Icon } from "@/components/Icon";
import { CREATION_DAY, compareStatuses, MICRO_CEILING, readAmount } from "@/lib/business-creation";

export const metadata = {
  title: "Créer son entreprise artisanale en une journée",
  description:
    "Choisir son statut selon son chiffre d'affaires et ses charges, puis la journée type : immatriculation, assurance, banque et premier devis envoyé.",
};

const eur = (n: number) => `${n.toLocaleString("fr-FR")} €`;

/** Création d'entreprise artisanale : statut comparé et journée type, jusqu'au premier devis. */
export default async function CreateBusinessPage({ searchParams }: { searchParams: Promise<{ ca?: string; charges?: string }> }) {
  const sp = await searchParams;
  const revenue = readAmount(sp.ca) ?? 50_000;
  const costs = readAmount(sp.charges) ?? 12_000;
  const c = compareStatuses(revenue, costs);
  return (
    <div className="mx-auto max-w-4xl space-y-8 px-4 py-12">
      <header className="space-y-2">
        <h1 className="text-3xl font-semibold text-balance">Créer son entreprise artisanale en une journée</h1>
        <p className="text-muted">
          Le matin, le statut et l&apos;immatriculation ; l&apos;après-midi, une entreprise équipée qui envoie son premier devis. Les montants sont des ordres
          de grandeur pour comparer les statuts, à confirmer avec un expert-comptable ou la chambre de métiers.
        </p>
      </header>

      <section className="card space-y-4 p-6" aria-labelledby="statut">
        <h2 id="statut" className="text-xl font-semibold">
          Quel statut choisir ?
        </h2>
        <form className="grid gap-3 sm:grid-cols-3" action="/creer-son-entreprise">
          <div>
            <label className="label" htmlFor="ce-ca">
              Chiffre d&apos;affaires annuel attendu (€ HT)
            </label>
            <input id="ce-ca" name="ca" inputMode="decimal" className="field" defaultValue={String(revenue)} />
          </div>
          <div>
            <label className="label" htmlFor="ce-charges">
              Charges annuelles (achats, véhicule, assurance)
            </label>
            <input id="ce-charges" name="charges" inputMode="decimal" className="field" defaultValue={String(costs)} />
          </div>
          <div className="flex items-end">
            <button className="btn-primary w-full">Comparer</button>
          </div>
        </form>
        <div className="overflow-x-auto">
          <table className="w-full text-sm" data-testid="comparaison-statuts">
            <caption className="sr-only">Comparaison des statuts</caption>
            <thead>
              <tr className="text-left text-muted">
                <th className="py-2 pr-3">Statut</th>
                <th className="py-2 pr-3 text-right">Cotisations par an</th>
                <th className="py-2 pr-3 text-right">Revenu net par mois</th>
                <th className="py-2">À savoir</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {c.rows.map((r) => (
                <tr key={r.key} className={r.eligible ? "" : "text-muted"}>
                  <th scope="row" className="py-2 pr-3 text-left font-medium">
                    {r.label}
                    {r.key === c.best ? (
                      <span className="mt-1 flex items-center gap-1 text-xs font-normal text-success">
                        <Icon name="check" size={14} /> Le plus intéressant ici
                      </span>
                    ) : null}
                  </th>
                  <td className="py-2 pr-3 text-right tabular-nums">{r.eligible ? eur(r.contributions) : "--"}</td>
                  <td className="py-2 pr-3 text-right tabular-nums">{r.eligible ? eur(r.netMonth) : "--"}</td>
                  <td className="py-2">
                    <span className="block">{r.reason}</span>
                    <span className="block text-muted">{r.protection}</span>
                    <span className="block text-muted">{r.paperwork}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <ul className="list-disc space-y-1 pl-5 text-sm">
          {c.advice.map((a) => (
            <li key={a}>{a}</li>
          ))}
          <li>Impôt sur le revenu non compris. En micro-entreprise, le plafond est de {eur(MICRO_CEILING)} de prestations par an.</li>
        </ul>
      </section>

      <section className="space-y-4" aria-labelledby="journee">
        <h2 id="journee" className="text-xl font-semibold">
          La journée de création
        </h2>
        <ol className="space-y-3" data-testid="journee-creation">
          {CREATION_DAY.map((s) => (
            <li key={s.time} className="card flex gap-4 p-4">
              <span className="w-12 shrink-0 font-semibold tabular-nums text-accent">{s.time}</span>
              <div className="min-w-0">
                <p className="font-semibold">{s.title}</p>
                <p className="text-sm text-muted">{s.detail}</p>
              </div>
            </li>
          ))}
        </ol>
        <p>
          <Link href="/inscription" className="btn-primary">
            Créer mon compte et équiper l&apos;entreprise
          </Link>
        </p>
      </section>
    </div>
  );
}
