/**
 * Envoi d'e-mails transactionnels.
 *
 * Chaque e-mail est d'abord enregistré (traçabilité, idempotence), puis confié au
 * prestataire. Le prestataire fourni ("outbox") conserve les messages dans la
 * boîte d'envoi de l'application, visible dans l'interface, sans rien envoyer
 * réellement. Pour un vrai prestataire (Brevo, Postmark, Mailjet...), implémenter
 * MailProvider et choisir MAIL_PROVIDER.
 */

import type { Queryable } from "@/lib/db";
import { one } from "@/lib/db";
import { recordUsage } from "./context";

export interface MailMessage {
  orgId?: string | null;
  quoteId?: string | null;
  kind: string;
  to: string;
  subject: string;
  body: string;
  attachmentVersionId?: string | null;
  idempotencyKey?: string | null;
}

export interface MailProvider {
  name: string;
  deliver(msg: MailMessage & { id: string }): Promise<{ status: "sent" | "failed" | "bounced"; providerMessageId?: string; error?: string }>;
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

export function getMailProvider(): MailProvider {
  return outboxProvider;
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
    `INSERT INTO emails (org_id, quote_id, kind, to_address, subject, body, attachment_version_id, idempotency_key, provider)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
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
    ],
  ))!;
  let result: Awaited<ReturnType<MailProvider["deliver"]>>;
  try {
    result = await provider.deliver({ ...msg, id: row.id });
  } catch (e) {
    result = { status: "failed", error: (e as Error).message };
  }
  await q.query(
    `UPDATE emails SET status=$2, provider_message_id=$3, error=$4, attempts=attempts+1,
       sent_at = CASE WHEN $2 = 'sent' THEN now() ELSE sent_at END WHERE id=$1`,
    [row.id, result.status, result.providerMessageId ?? null, result.error ?? null],
  );
  if (msg.orgId) await recordUsage(q, msg.orgId, null, "email", 1, 300);
  return { id: row.id, status: result.status, error: result.error ?? null, duplicate: false };
}

export function appUrl(path = ""): string {
  return (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "") + path;
}

/** Remplace {variable} dans un modèle de message. */
export function renderTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? vars[k] : m));
}
