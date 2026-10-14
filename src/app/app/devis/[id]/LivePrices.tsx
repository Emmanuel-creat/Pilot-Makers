import { ActionForm } from "@/components/forms/ActionForm";
import { Submit } from "@/components/forms/Submit";
import { formatPercent, formatUnitPrice } from "@/lib/calc/format";
import type { Ctx } from "@/lib/services/context";
import { livePrices } from "@/lib/services/live-pricing";
import { livePricesAction } from "@/app/actions";

/** Devis vivant : prix du catalogue modifiés depuis l'écriture du devis, à reprendre avec l'accord de l'artisan. */
export async function LivePrices({ ctx, quoteId }: { ctx: Ctx; quoteId: string }) {
  const r = await livePrices(ctx, quoteId).catch(() => null);
  if (!r || (!r.changes.length && !r.expired.length)) return null;
  const writable = !ctx.entitlements.readOnly && !ctx.supportAccess;
  return (
    <section className="card mt-6 space-y-3 p-4 text-sm" data-testid="devis-vivant">
      <div>
        <h2 className="text-sm font-semibold">Prix du catalogue modifiés</h2>
        <p className="text-xs text-muted">
          Le devis n&apos;est pas encore signé : reprenez les prix actuels si vous le souhaitez.
          {r.needsRevision ? " Le devis étant émis, il repassera en brouillon : une nouvelle version sera à émettre et à renvoyer au client." : ""}
        </p>
      </div>
      {r.changes.length ? (
        <ActionForm action={livePricesAction} className="space-y-2">
          <input type="hidden" name="quoteId" value={quoteId} />
          <ul className="space-y-1">
            {r.changes.map((c) => (
              <li key={c.lineId}>
                <label className="flex min-h-6 items-start gap-2">
                  <input type="checkbox" name="lineIds" value={c.lineId} defaultChecked className="mt-1" disabled={!writable} />
                  <span className="min-w-0 flex-1">
                    {c.label}
                    <span className="block text-xs text-muted tabular">
                      {formatUnitPrice(c.oldPrice4)} vers {formatUnitPrice(c.newPrice4)}
                      <span className={c.deltaBp > 0 ? " text-warning" : " text-success"}>
                        {" "}
                        ({c.deltaBp > 0 ? "+" : ""}
                        {formatPercent(c.deltaBp)})
                      </span>
                    </span>
                  </span>
                </label>
              </li>
            ))}
          </ul>
          {writable ? <Submit className="btn-secondary">Actualiser les prix cochés</Submit> : null}
        </ActionForm>
      ) : null}
      {r.expired.length ? <p className="text-xs text-warning">Prix fournisseur à reconfirmer (validité dépassée) : {r.expired.join(", ")}.</p> : null}
    </section>
  );
}
