import { Icon } from "@/components/Icon";
import { PageHeader } from "@/components/ui";
import { requirePageCtx } from "@/lib/server/session";
import { customerDisplayName, searchCustomers } from "@/lib/services/customers";
import { newQuoteAction } from "@/app/actions";

export const metadata = { title: "Nouveau devis" };

export default async function NewQuotePage({ searchParams }: { searchParams: Promise<{ client?: string }> }) {
  const sp = await searchParams;
  const ctx = await requirePageCtx();
  const customers = await searchCustomers(ctx, { limit: 500 });
  const assistant = ctx.entitlements.plan.aiQuotaMonth > 0;
  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="Nouveau devis" back={{ href: "/app/devis", label: "Devis" }} />
      <form action={newQuoteAction} className="card space-y-5 p-5">
        <div>
          <label className="label" htmlFor="n-client">
            Client
          </label>
          <select id="n-client" name="customerId" className="field" defaultValue={sp.client ?? ""}>
            <option value="">Choisir plus tard</option>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>
                {customerDisplayName(c)}
                {c.billing_city ? ` (${c.billing_city})` : ""}
              </option>
            ))}
          </select>
          <p className="mt-1 text-xs text-muted">Vous pourrez aussi créer le client directement dans le devis.</p>
        </div>
        <div>
          <label className="label" htmlFor="n-title">
            Objet des travaux
          </label>
          <input id="n-title" name="title" className="field" placeholder="Ex. : Rénovation de la salle de bain" />
        </div>
        <div>
          <label className="label" htmlFor="n-desc">
            Description du chantier {assistant ? <span className="font-normal text-muted">(utilisée par l'assistant)</span> : null}
          </label>
          <textarea
            id="n-desc"
            name="description"
            rows={5}
            className="field"
            placeholder="Ex. : Salle de bain de 6 m². Dépose de l'ancien carrelage, pose de carrelage au sol, faïence murale sur 14 m², remplacement du WC suspendu."
          />
        </div>
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button name="mode" value="blank" className="btn-secondary">
            Commencer un devis vide
          </button>
          {assistant ? (
            <button name="mode" value="assistant" className="btn-primary">
              <Icon name="wand" size={16} /> Préparer avec l'assistant
            </button>
          ) : null}
        </div>
      </form>
    </div>
  );
}
