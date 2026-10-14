import type { Ctx } from "@/lib/services/context";
import { quoteProducts } from "@/lib/services/product-info";

/** Fiches des produits du devis : garanties à annoncer au client et délai qui conditionne le démarrage. */
export async function ProductSheets({ ctx, quoteId }: { ctx: Ctx; quoteId: string }) {
  const p = await quoteProducts(ctx, quoteId);
  if (!p.items.length) return null;
  return (
    <section className="card mt-6 space-y-2 p-4 text-sm" data-testid="fiches-produits">
      <h2 className="text-sm font-semibold">Produits du devis</h2>
      {p.lead ? (
        <p>
          Délai d&apos;approvisionnement le plus long : <span className="font-medium">{p.lead.days} jours</span> ({p.lead.label}). Tenez-en compte dans la date
          de démarrage annoncée.
        </p>
      ) : null}
      <ul className="space-y-1 text-xs">
        {p.items.map((i) => (
          <li key={i.label}>
            <span className="font-medium">{i.label}</span>
            <span className="text-muted"> : {i.summary}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
