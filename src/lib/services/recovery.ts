/** Recouvrement d'une facture impayée : étape, sommes dues, lettre de mise en demeure et dossier d'injonction. */

import { badRequest, conflict } from "@/lib/http";
import { claim, formalNotice, injunctionFile, rateFromText, recoveryStage, type Claim, type InjunctionFile, type RecoveryStage } from "@/lib/recovery";
import type { Ctx } from "./context";
import { audit, requirePermission, requireWritable } from "./context";
import { getInvoice, INVOICE_KINDS } from "./invoices";
import { getOrganization } from "./organization";
import { parisDate } from "./quotes";

export interface Recovery {
  stage: RecoveryStage;
  claim: Claim;
  rateFromSettings: boolean;
  noticeSentOn: string | null;
  noticeRef: string;
  letter: string;
  file: InjunctionFile;
}

const dateOf = (v: unknown) => (v ? (v instanceof Date ? v.toISOString() : String(v)).slice(0, 10) : null);

export async function getRecovery(ctx: Ctx, invoiceId: string, opts: { rateBp?: number | null; now?: Date } = {}): Promise<Recovery> {
  requirePermission(ctx, "billing");
  const inv = await getInvoice(ctx, invoiceId);
  if (inv.kind === "credit_note") throw badRequest("Un avoir ne se recouvre pas");
  const [org, extra, quote] = await Promise.all([
    getOrganization(ctx),
    ctx.db.query<{ formal_notice_on: unknown; formal_notice_ref: string }>(
      "SELECT formal_notice_on, formal_notice_ref FROM invoices WHERE id=$1 AND org_id=$2",
      [invoiceId, ctx.orgId],
    ),
    inv.quote_id
      ? ctx.db.query<{ ok: boolean }>("SELECT accepted_version IS NOT NULL AS ok FROM quotes WHERE id=$1 AND org_id=$2", [inv.quote_id, ctx.orgId])
      : Promise.resolve([]),
  ]);
  const today = parisDate(opts.now ?? new Date());
  const s = inv.snapshot;
  const professional = s.customer.type !== "particulier";
  const settingsRate = rateFromText(org.late_penalty_text ?? "");
  const rateBp = opts.rateBp !== undefined && opts.rateBp !== null ? opts.rateBp : settingsRate;
  const noticeSentOn = dateOf(extra[0]?.formal_notice_on);
  const c = claim({ balanceCents: inv.balance_cents, dueDate: inv.due_date, today, rateBp, professional });
  const address = [s.customer.billing_line1, s.customer.billing_line2, `${s.customer.billing_postal_code} ${s.customer.billing_city}`.trim()].filter(
    (x) => x && x.trim(),
  );
  const orgAddress = [org.address_line1, org.address_line2, `${org.postal_code} ${org.city}`.trim()].filter((x) => x && x.trim());
  return {
    stage: recoveryStage({ balanceCents: inv.balance_cents, dueDate: inv.due_date, today, reminders: inv.reminder_count, noticeSentOn }),
    claim: c,
    rateFromSettings: settingsRate !== null && rateBp === settingsRate,
    noticeSentOn,
    noticeRef: extra[0]?.formal_notice_ref ?? "",
    letter: formalNotice({
      creditor: { name: org.legal_name || org.trade_name, address: orgAddress, siren: org.siren },
      debtor: { name: s.customer.name, address },
      city: org.city,
      today,
      invoice: {
        kind: INVOICE_KINDS[inv.kind].toLowerCase(),
        number: inv.number,
        issueDate: inv.issue_date,
        dueDate: inv.due_date,
        totalCents: inv.amount_due_cents,
      },
      claim: c,
      reminders: inv.reminder_count,
      professional,
    }),
    file: injunctionFile({
      professional,
      debtorIsCompany: professional && Boolean(s.customer.siren?.trim()),
      dueDate: inv.due_date,
      today,
      claim: c,
      hasSignedQuote: Boolean(quote[0]?.ok),
      reminders: inv.reminder_count,
      noticeSentOn,
      debtorAddressComplete: Boolean(s.customer.billing_line1.trim() && s.customer.billing_postal_code.trim() && s.customer.billing_city.trim()),
    }),
  };
}

/** Enregistre l'envoi de la mise en demeure (date et numéro du recommandé), ou l'efface. */
export async function setFormalNotice(ctx: Ctx, invoiceId: string, input: { date: string; ref: string } | null) {
  requirePermission(ctx, "billing");
  requireWritable(ctx);
  const inv = await getInvoice(ctx, invoiceId);
  if (input) {
    if (inv.kind === "credit_note") throw badRequest("Un avoir ne se recouvre pas");
    if (inv.balance_cents <= 0) throw conflict("Cette facture est réglée");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) throw badRequest("Date d'envoi invalide");
    if (input.date < inv.issue_date || input.date > parisDate(new Date()))
      throw badRequest("La date d'envoi doit être comprise entre l'émission de la facture et aujourd'hui");
    const ref = input.ref.trim();
    if (ref.length > 60) throw badRequest("Numéro de recommandé trop long");
    await ctx.db.query("UPDATE invoices SET formal_notice_on=$3, formal_notice_ref=$4 WHERE id=$1 AND org_id=$2", [invoiceId, ctx.orgId, input.date, ref]);
  } else {
    await ctx.db.query("UPDATE invoices SET formal_notice_on=NULL, formal_notice_ref='' WHERE id=$1 AND org_id=$2", [invoiceId, ctx.orgId]);
  }
  await audit(ctx.db, {
    orgId: ctx.orgId,
    userId: ctx.userId,
    action: input ? "invoice.formal_notice" : "invoice.formal_notice_cleared",
    target: invoiceId,
    data: input ?? undefined,
    ip: ctx.ip,
  });
}
