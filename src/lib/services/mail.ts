/**
 * Envoi d'e-mails transactionnels.
 *
 * Chaque e-mail est d'abord enregistré (traçabilité, idempotence), puis confié au
 * prestataire. Le prestataire fourni ("outbox") conserve les messages dans la
 * boîte d'envoi de l'application, visible dans l'interface, sans rien envoyer
 * réellement. Les vrais prestataires (Brevo, Postmark, Resend) sont dans
 * mail-providers.ts et s'activent par MAIL_PROVIDER, MAIL_API_KEY et MAIL_FROM.
 */

import type { Queryable } from "@/lib/db";
import { one } from "@/lib/db";
import { recordUsage } from "./context";
import { PermanentJobError, enqueueJob, type JobHandler } from "./task-queue";
import { providerFromEnv, type OutgoingMail } from "./mail-providers";

export interface MailMessage {
  orgId?: string | null;
  quoteId?: string | null;
  kind: string;
  to: string;
  subject: string;
  body: string;
  attachmentVersionId?: string | null;
  /** Facture jointe (PDF figé) et facture concernée */
  attachmentInvoiceId?: string | null;
  invoiceId?: string | null;
  idempotencyKey?: string | null;
}

export interface MailProvider {
  name: string;
  /** `retryable` : échec passager (prestataire indisponible, limite de débit), l'e-mail sera renvoyé plus tard. */
  deliver(msg: OutgoingMail): Promise<{ status: "sent" | "failed" | "bounced"; providerMessageId?: string; error?: string; retryable?: boolean }>;
}

/** Boîte d'envoi locale. Les adresses du domaine "invalide.test" simulent un rejet. */
export const outboxProvider: MailProvider = {
  name: "outbox",
  async deliver(msg) {
    if (/@invalide\.test$/i.test(msg.to)) {
      return { status: "bounced", error: "Adresse inexistante (rejet signalé par le prestataire)" };
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(msg.to)) return { status: "failed", error: "Adresse e-mail invalide" };
    return { status: "sent", providerMessageId: "outbox-" + msg.id };
  },
};

let override: MailProvider | null = null;

/** Pour les tests : remplace le prestataire (null rétablit la configuration). */
export function setMailProviderForTests(p: MailProvider | null) {
  override = p;
}

export function getMailProvider(): MailProvider {
  return override ?? providerFromEnv() ?? outboxProvider;
}

export interface SentMail {
  id: string;
  status: string;
  error: string | null;
  duplicate: boolean;
}

export async function sendMail(q: Queryable, msg: MailMessage): Promise<SentMail> {
  if (msg.idempotencyKey) {
    const existing = await one<{ id: string; status: string; error: string | null }>(
      q,
      "SELECT id, status, error FROM emails WHERE idempotency_key = $1",
      [msg.idempotencyKey],
    );
    if (existing) return { ...existing, duplicate: true };
  }
  const provider = getMailProvider();
  const row = (await one<{ id: string }>(
    q,
    `INSERT INTO emails (org_id, quote_id, kind, to_address, subject, body, attachment_version_id, idempotency_key, provider,
       attachment_invoice_id, invoice_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id`,
    [
      msg.orgId ?? null,
      msg.quoteId ?? null,
      msg.kind,
      msg.to.trim(),
      msg.subject,
      msg.body,
      msg.attachmentVersionId ?? null,
      msg.idempotencyKey ?? null,
      provider.name,
      msg.attachmentInvoiceId ?? null,
      msg.invoiceId ?? null,
    ],
  ))!;
  const result = await deliverEmail(q, row.id, provider);
  if (result.status === "failed" && result.retryable) {
    await enqueueJob(q, MAIL_RETRY_JOB, { emailId: row.id }, { orgId: msg.orgId ?? null, runAt: new Date(Date.now() + 60_000), dedupeKey: `mail:${row.id}` });
  }
  if (msg.orgId) await recordUsage(q, msg.orgId, null, "email", 1, 300);
  return { id: row.id, status: result.status, error: result.error ?? null, duplicate: false };
}

type DeliveryResult = Awaited<ReturnType<MailProvider["deliver"]>>;

/** Confie au prestataire un e-mail déjà enregistré et note le résultat. */
async function deliverEmail(q: Queryable, id: string, provider = getMailProvider()): Promise<DeliveryResult> {
  const msg = await one<Record<string, string | null>>(
    q,
    "SELECT org_id, quote_id, kind, to_address, subject, body, attachment_version_id, attachment_invoice_id, invoice_id FROM emails WHERE id=$1",
    [id],
  );
  if (!msg) return { status: "failed", error: "E-mail introuvable" };
  let result: DeliveryResult;
  try {
    const extra: Pick<OutgoingMail, "replyTo" | "attachment"> = {};
    if (msg.org_id) {
      const org = await one<{ email: string }>(q, "SELECT email FROM organizations WHERE id=$1", [msg.org_id]);
      extra.replyTo = org?.email || null;
    }
    if (msg.attachment_version_id && provider !== outboxProvider) {
      const v = await one<{ number: string; version: number; pdf: Uint8Array }>(
        q,
        "SELECT number, version, pdf FROM quote_versions WHERE id=$1",
        [msg.attachment_version_id],
      );
      if (v) extra.attachment = { filename: `Devis-${v.number}-v${v.version}.pdf`, contentBase64: Buffer.from(v.pdf).toString("base64") };
    }
    if (msg.attachment_invoice_id && provider !== outboxProvider) {
      const inv = await one<{ number: string; kind: string; pdf: Uint8Array }>(q, "SELECT number, kind, pdf FROM invoices WHERE id=$1", [msg.attachment_invoice_id]);
      if (inv) {
        const name = inv.kind === "credit_note" ? "Avoir" : "Facture";
        extra.attachment = { filename: `${name}-${inv.number}.pdf`, contentBase64: Buffer.from(inv.pdf).toString("base64") };
      }
    }
    result = await provider.deliver({
      id,
      orgId: msg.org_id,
      quoteId: msg.quote_id,
      kind: String(msg.kind),
      to: String(msg.to_address),
      subject: String(msg.subject),
      body: String(msg.body),
      attachmentVersionId: msg.attachment_version_id,
      attachmentInvoiceId: msg.attachment_invoice_id,
      invoiceId: msg.invoice_id,
      ...extra,
    });
  } catch (e) {
    result = { status: "failed", error: (e as Error).message, retryable: true };
  }
  await q.query(
    `UPDATE emails SET status=$2, provider_message_id=$3, error=$4, attempts=attempts+1,
       sent_at = CASE WHEN $2 = 'sent' THEN now() ELSE sent_at END WHERE id=$1`,
    [id, result.status, result.providerMessageId ?? null, result.error ?? null],
  );
  return result;
}

export const MAIL_RETRY_JOB = "mail.retry";

/**
 * Nouvel essai d'un e-mail refusé pour une raison passagère. Un devis envoyé avec succès à ce nouvel essai
 * passe à l'état « envoyé », comme s'il était parti du premier coup.
 */
export const retryMailJob: JobHandler = async (db, job) => {
  const id = String(job.payload.emailId ?? "");
  const current = await one<{ status: string }>(db, "SELECT status FROM emails WHERE id=$1", [id]);
  if (!current) throw new PermanentJobError("E-mail introuvable");
  if (current.status !== "failed") return;
  const result = await deliverEmail(db, id);
  if (result.status === "sent") {
    const e = await one<{ org_id: string | null; quote_id: string | null; kind: string; to_address: string }>(
      db,
      "SELECT org_id, quote_id, kind, to_address FROM emails WHERE id=$1",
      [id],
    );
    if (e?.kind === "quote" && e.quote_id && e.org_id) {
      await db.query(
        "UPDATE quotes SET status = CASE WHEN status='ready' THEN 'sent' ELSE status END, sent_at=coalesce(sent_at, now()), updated_at=now() WHERE id=$1 AND org_id=$2",
        [e.quote_id, e.org_id],
      );
      await db.query("INSERT INTO document_events (org_id, quote_id, type, actor_type, data) VALUES ($1,$2,'sent','system',$3)", [
        e.org_id,
        e.quote_id,
        JSON.stringify({ to: e.to_address, email_id: id, status: "sent", retry: true }),
      ]);
    }
    return;
  }
  if (result.status === "failed" && result.retryable) throw new Error(result.error ?? "Prestataire indisponible");
  throw new PermanentJobError(result.error ?? "Envoi refusé");
};

export function appUrl(path = ""): string {
  return (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "") + path;
}

/** Remplace {variable} dans un modèle de message. */
export function renderTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? vars[k] : m));
}

/** Applique un événement de suivi du prestataire (rejet, plainte) à l'e-mail correspondant. */
export async function applyMailEvent(
  q: Queryable,
  provider: string,
  ev: { providerMessageId: string; status: "bounced" | "sent" | "complaint"; detail: string },
): Promise<boolean> {
  const row = await one<{ id: string; quote_id: string | null; org_id: string | null }>(
    q,
    "SELECT id, quote_id, org_id FROM emails WHERE provider=$1 AND provider_message_id=$2",
    [provider, ev.providerMessageId],
  );
  if (!row) return false;
  if (ev.status === "sent") return true;
  await q.query("UPDATE emails SET status='bounced', error=$2 WHERE id=$1", [row.id, ev.detail.slice(0, 300)]);
  if (row.quote_id && row.org_id) {
    await q.query(
      "INSERT INTO document_events (org_id, quote_id, type, actor_type, data) VALUES ($1,$2,'send_failed','system',$3)",
      [row.org_id, row.quote_id, JSON.stringify({ email_id: row.id, status: ev.status, error: ev.detail })],
    );
  }
  return true;
}
