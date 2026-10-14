/** Risque d'impayé d'un client, calculé à partir de ses factures, pour un devis donné ou en général. */

import { customerRisk, type RiskResult } from "@/lib/customer-risk";
import { num, one } from "@/lib/db";
import { isUuid, notFound } from "@/lib/http";
import type { Ctx } from "./context";
import { can } from "./context";
import { customerPaymentProfile, listInvoices } from "./invoices";
import { parisDate } from "./quotes";

const days = (from: string, to: string) => Math.round((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 86_400_000);

export async function riskForCustomer(ctx: Ctx, customerId: string, quoteCents = 0, now = new Date()): Promise<RiskResult | null> {
  if (!can(ctx, "billing") || !isUuid(customerId)) return null;
  const c = await one<{ type: string; siren: string }>(ctx.db, "SELECT type, siren FROM customers WHERE id=$1 AND org_id=$2", [customerId, ctx.orgId]);
  if (!c) throw notFound("Client introuvable");
  const [invoices, payer] = await Promise.all([listInvoices(ctx, { customerId, limit: 500 }), customerPaymentProfile(ctx, customerId)]);
  const today = parisDate(now);
  let overdueCents = 0;
  let oldest = 0;
  let largestPaid = 0;
  for (const i of invoices) {
    if (i.kind === "credit_note") continue;
    if (i.status === "overdue") {
      overdueCents += i.balance_cents;
      oldest = Math.max(oldest, days(i.due_date, today));
    }
    if (i.status === "paid") largestPaid = Math.max(largestPaid, num(i.total_ttc_cents));
  }
  return customerRisk({
    customerType: c.type === "particulier" ? "particulier" : "pro",
    hasSiren: !!c.siren.trim(),
    paidInvoices: payer.invoices,
    averageDelay: payer.averageDelay,
    overdueCents,
    oldestOverdueDays: oldest,
    largestPaidCents: largestPaid,
    quoteCents,
  });
}

export async function riskForQuote(ctx: Ctx, quoteId: string, now = new Date()) {
  if (!isUuid(quoteId)) return null;
  const q = await one<{ customer_id: string | null; status: string; total_ttc_cents: unknown; deposit_percent: string }>(
    ctx.db,
    "SELECT customer_id, status, total_ttc_cents, deposit_percent FROM quotes WHERE id=$1 AND org_id=$2",
    [quoteId, ctx.orgId],
  );
  if (!q?.customer_id || !["draft", "incomplete", "ready", "sent", "viewed"].includes(q.status)) return null;
  const risk = await riskForCustomer(ctx, q.customer_id, num(q.total_ttc_cents), now);
  if (!risk) return null;
  const deposit = Number(String(q.deposit_percent ?? "").replace(",", ".")) || 0;
  return { ...risk, quoteDeposit: deposit, depositTooLow: risk.level !== "faible" && deposit < risk.depositPercent };
}
