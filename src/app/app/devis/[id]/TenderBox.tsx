import type { Ctx } from "@/lib/services/context";
import { quoteTender } from "@/lib/services/tenders";

/** Devis né d'un bordereau de marché public : rappel de l'import et téléchargement du bordereau rempli. */
export async function TenderBox({ ctx, quoteId }: { ctx: Ctx; quoteId: string }) {
  const t = await quoteTender(ctx, quoteId);
  if (!t) return null;
  return (
    <section className="card mt-6 flex flex-wrap items-center justify-between gap-3 p-4 text-sm" data-testid="marche-public">
      <div className="min-w-0">
        <h2 className="text-sm font-semibold">Marché public</h2>
        <p className="text-xs text-muted">
          Importé de {t.fileName} : {t.items} poste{t.items > 1 ? "s" : ""}, {t.matched} chiffré{t.matched > 1 ? "s" : ""} avec le catalogue. Les postes sans
          prix sont marqués estimés.
        </p>
      </div>
      <a href={`/api/marches/${t.id}/export`} className="btn-secondary">
        Bordereau rempli
      </a>
    </section>
  );
}
