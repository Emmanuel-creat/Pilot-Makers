/**
 * Rapports commerciaux : signé, en attente, facturé, encaissé par mois ; taux de
 * signature par période, type de travaux et auteur ; délais ; panier moyen ;
 * objectifs mensuels. Un devis signé n'est pas un encaissement : chaque montant
 * est nommé pour ce qu'il est.
 */

import { toCsv } from "@/lib/csv";
import { num } from "@/lib/db";
import { badRequest } from "@/lib/http";
import { LIBRARY, type LibraryTrade } from "@/lib/library";
import { centsToInput } from "@/lib/calc/format";
import type { Ctx } from "./context";
import { audit, requirePermission, requireWritable } from "./context";
import { eurosToCents } from "./pricing";
import { parisDate } from "./quotes";

export interface Goals {
  /** Montant HT signé visé chaque mois, en centimes */
  monthlySignedHtCents: number;
  /** Nombre de devis envoyés visé chaque mois */
  monthlySent: number;
}

export interface MonthRow {
  month: string;
  sent: number;
  signed: number;
  refused: number;
  signedHtCents: number;
  invoicedHtCents: number;
  collectedCents: number;
  /** Panier moyen HT des devis signés du mois */
  averageBasketHtCents: number | null;
  signatureRate: number | null;
}

export interface Breakdown {
  key: string;
  label: string;
  signed: number;
  refused: number;
  signedHtCents: number;
  rate: number | null;
}

export interface Report {
  months: MonthRow[];
  pendingTtcCents: number;
  byTrade: Breakdown[];
  byAuthor: Breakdown[];
  delays: { leadToQuoteDays: number | null; quoteToSignatureDays: number | null; samples: { leadToQuote: number; quoteToSignature: number } };
  basket: { currentHtCents: number | null; previousHtCents: number | null; changePercent: number | null };
  goals: Goals;
  currentMonth: { month: string; signedHtCents: number; sent: number };
}

export function readGoals(raw: unknown): Goals {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const int = (v: unknown, max: number) => (Number.isInteger(v) && (v as number) >= 0 && (v as number) <= max ? (v as number) : 0);
  return { monthlySignedHtCents: int(r.monthlySignedHtCents, 100_000_000_00), monthlySent: int(r.monthlySent, 10_000) };
}

export async function saveGoals(ctx: Ctx, input: { signed: string; sent: string }) {
  requirePermission(ctx, "billing");
  requireWritable(ctx);
  let cents: number;
  try {
    cents = eurosToCents(input.signed, "Objectif signé");
  } catch (e) {
    throw badRequest((e as Error).message);
  }
  const sent = input.sent.trim() ? Number(input.sent.trim()) : 0;
  if (!Number.isInteger(sent) || sent < 0 || sent > 10_000) throw badRequest("Objectif de devis envoyés : nombre entier");
  const goals = readGoals({ monthlySignedHtCents: cents, monthlySent: sent });
  await ctx.db.query("UPDATE organizations SET goals=$2, updated_at=now() WHERE id=$1", [ctx.orgId, JSON.stringify(goals)]);
  await audit(ctx.db, { orgId: ctx.orgId, userId: ctx.userId, action: "organization.goals", data: goals, ip: ctx.ip });
  return goals;
}

/** Mois AAAA-MM des n derniers mois, du plus ancien au mois en cours. */
export function lastMonths(today: string, n: number): string[] {
  const [y, m] = today.split("-").map(Number);
  return Array.from({ length: n }, (_, i) => {
    const t = y * 12 + (m - 1) - (n - 1 - i);
    return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, "0")}`;
  });
}

const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

/** Type de travaux d'un devis, reconnu dans son objet et sa description avec les bibliothèques métier. */
export function tradeOf(text: string): { key: string; label: string } {
  const t = norm(text);
  for (const code of Object.keys(LIBRARY) as LibraryTrade[]) {
    if (code === "commun") continue;
    if (LIBRARY[code].detect.test(t)) return { key: code, label: LIBRARY[code].label };
  }
  return { key: "autres", label: "Autres travaux" };
}

const rate = (signed: number, refused: number) => (signed + refused ? Math.round((signed * 1000) / (signed + refused)) / 10 : null);

function breakdown(rows: { key: string; label: string; status: string; ht: number }[]): Breakdown[] {
  const map = new Map<string, Breakdown>();
  for (const r of rows) {
    const b = map.get(r.key) ?? { key: r.key, label: r.label, signed: 0, refused: 0, signedHtCents: 0, rate: null };
    if (r.status === "accepted") {
      b.signed++;
      b.signedHtCents += r.ht;
    } else b.refused++;
    map.set(r.key, b);
  }
  return [...map.values()].map((b) => ({ ...b, rate: rate(b.signed, b.refused) })).sort((a, b) => b.signedHtCents - a.signedHtCents || b.signed - a.signed);
}

export async function getReport(ctx: Pick<Ctx, "db" | "orgId">, monthsCount = 12, now = new Date()): Promise<Report> {
  const today = parisDate(now);
  const months = lastMonths(today, monthsCount);
  const since = `${months[0]}-01`;
  const month = (col: string) => `to_char(${col} AT TIME ZONE 'Europe/Paris', 'YYYY-MM')`;
  const rows = new Map<string, MonthRow>(
    months.map((m) => [
      m,
      {
        month: m,
        sent: 0,
        signed: 0,
        refused: 0,
        signedHtCents: 0,
        invoicedHtCents: 0,
        collectedCents: 0,
        averageBasketHtCents: null,
        signatureRate: null,
      },
    ]),
  );

  const decided = await ctx.db.query<Record<string, unknown>>(
    `SELECT q.status, q.total_ht_cents, q.title, q.description, ${month("q.responded_at")} AS m, coalesce(u.name, '') AS author, q.author_id
     FROM quotes q LEFT JOIN users u ON u.id=q.author_id
     WHERE q.org_id=$1 AND q.status IN ('accepted','refused') AND q.responded_at >= $2::date`,
    [ctx.orgId, since],
  );
  for (const r of decided) {
    const row = rows.get(String(r.m));
    if (!row) continue;
    if (r.status === "accepted") {
      row.signed++;
      row.signedHtCents += num(r.total_ht_cents);
    } else row.refused++;
  }
  const sent = await ctx.db.query<{ m: string; n: unknown }>(
    `SELECT ${month("first_sent")} AS m, count(*) AS n FROM (
       SELECT min(e.created_at) AS first_sent FROM document_events e WHERE e.org_id=$1 AND e.type='sent' GROUP BY e.quote_id
     ) s WHERE first_sent >= $2::date GROUP BY 1`,
    [ctx.orgId, since],
  );
  for (const r of sent) {
    const row = rows.get(r.m);
    if (row) row.sent = num(r.n);
  }
  const invoiced = await ctx.db.query<{ m: string; ht: unknown }>(
    `SELECT to_char(issue_date, 'YYYY-MM') AS m, sum(CASE WHEN kind='credit_note' THEN -total_ht_cents ELSE total_ht_cents END) AS ht
     FROM invoices WHERE org_id=$1 AND issue_date >= $2::date GROUP BY 1`,
    [ctx.orgId, since],
  );
  for (const r of invoiced) {
    const row = rows.get(r.m);
    if (row) row.invoicedHtCents = num(r.ht);
  }
  const collected = await ctx.db.query<{ m: string; c: unknown }>(
    `SELECT to_char(paid_on, 'YYYY-MM') AS m, sum(amount_cents) AS c FROM invoice_payments
     WHERE org_id=$1 AND canceled_at IS NULL AND paid_on >= $2::date GROUP BY 1`,
    [ctx.orgId, since],
  );
  for (const r of collected) {
    const row = rows.get(r.m);
    if (row) row.collectedCents = num(r.c);
  }
  for (const row of rows.values()) {
    row.averageBasketHtCents = row.signed ? Math.round(row.signedHtCents / row.signed) : null;
    row.signatureRate = rate(row.signed, row.refused);
  }

  const pending = await ctx.db.query<{ t: unknown }>(
    "SELECT coalesce(sum(total_ttc_cents), 0) AS t FROM quotes WHERE org_id=$1 AND status IN ('ready','sent','viewed') AND archived_at IS NULL",
    [ctx.orgId],
  );

  const byTrade = breakdown(decided.map((r) => ({ ...tradeOf(`${r.title} ${r.description}`), status: String(r.status), ht: num(r.total_ht_cents) })));
  const byAuthor = breakdown(
    decided.map((r) => ({
      key: String(r.author_id ?? "aucun"),
      label: String(r.author) || "Auteur supprimé",
      status: String(r.status),
      ht: num(r.total_ht_cents),
    })),
  );

  // Délais : demande reçue jusqu'au premier devis émis, puis premier envoi jusqu'à la signature.
  const d1 = (
    await ctx.db.query<{ d: unknown; n: unknown }>(
      `SELECT avg(EXTRACT(EPOCH FROM (v.first_issue - l.created_at)) / 86400) AS d, count(*) AS n
       FROM leads l JOIN (SELECT quote_id, min(issued_at) AS first_issue FROM quote_versions GROUP BY quote_id) v ON v.quote_id = l.quote_id
       WHERE l.org_id=$1 AND l.created_at >= $2::date`,
      [ctx.orgId, since],
    )
  )[0];
  const d2 = (
    await ctx.db.query<{ d: unknown; n: unknown }>(
      `SELECT avg(EXTRACT(EPOCH FROM (q.responded_at - s.first_sent)) / 86400) AS d, count(*) AS n
       FROM quotes q JOIN (SELECT quote_id, min(created_at) AS first_sent FROM document_events WHERE type='sent' GROUP BY quote_id) s ON s.quote_id = q.id
       WHERE q.org_id=$1 AND q.status='accepted' AND q.responded_at >= $2::date`,
      [ctx.orgId, since],
    )
  )[0];
  const days = (v: unknown) => (v === null || v === undefined ? null : Math.round(Number(v) * 10) / 10);

  // Panier moyen : les 3 derniers mois comparés aux 3 mois précédents.
  const list = [...rows.values()];
  const basketOf = (part: MonthRow[]) => {
    const n = part.reduce((t, r) => t + r.signed, 0);
    return n ? Math.round(part.reduce((t, r) => t + r.signedHtCents, 0) / n) : null;
  };
  const current = basketOf(list.slice(-3));
  const previous = basketOf(list.slice(-6, -3));

  const org = await ctx.db.query<{ goals: unknown }>("SELECT goals FROM organizations WHERE id=$1", [ctx.orgId]);
  const cur = rows.get(months[months.length - 1])!;
  return {
    months: list,
    pendingTtcCents: num(pending[0]?.t),
    byTrade,
    byAuthor,
    delays: {
      leadToQuoteDays: days(d1?.d),
      quoteToSignatureDays: days(d2?.d),
      samples: { leadToQuote: num(d1?.n), quoteToSignature: num(d2?.n) },
    },
    basket: {
      currentHtCents: current,
      previousHtCents: previous,
      changePercent: current !== null && previous ? Math.round(((current - previous) * 1000) / previous) / 10 : null,
    },
    goals: readGoals(org[0]?.goals),
    currentMonth: { month: cur.month, signedHtCents: cur.signedHtCents, sent: cur.sent },
  };
}

export const MONTH_NAMES = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];
export const monthLabel = (m: string) => `${MONTH_NAMES[Number(m.slice(5, 7)) - 1]} ${m.slice(0, 4)}`;

/** Rapport mensuel au format tableur (CSV, séparateur point-virgule). */
export function reportCsv(r: Report): string {
  return toCsv(
    ["mois", "devis_envoyes", "devis_signes", "devis_refuses", "taux_signature_pct", "signe_ht", "panier_moyen_ht", "facture_ht", "encaisse"],
    r.months.map((m) => [
      m.month,
      String(m.sent),
      String(m.signed),
      String(m.refused),
      m.signatureRate === null ? "" : String(m.signatureRate).replace(".", ","),
      centsToInput(m.signedHtCents),
      m.averageBasketHtCents === null ? "" : centsToInput(m.averageBasketHtCents),
      centsToInput(m.invoicedHtCents),
      centsToInput(m.collectedCents),
    ]),
  );
}
