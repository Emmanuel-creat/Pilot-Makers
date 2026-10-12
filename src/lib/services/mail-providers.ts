/**
 * Prestataires d'envoi d'e-mails réels, appelés par leur API HTTP.
 *
 * Choix par MAIL_PROVIDER (brevo, postmark, resend), clé dans MAIL_API_KEY,
 * expéditeur dans MAIL_FROM (adresse d'un domaine authentifié SPF, DKIM et DMARC
 * chez le prestataire). Sans configuration complète, la boîte d'envoi locale reste
 * utilisée : aucune adresse réelle n'est jamais contactée par erreur.
 */

import type { MailMessage, MailProvider } from "./mail";

export interface OutgoingMail extends MailMessage {
  id: string;
  replyTo?: string | null;
  attachment?: { filename: string; contentBase64: string } | null;
}

type Result = Awaited<ReturnType<MailProvider["deliver"]>>;

export function parseFrom(from: string): { email: string; name: string } {
  const m = /^\s*(.*?)\s*<([^>]+)>\s*$/.exec(from);
  return m ? { name: m[1].replace(/^"|"$/g, ""), email: m[2] } : { name: "", email: from.trim() };
}

async function post(url: string, headers: Record<string, string>, body: unknown): Promise<{ ok: boolean; status: number; json: Record<string, unknown> }> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json", ...headers },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15_000),
  });
  let json: Record<string, unknown> = {};
  try {
    json = (await res.json()) as Record<string, unknown>;
  } catch {
    // Réponse sans corps JSON : seul le code HTTP compte.
  }
  return { ok: res.ok, status: res.status, json };
}

/** Une erreur 4xx du prestataire est définitive (adresse refusée) ; une 5xx peut être retentée. */
function failure(status: number, json: Record<string, unknown>): Result {
  const message = String(json.message ?? json.Message ?? json.error ?? `Erreur ${status} du prestataire`);
  return { status: "failed", error: message.slice(0, 300) };
}

export function brevoProvider(apiKey: string, from: string): MailProvider {
  const sender = parseFrom(from);
  return {
    name: "brevo",
    async deliver(msg: OutgoingMail) {
      const r = await post(
        "https://api.brevo.com/v3/smtp/email",
        { "api-key": apiKey },
        {
          sender: { email: sender.email, name: sender.name || undefined },
          to: [{ email: msg.to }],
          replyTo: msg.replyTo ? { email: msg.replyTo } : undefined,
          subject: msg.subject,
          textContent: msg.body,
          attachment: msg.attachment ? [{ name: msg.attachment.filename, content: msg.attachment.contentBase64 }] : undefined,
          headers: { "X-PM-Id": msg.id },
        },
      );
      if (!r.ok) return failure(r.status, r.json);
      return { status: "sent", providerMessageId: String(r.json.messageId ?? "") };
    },
  };
}

export function postmarkProvider(apiKey: string, from: string): MailProvider {
  return {
    name: "postmark",
    async deliver(msg: OutgoingMail) {
      const r = await post(
        "https://api.postmarkapp.com/email",
        { "X-Postmark-Server-Token": apiKey },
        {
          From: from,
          To: msg.to,
          ReplyTo: msg.replyTo ?? undefined,
          Subject: msg.subject,
          TextBody: msg.body,
          MessageStream: "outbound",
          Metadata: { pm_id: msg.id },
          Attachments: msg.attachment
            ? [{ Name: msg.attachment.filename, Content: msg.attachment.contentBase64, ContentType: "application/pdf" }]
            : undefined,
        },
      );
      if (!r.ok || Number(r.json.ErrorCode ?? 0) !== 0) return failure(r.status, r.json);
      return { status: "sent", providerMessageId: String(r.json.MessageID ?? "") };
    },
  };
}

export function resendProvider(apiKey: string, from: string): MailProvider {
  return {
    name: "resend",
    async deliver(msg: OutgoingMail) {
      const r = await post(
        "https://api.resend.com/emails",
        { authorization: `Bearer ${apiKey}`, "idempotency-key": msg.id },
        {
          from,
          to: [msg.to],
          reply_to: msg.replyTo ?? undefined,
          subject: msg.subject,
          text: msg.body,
          attachments: msg.attachment ? [{ filename: msg.attachment.filename, content: msg.attachment.contentBase64 }] : undefined,
        },
      );
      if (!r.ok) return failure(r.status, r.json);
      return { status: "sent", providerMessageId: String(r.json.id ?? "") };
    },
  };
}

export function providerFromEnv(env: Record<string, string | undefined> = process.env): MailProvider | null {
  const name = (env.MAIL_PROVIDER ?? "outbox").toLowerCase();
  const key = env.MAIL_API_KEY ?? "";
  const from = env.MAIL_FROM ?? "";
  if (name === "outbox" || !key || !from) return null;
  if (name === "brevo") return brevoProvider(key, from);
  if (name === "postmark") return postmarkProvider(key, from);
  if (name === "resend") return resendProvider(key, from);
  return null;
}

/**
 * Événements de suivi envoyés par les prestataires (rejet, plainte, remise),
 * ramenés à une forme commune : identifiant du message chez le prestataire et état.
 */
export function normalizeMailEvent(provider: string, payload: unknown): { providerMessageId: string; status: "bounced" | "sent" | "complaint"; detail: string }[] {
  const items = Array.isArray(payload) ? payload : [payload];
  const out: { providerMessageId: string; status: "bounced" | "sent" | "complaint"; detail: string }[] = [];
  for (const raw of items) {
    if (!raw || typeof raw !== "object") continue;
    const e = raw as Record<string, unknown>;
    if (provider === "brevo") {
      const ev = String(e.event ?? "");
      const id = String(e["message-id"] ?? "");
      if (["hard_bounce", "soft_bounce", "blocked", "invalid_email"].includes(ev)) out.push({ providerMessageId: id, status: "bounced", detail: String(e.reason ?? ev) });
      else if (ev === "spam") out.push({ providerMessageId: id, status: "complaint", detail: "Signalé comme indésirable" });
      else if (ev === "delivered") out.push({ providerMessageId: id, status: "sent", detail: "Remis" });
    } else if (provider === "postmark") {
      const type = String(e.RecordType ?? "");
      const id = String(e.MessageID ?? "");
      if (type === "Bounce") out.push({ providerMessageId: id, status: "bounced", detail: String(e.Description ?? e.Type ?? "Rejet") });
      else if (type === "SpamComplaint") out.push({ providerMessageId: id, status: "complaint", detail: "Signalé comme indésirable" });
      else if (type === "Delivery") out.push({ providerMessageId: id, status: "sent", detail: "Remis" });
    } else if (provider === "resend") {
      const type = String(e.type ?? "");
      const data = (e.data ?? {}) as Record<string, unknown>;
      const id = String(data.email_id ?? "");
      if (type === "email.bounced") out.push({ providerMessageId: id, status: "bounced", detail: "Rejet" });
      else if (type === "email.complained") out.push({ providerMessageId: id, status: "complaint", detail: "Signalé comme indésirable" });
      else if (type === "email.delivered") out.push({ providerMessageId: id, status: "sent", detail: "Remis" });
    }
  }
  return out.filter((x) => x.providerMessageId);
}
