import Link from "next/link";
import { dismissCostAlertAction } from "@/app/actions";
import { Icon } from "@/components/Icon";
import { formatPercent, formatUnitPrice } from "@/lib/calc/format";
import type { CostAlert } from "@/lib/services/supplier-prices";

/** Articles dont la marge est passée sous le seuil après une hausse du prix d'achat. */
export function CostAlerts({ alerts }: { alerts: CostAlert[] }) {
  if (!alerts.length) return null;
  return (
    <section className="mb-4 rounded-md border border-warning bg-warning-soft p-4" aria-labelledby="alertes-marge">
      <h2 id="alertes-marge" className="flex items-center gap-2 text-sm font-semibold">
        <Icon name="alert" size={16} /> Marge en baisse sur {alerts.length} article{alerts.length > 1 ? "s" : ""}
      </h2>
      <ul className="mt-2 divide-y divide-line text-sm">
        {alerts.slice(0, 10).map((a) => (
          <li key={a.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-1.5">
            <Link className="link font-medium" href={`/app/catalogue/${a.item_id}`}>
              {a.name}
            </Link>
            <span className="text-muted">
              achat {a.old_cost4 === null ? "" : `${formatUnitPrice(a.old_cost4)} → `}
              {formatUnitPrice(a.new_cost4)} chez {a.supplier}, vente {formatUnitPrice(a.price4)}, marge {formatPercent(a.margin_bp)}
            </span>
            <form action={dismissCostAlertAction} className="ml-auto">
              <input type="hidden" name="id" value={a.id} />
              <button className="link min-h-6 text-xs">Marge vue</button>
            </form>
          </li>
        ))}
      </ul>
    </section>
  );
}
