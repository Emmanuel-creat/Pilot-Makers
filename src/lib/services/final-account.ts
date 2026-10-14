/**
 * Décompte général définitif : état récapitulatif du marché (devis accepté et avenants), des factures
 * et des règlements, préparé par l'entreprise, envoyé au client puis accepté ou contesté.
 */

import { num, one } from "@/lib/db";
import { ACCOUNT_STATUSES, computeFinalAccount, type AccountInvoice, type AccountStatus, type FinalAccount } from "@/lib/final-account";
import { badRequest, conflict, isUuid, notFound } from "@/lib/http";
import type { Ctx } from "./context";
import { audit, requirePermission, requireWritable } from "./context";
import { eurosToCents } from "./pricing";

export interface FinalAccountView {
  quote: { id: string; number: string | null; title: string; customerName: string; acceptedAt: string | null };
  amendments: { label: string; htCents: number; ttcCents: number }[];
  invoices: AccountInvoice[];
  account: FinalAccount;
  penaltiesNote: string;
  status: AccountStatus;
  sentAt: Date | null;
  answeredAt: Date | null;
  answerNote: string;
  /** Vrai quand les chiffres affichés sont ceux figés à l'envoi */
  frozen: boolean;
}

type Snapshot = Pick<FinalAccountView, "amendments" | "invoices" | "account" | "penaltiesNote">;

async function quoteRow(ctx: Ctx, quoteId: string) {
  if (!isUuid(quoteId)) throw notFound("Devis introuvable");
  const q = await one<{
    id: string;
    number: string | null;
    title: string;
    status: string;
    amends_quote_id: string | null;
    total_ht_cents: unknown;
    total_ttc_cents: unknown;
    customer_name: string | null;
    accepted_at: string | null;
  }>(
    ctx.db,
    `SELECT q.id, q.number, q.title, q.status, q.amends_quote_id, q.total_ht_cents, q.total_ttc_cents, coalesce(nullif(c.company_name, ''), nullif(trim(c.first_name || ' ' || c.last_name), '')) AS customer_name,
       to_char(q.responded_at, 'YYYY-MM-DD') AS accepted_at
     FROM quotes q LEFT JOIN customers c ON c.id=q.customer_id WHERE q.id=$1 AND q.org_id=$2`,
    [quoteId, ctx.orgId],
  );
  if (!q) throw notFound("Devis introuvable");
  if (q.amends_quote_id) throw conflict("Le décompte général s'établit sur le devis initial, avenants compris");
  if (q.status !== "accepted") throw conflict("Le décompte général porte sur un devis accepté");
  return q;
}

async function live(ctx: Ctx, quoteId: string, penaltiesCents: number, penaltiesNote: string) {
  const q = await quoteRow(ctx, quoteId);
  const amendments = await ctx.db.query<{ id: string; amendment_index: number; number: string | null; total_ht_cents: unknown; total_ttc_cents: unknown }>(
    "SELECT id, amendment_index, number, total_ht_cents, total_ttc_cents FROM quotes WHERE amends_quote_id=$1 AND org_id=$2 AND status='accepted' ORDER BY amendment_index",
    [q.id, ctx.orgId],
  );
  const invoices = await ctx.db.query<Record<string, unknown>>(
    `SELECT number, kind, to_char(issue_date, 'YYYY-MM-DD') AS issue_date, total_ttc_cents, amount_due_cents, paid_cents,
       COALESCE((snapshot->'invoice'->'retention'->>'cents')::bigint, 0) AS retention_cents
     FROM invoices WHERE org_id=$1 AND quote_id = ANY($2::uuid[]) ORDER BY issue_date, number`,
    [ctx.orgId, [q.id, ...amendments.map((a) => a.id)]],
  );
  const snap: Snapshot = {
    amendments: amendments.map((a) => ({
      label: `Avenant n° ${a.amendment_index}${a.number ? ` (${a.number})` : ""}`,
      htCents: num(a.total_ht_cents),
      ttcCents: num(a.total_ttc_cents),
    })),
    invoices: invoices.map((i) => ({
      number: String(i.number),
      kind: i.kind as AccountInvoice["kind"],
      issueDate: String(i.issue_date),
      ttcCents: num(i.total_ttc_cents),
      amountDueCents: num(i.amount_due_cents),
      retentionCents: num(i.retention_cents),
      paidCents: num(i.paid_cents),
    })),
    penaltiesNote,
    account: computeFinalAccount({ marketHtCents: 0, marketTtcCents: 0, amendments: [], invoices: [], penaltiesCents: 0 }),
  };
  snap.account = computeFinalAccount({
    marketHtCents: num(q.total_ht_cents),
    marketTtcCents: num(q.total_ttc_cents),
    amendments: snap.amendments,
    invoices: snap.invoices,
    penaltiesCents,
  });
  return { q, snap };
}

type AccountRow = {
  penalties_cents: unknown;
  penalties_note: string;
  status: AccountStatus;
  snapshot: Snapshot | null;
  sent_at: Date | null;
  answered_at: Date | null;
  answer_note: string;
};

async function accountRow(ctx: Ctx, quoteId: string) {
  return one<AccountRow>(
    ctx.db,
    "SELECT penalties_cents, penalties_note, status, snapshot, sent_at, answered_at, answer_note FROM final_accounts WHERE quote_id=$1 AND org_id=$2",
    [quoteId, ctx.orgId],
  );
}

export async function getFinalAccount(ctx: Ctx, quoteId: string): Promise<FinalAccountView> {
  requirePermission(ctx, "billing");
  const row = await accountRow(ctx, quoteId);
  const { q, snap } = await live(ctx, quoteId, num(row?.penalties_cents ?? 0), row?.penalties_note ?? "");
  const frozen = !!row?.snapshot && row.status !== "projet";
  const shown = frozen ? row!.snapshot! : snap;
  return {
    quote: { id: q.id, number: q.number, title: q.title, customerName: q.customer_name ?? "", acceptedAt: q.accepted_at },
    ...shown,
    status: row?.status ?? "projet",
    sentAt: row?.sent_at ?? null,
    answeredAt: row?.answered_at ?? null,
    answerNote: row?.answer_note ?? "",
    frozen,
  };
}

export async function savePenalties(ctx: Ctx, quoteId: string, amount: string, note: string) {
  requireWritable(ctx);
  requirePermission(ctx, "billing");
  await quoteRow(ctx, quoteId);
  const row = await accountRow(ctx, quoteId);
  if (row && row.status !== "projet") throw conflict("Le décompte a été envoyé : repassez-le en projet pour le modifier");
  const cents = eurosToCents(amount, "Pénalités");
  if (cents < 0) throw badRequest("Les pénalités ne peuvent pas être négatives");
  const n = note.trim();
  if (n.length > 300) throw badRequest("Motif des pénalités trop long");
  if (cents && !n) throw badRequest("Indiquez le motif des pénalités (retard, réserves non levées...)");
  await ctx.db.query(
    `INSERT INTO final_accounts (org_id, quote_id, penalties_cents, penalties_note) VALUES ($1,$2,$3,$4)
     ON CONFLICT (quote_id) DO UPDATE SET penalties_cents=EXCLUDED.penalties_cents, penalties_note=EXCLUDED.penalties_note, updated_at=now()`,
    [ctx.orgId, quoteId, cents, n],
  );
}

/** Envoi au client : les chiffres sont figés tels qu'envoyés, la réponse du client se note ensuite. */
export async function setFinalAccountStatus(ctx: Ctx, quoteId: string, status: string, note = "") {
  requireWritable(ctx);
  requirePermission(ctx, "billing");
  if (!(status in ACCOUNT_STATUSES)) throw badRequest("État du décompte invalide");
  const row = await accountRow(ctx, quoteId);
  const current = row?.status ?? "projet";
  const allowed: Record<AccountStatus, AccountStatus[]> = {
    projet: ["envoye"],
    envoye: ["accepte", "conteste", "projet"],
    accepte: [],
    conteste: ["projet"],
  };
  if (!allowed[current].includes(status as AccountStatus)) throw conflict(`Passage impossible : ${ACCOUNT_STATUSES[current].toLowerCase()}`);
  if (status === "conteste" && !note.trim()) throw badRequest("Notez le motif de la contestation du client");
  if (status === "envoye") {
    const { snap } = await live(ctx, quoteId, num(row?.penalties_cents ?? 0), row?.penalties_note ?? "");
    if (!snap.account.hasFinalInvoice) throw conflict("Émettez d'abord la facture de solde : le décompte récapitule le marché une fois tout facturé");
    await ctx.db.query(
      `INSERT INTO final_accounts (org_id, quote_id, status, snapshot, sent_at) VALUES ($1,$2,'envoye',$3,now())
       ON CONFLICT (quote_id) DO UPDATE SET status='envoye', snapshot=EXCLUDED.snapshot, sent_at=now(), answered_at=NULL, answer_note='', updated_at=now()`,
      [ctx.orgId, quoteId, JSON.stringify(snap)],
    );
  } else if (status === "projet") {
    await ctx.db.query("UPDATE final_accounts SET status='projet', snapshot=NULL, updated_at=now() WHERE quote_id=$1 AND org_id=$2", [quoteId, ctx.orgId]);
  } else {
    await ctx.db.query("UPDATE final_accounts SET status=$3, answered_at=now(), answer_note=$4, updated_at=now() WHERE quote_id=$1 AND org_id=$2", [
      quoteId,
      ctx.orgId,
      status,
      note.trim().slice(0, 500),
    ]);
  }
  await audit(ctx.db, { orgId: ctx.orgId, userId: ctx.userId, action: `final_account.${status}`, target: quoteId, ip: ctx.ip });
}
