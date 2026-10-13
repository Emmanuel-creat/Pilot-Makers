/** Tableau de bord du micro-entrepreneur : encaissements par mois, plafonds, seuils de TVA et cotisations. */

import { num } from "@/lib/db";
import { splitAmount, type MicroIncome } from "@/lib/micro";
import type { Ctx } from "./context";
import { requirePermission } from "./context";

interface InvoiceSnap {
  sections?: { lines: { id: string; nature?: string }[] }[];
  calc?: { sections?: { lines: { id: string; netCents: number; optional?: boolean }[] }[] };
}

/** Hors taxe des lignes de matériaux et hors taxe total d'une facture. */
export function materialShare(snap: InvoiceSnap): { material: number; total: number } {
  const nature = new Map((snap.sections ?? []).flatMap((s) => s.lines.map((l) => [l.id, l.nature ?? ""] as const)));
  let material = 0;
  let total = 0;
  for (const s of snap.calc?.sections ?? []) {
    for (const l of s.lines) {
      if (l.optional || l.netCents <= 0) continue;
      total += l.netCents;
      if (nature.get(l.id) === "materiau") material += l.netCents;
    }
  }
  return { material, total };
}

export interface MicroMonth extends MicroIncome {
  month: number;
}

/** Encaissements de l'année civile, mois par mois, ventilés entre prestations et fournitures. */
export async function microYear(ctx: Ctx, year: number): Promise<{ months: MicroMonth[]; total: MicroIncome }> {
  requirePermission(ctx, "billing");
  const rows = await ctx.db.query<{ paid_on: unknown; amount_cents: unknown; snapshot: InvoiceSnap; kind: string }>(
    `SELECT p.paid_on, p.amount_cents, i.snapshot, i.kind FROM invoice_payments p JOIN invoices i ON i.id=p.invoice_id
     WHERE p.org_id=$1 AND p.canceled_at IS NULL AND p.paid_on >= $2 AND p.paid_on <= $3 AND i.kind <> 'credit_note'`,
    [ctx.orgId, `${year}-01-01`, `${year}-12-31`],
  );
  const months: MicroMonth[] = Array.from({ length: 12 }, (_, i) => ({ month: i + 1, services: 0, sales: 0 }));
  for (const r of rows) {
    const d = r.paid_on instanceof Date ? r.paid_on.toISOString() : String(r.paid_on);
    const m = months[Number(d.slice(5, 7)) - 1];
    const share = materialShare(r.snapshot);
    const part = splitAmount(num(r.amount_cents), share.material, share.total);
    m.services += part.services;
    m.sales += part.sales;
  }
  const total = months.reduce((t, m) => ({ services: t.services + m.services, sales: t.sales + m.sales }), { services: 0, sales: 0 });
  return { months, total };
}
