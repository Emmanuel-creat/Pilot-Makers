/** Jeux de données ouverts, calculés sur les seules entreprises volontaires des repères anonymes. */

import type { Queryable } from "@/lib/db";
import { num } from "@/lib/db";
import { paymentDelayDataset, priceDataset } from "@/lib/open-data";

export async function openPrices(db: Queryable) {
  const rows = await db.query<{ org_id: string; postal_code: string; name: string; unit: string; price4: unknown }>(
    `SELECT i.org_id, o.postal_code, i.name, i.unit, i.unit_price4 AS price4 FROM catalog_items i JOIN organizations o ON o.id=i.org_id
     WHERE o.benchmark_optin_at IS NOT NULL AND i.active AND i.source='library' AND i.unit_price4 > 0`,
  );
  return priceDataset(rows.map((r) => ({ orgId: r.org_id, postalCode: r.postal_code ?? "", name: r.name, unit: r.unit, price: num(r.price4) / 10000 })));
}

export async function openPaymentDelays(db: Queryable, months = 24) {
  const rows = await db.query<{ org_id: string; month: string; days: unknown; late: boolean }>(
    `SELECT i.org_id, to_char(i.issue_date, 'YYYY-MM') AS month, (max(p.paid_on) - i.issue_date) AS days, max(p.paid_on) > i.due_date AS late
     FROM invoices i JOIN organizations o ON o.id=i.org_id JOIN invoice_payments p ON p.invoice_id=i.id AND p.canceled_at IS NULL
     WHERE o.benchmark_optin_at IS NOT NULL AND i.kind <> 'credit_note' AND i.issue_date >= (current_date - ($1::int * 31))
     GROUP BY i.id, i.org_id, i.issue_date, i.due_date, i.total_ttc_cents
     HAVING sum(p.amount_cents) >= i.total_ttc_cents`,
    [months],
  );
  return paymentDelayDataset(rows.map((r) => ({ orgId: r.org_id, month: r.month, days: Math.max(0, num(r.days)), late: !!r.late })));
}
