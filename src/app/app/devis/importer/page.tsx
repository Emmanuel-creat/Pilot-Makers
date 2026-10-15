import Link from "next/link";
import { quoteExchangeImportAction } from "@/app/actions";
import { ActionForm } from "@/components/forms/ActionForm";
import { Submit } from "@/components/forms/Submit";
import { PageHeader } from "@/components/ui";
import { EXCHANGE_FORMAT } from "@/lib/quote-exchange";
import { requirePageCtx } from "@/lib/server/session";
import { customerDisplayName, searchCustomers } from "@/lib/services/customers";

export const metadata = { title: "Importer un devis" };

/** Reprise d'un devis reçu au format ouvert Devis ouvert, d'un autre logiciel ou d'un confrère. */
export default async function ImportQuotePage() {
  const ctx = await requirePageCtx();
  const customers = await searchCustomers(ctx, { limit: 500 });
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <PageHeader
        title="Importer un devis"
        subtitle={`Reprenez en brouillon un devis au format ouvert ${EXCHANGE_FORMAT.name} : lots, lignes, quantités, prix et taux de TVA. Relisez-le avant de l'émettre.`}
        back={{ href: "/app/devis", label: "Devis" }}
      />
      <section className="card p-4">
        <ActionForm action={quoteExchangeImportAction}>
          <div>
            <label className="label" htmlFor="imp-fichier">
              Fichier {EXCHANGE_FORMAT.extension}
            </label>
            <input id="imp-fichier" name="file" type="file" accept=".json,application/json" className="field" required />
          </div>
          <div>
            <label className="label" htmlFor="imp-client">
              Client (facultatif)
            </label>
            <select id="imp-client" name="customerId" className="field" defaultValue="">
              <option value="">Choisir plus tard</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {customerDisplayName(c)}
                </option>
              ))}
            </select>
          </div>
          <Submit>Importer en brouillon</Submit>
        </ActionForm>
      </section>
      <p className="text-sm text-muted">
        Le format est ouvert et documenté :{" "}
        <Link href="/format-devis-ouvert" className="link">
          description du format {EXCHANGE_FORMAT.name}
        </Link>
        . Les coûts, marges et notes internes ne sont jamais exportés.
      </p>
    </div>
  );
}
