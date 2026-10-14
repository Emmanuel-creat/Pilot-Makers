import Link from "next/link";
import { formatCarbon } from "@/lib/carbon";
import { quoteCarbon } from "@/lib/services/carbon";
import type { Ctx } from "@/lib/services/context";

/** Bilan carbone des produits du devis. */
export async function CarbonBalance({ ctx, quoteId }: { ctx: Ctx; quoteId: string }) {
  const b = await quoteCarbon(ctx, quoteId);
  if (!b.products) return null;
  return (
    <section className="card mt-6 space-y-2 p-4 text-sm" data-testid="bilan-carbone">
      <h2 className="text-sm font-semibold">Bilan carbone</h2>
      <p>
        <span className="text-lg font-semibold tabular">{formatCarbon(b.grams)}</span>
        <span className="block text-xs text-muted">
          Produits du devis, hors main-d&apos;oeuvre et options.
          {b.estimatedGrams ? ` Dont ${formatCarbon(b.estimatedGrams)} en ordre de grandeur indicatif.` : ""}
        </span>
      </p>
      {b.top.length ? (
        <ul className="space-y-1 text-xs">
          {b.top.map((t) => (
            <li key={t.label} className="flex justify-between gap-2">
              <span className="min-w-0">
                {t.label}
                {t.origin === "indicatif" ? <span className="text-muted"> (indicatif)</span> : null}
              </span>
              <span className="tabular">
                {formatCarbon(t.grams)}, {Math.round(t.shareBp / 100)} %
              </span>
            </li>
          ))}
        </ul>
      ) : null}
      {b.unknown.length ? (
        <p className="text-xs text-muted">
          Sans donnée : {b.unknown.join(", ")}. Renseignez l&apos;empreinte des articles depuis le{" "}
          <Link className="link" href="/app/catalogue">
            catalogue
          </Link>
          .
        </p>
      ) : null}
    </section>
  );
}
