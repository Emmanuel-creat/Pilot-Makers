/**
 * Tableau de bord (module J).
 *
 * Les indicateurs portent sur des devis : un devis accepté n'est pas du chiffre
 * d'affaires encaissé, et aucun montant n'est présenté comme tel.
 */

import { num } from "@/lib/db";
import type { Ctx } from "./context";
import { expireQuotes, parisDate } from "./quotes";
import { scheduleState, type Schedule } from "./schedule";
import type { QuoteStatus } from "./quote-types";
import { REFUSAL_REASONS, type RefusalReason } from "./refusal";

export interface DashboardData {
  counts: Record<QuoteStatus, number>;
  pendingAmountTtcCents: number;
  acceptedAmountHtCents: number;
  acceptanceRate: number | null;
  averageResponseDays: number | null;
  expiringSoon: { id: string; number: string; title: string; validUntil: string; totalTtcCents: number }[];
  toPrepare: { id: string; number: string; title: string; totalTtcCents: number }[];
  recent: { type: string; quoteId: string; number: string | null; title: string; createdAt: string; actor: string }[];
  periodDays: number;
  /** Refus de la période par raison, la plus fréquente en premier */
  refusals: { code: RefusalReason | ""; label: string; count: number }[];
  /** Encaissements attendus : factures restant dues par échéance, et devis acceptés pas encore facturés */
  forecast: { overdueCents: number; within30Cents: number; within60Cents: number; within90Cents: number; laterCents: number; notInvoicedCents: number };
}

/** Encaissements prévus sur 90 jours, à partir des factures émises et non soldées. */
async function cashForecast(ctx: Ctx): Promise<DashboardData["forecast"]> {
  const rows = await ctx.db.query<Record<string, unknown>>(
    `SELECT due_date, amount_due_cents - paid_cents - credited_cents AS rest, paid_cents + credited_cents AS settled, schedule
     FROM invoices WHERE org_id=$1 AND kind <> 'credit_note' AND amount_due_cents > paid_cents + credited_cents`,
    [ctx.orgId],
  );
  const today = parisDate(new Date());
  const day0 = Date.parse(today + "T00:00:00Z");
  const r = { overdue: 0, d30: 0, d60: 0, d90: 0, later: 0 };
  const put = (iso: string, cents: number) => {
    const d = Math.round((Date.parse(iso + "T00:00:00Z") - day0) / 86_400_000);
    if (d < 0) r.overdue += cents;
    else if (d < 30) r.d30 += cents;
    else if (d < 60) r.d60 += cents;
    else if (d < 90) r.d90 += cents;
    else r.later += cents;
  };
  for (const row of rows) {
    const due = row.due_date instanceof Date ? row.due_date.toISOString().slice(0, 10) : String(row.due_date).slice(0, 10);
    const schedule = row.schedule as Schedule | null;
    // Avec un échéancier, chaque échéance non réglée tombe à sa propre date.
    let planned = 0;
    if (schedule) {
      for (const it of scheduleState(schedule, num(row.settled), today)) {
        if (it.restCents > 0) put(it.dueDate, it.restCents);
        planned += it.restCents;
      }
    }
    // Ce que l'échéancier ne couvre pas (un paiement annulé depuis, par exemple) reste à l'échéance de la facture.
    if (num(row.rest) > planned) put(due, num(row.rest) - planned);
  }
  const n = (
    await ctx.db.query<{ rest: unknown }>(
      `SELECT coalesce(sum(greatest(q.total_ttc_cents - coalesce(i.invoiced, 0), 0)), 0) AS rest
       FROM quotes q
       LEFT JOIN (SELECT quote_id, sum(amount_due_cents - credited_cents) AS invoiced FROM invoices
                  WHERE org_id=$1 AND kind <> 'credit_note' GROUP BY quote_id) i ON i.quote_id = q.id
       WHERE q.org_id=$1 AND q.status='accepted' AND q.archived_at IS NULL`,
      [ctx.orgId],
    )
  )[0];
  return {
    overdueCents: r.overdue,
    within30Cents: r.d30,
    within60Cents: r.d60,
    within90Cents: r.d90,
    laterCents: r.later,
    notInvoicedCents: num(n?.rest),
  };
}

export async function getDashboard(ctx: Ctx, periodDays = 90): Promise<DashboardData> {
  await expireQuotes(ctx.db, ctx.orgId);
  const since = new Date(Date.now() - periodDays * 86_400_000);
  const counts = Object.fromEntries(
    ["draft", "incomplete", "ready", "sent", "viewed", "accepted", "refused", "expired", "canceled", "superseded"].map((s) => [s, 0]),
  ) as Record<QuoteStatus, number>;
  for (const r of await ctx.db.query<{ status: QuoteStatus; n: unknown }>(
    "SELECT status, count(*) AS n FROM quotes WHERE org_id=$1 AND archived_at IS NULL GROUP BY status",
    [ctx.orgId],
  )) {
    counts[r.status] = num(r.n);
  }
  const money = (
    await ctx.db.query<{ pending: unknown; accepted: unknown }>(
      `SELECT
         coalesce(sum(total_ttc_cents) FILTER (WHERE status IN ('ready','sent','viewed')), 0) AS pending,
         coalesce(sum(total_ht_cents) FILTER (WHERE status = 'accepted' AND responded_at >= $2), 0) AS accepted
       FROM quotes WHERE org_id=$1 AND archived_at IS NULL`,
      [ctx.orgId, since],
    )
  )[0];
  const decided = (
    await ctx.db.query<{ accepted: unknown; refused: unknown; avg_days: unknown }>(
      `SELECT count(*) FILTER (WHERE status='accepted') AS accepted,
              count(*) FILTER (WHERE status='refused') AS refused,
              avg(EXTRACT(EPOCH FROM (responded_at - sent_at)) / 86400) FILTER (WHERE responded_at IS NOT NULL AND sent_at IS NOT NULL) AS avg_days
       FROM quotes WHERE org_id=$1 AND responded_at >= $2`,
      [ctx.orgId, since],
    )
  )[0];
  const acc = num(decided?.accepted);
  const ref = num(decided?.refused);
  const expiring = await ctx.db.query<Record<string, unknown>>(
    `SELECT id, number, title, valid_until, total_ttc_cents FROM quotes
     WHERE org_id=$1 AND status IN ('ready','sent','viewed') AND valid_until <= (current_date + 7) AND archived_at IS NULL
     ORDER BY valid_until LIMIT 10`,
    [ctx.orgId],
  );
  const toPrepare = await ctx.db.query<Record<string, unknown>>(
    `SELECT id, number, title, total_ttc_cents FROM quotes WHERE org_id=$1 AND status='accepted' AND archived_at IS NULL
     ORDER BY responded_at DESC LIMIT 10`,
    [ctx.orgId],
  );
  const recent = await ctx.db.query<Record<string, unknown>>(
    `SELECT e.type, e.quote_id, e.created_at, e.actor_type, q.number, q.title, u.name AS actor_name
     FROM document_events e JOIN quotes q ON q.id = e.quote_id LEFT JOIN users u ON u.id = e.actor_id
     WHERE e.org_id=$1 ORDER BY e.created_at DESC LIMIT 15`,
    [ctx.orgId],
  );
  const refusals = await ctx.db.query<{ code: string; n: unknown }>(
    "SELECT refusal_reason AS code, count(*) AS n FROM quotes WHERE org_id=$1 AND status='refused' AND responded_at >= $2 GROUP BY 1 ORDER BY 2 DESC, 1",
    [ctx.orgId, since],
  );
  const avg = decided?.avg_days === null || decided?.avg_days === undefined ? null : Math.round(Number(decided.avg_days) * 10) / 10;
  return {
    counts,
    pendingAmountTtcCents: num(money?.pending),
    acceptedAmountHtCents: num(money?.accepted),
    acceptanceRate: acc + ref > 0 ? Math.round((acc / (acc + ref)) * 1000) / 10 : null,
    averageResponseDays: avg,
    expiringSoon: expiring.map((r) => ({
      id: String(r.id),
      number: String(r.number ?? ""),
      title: String(r.title),
      validUntil: r.valid_until instanceof Date ? r.valid_until.toISOString().slice(0, 10) : String(r.valid_until).slice(0, 10),
      totalTtcCents: num(r.total_ttc_cents),
    })),
    toPrepare: toPrepare.map((r) => ({ id: String(r.id), number: String(r.number ?? ""), title: String(r.title), totalTtcCents: num(r.total_ttc_cents) })),
    recent: recent.map((r) => ({
      type: String(r.type),
      quoteId: String(r.quote_id),
      number: (r.number as string | null) ?? null,
      title: String(r.title),
      createdAt: r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at),
      actor: r.actor_type === "client" ? "Client" : r.actor_type === "system" ? "Automatique" : String(r.actor_name ?? ""),
    })),
    periodDays,
    refusals: refusals.map((r) => ({
      code: (r.code in REFUSAL_REASONS ? r.code : "") as RefusalReason | "",
      label: r.code in REFUSAL_REASONS ? REFUSAL_REASONS[r.code as RefusalReason] : "Raison non précisée",
      count: num(r.n),
    })),
    forecast: await cashForecast(ctx),
  };
}

export const EVENT_LABELS: Record<string, string> = {
  created: "Devis créé",
  issued: "Version émise",
  sent: "Envoyé par e-mail",
  send_failed: "Échec d'envoi",
  viewed: "Consulté par le client",
  accepted: "Accepté",
  refused: "Refusé",
  expired: "Expiré",
  canceled: "Annulé",
  replaced: "Remplacé par un nouveau devis",
  duplicated: "Créé par duplication",
  amendment_created: "Avenant créé",
  amendment_of: "Créé comme avenant",
  "revision.started": "Nouvelle version en préparation",
  "version.superseded": "Version remplacée",
  "link.created": "Lien de consultation créé",
  "links.revoked": "Liens de consultation révoqués",
  reminder: "Relance envoyée",
};
