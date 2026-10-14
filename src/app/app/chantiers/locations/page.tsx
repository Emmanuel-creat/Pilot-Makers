import Link from "next/link";
import { Empty, PageHeader, Section, fmtDate } from "@/components/ui";
import { formatEuros } from "@/lib/calc/format";
import { RENTAL_STATES } from "@/lib/rentals";
import { requirePageCtx } from "@/lib/server/session";
import { openRentals } from "@/lib/services/rentals";

export const metadata = { title: "Matériel loué" };

const TONE = { a_venir: "text-muted", en_cours: "text-accent", en_retard: "text-danger", rendu: "text-success" } as const;

export default async function RentalsPage() {
  const ctx = await requirePageCtx();
  const list = await openRentals(ctx);
  const late = list.filter((r) => r.state === "en_retard");
  const total = list.reduce((s, r) => s + r.cost.totalCents, 0);
  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title="Matériel loué"
        back={{ href: "/app/chantiers", label: "Chantiers" }}
        subtitle={
          list.length
            ? `${list.length} location${list.length > 1 ? "s" : ""} en cours, ${formatEuros(total)} HT engagés${late.length ? `, ${late.length} retour${late.length > 1 ? "s" : ""} en retard` : ""}.`
            : "Tout le matériel loué a été rendu."
        }
      />
      {list.length ? (
        <Section title="À rendre" description="Le retour le plus proche en premier. Rendez le matériel depuis la fiche du chantier.">
          <ul className="divide-y divide-line text-sm" data-testid="locations-en-cours">
            {list.map((r) => (
              <li key={r.id} className="flex flex-wrap items-start justify-between gap-2 py-2">
                <div className="min-w-0">
                  <p className="font-medium">
                    {r.equipment}
                    {r.renter ? <span className="font-normal text-muted">{`, ${r.renter}`}</span> : null}
                  </p>
                  <p className="text-xs text-muted">
                    <Link className="link" href={`/app/chantiers/${r.jobId}`}>
                      {r.jobTitle}
                    </Link>
                    , retour prévu le {fmtDate(r.endDate)}
                  </p>
                </div>
                <div className="text-right">
                  <p className={`text-xs font-medium ${TONE[r.state]}`}>{RENTAL_STATES[r.state]}</p>
                  <p className="tabular">
                    {formatEuros(r.cost.totalCents)} HT
                    {r.cost.overrunCents ? <span className="block text-xs text-danger">+{formatEuros(r.cost.overrunCents)} de retard</span> : null}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </Section>
      ) : (
        <Empty icon="truck" title="Aucune location en cours">
          Enregistrez le matériel loué depuis la fiche de chaque chantier : son coût et sa date de retour y sont suivis.
        </Empty>
      )}
    </div>
  );
}
