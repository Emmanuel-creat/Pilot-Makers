/**
 * Côté client : messages rattachés au devis, demandes de modification sur une ligne précise et
 * espace client (devis, factures, procès-verbaux et échanges au même endroit, par un lien personnel).
 */

import { notifyOrg } from "./push";
import { portalStages } from "./payment-stages";
import { z } from "zod";
import type { Database, Queryable } from "@/lib/db";
import { num, one } from "@/lib/db";
import { badRequest, conflict, isUuid, notFound } from "@/lib/http";
import { hitRate } from "@/lib/rate-limit";
import { randomToken, sha256 } from "@/lib/security";
import type { Ctx } from "./context";
import { audit, requireWritable } from "./context";
import { customerDisplayName } from "./customers";
import { INVOICE_STATUSES, mapInvoice } from "./invoices";
import { appUrl, sendMail } from "./mail";
import type { QuoteSnapshot } from "./quote-types";
import { QUOTE_STATUSES, type QuoteStatus } from "./quote-types";
import { createShareLink, getVersion, parisDate, resolveShareToken } from "./quotes";

export const PORTAL_DAYS = 180;
const PENDING = ["ready", "sent", "viewed"];

export interface QuoteMessage {
  id: string;
  author_type: "client" | "entreprise";
  author_name: string;
  kind: "message" | "modification";
  line_label: string;
  body: string;
  version: number;
  handled_at: Date | null;
  read_at: Date | null;
  created_at: Date;
}

const messageSchema = z.object({
  body: z.string().trim().min(2, "Écrivez votre message").max(3000, "Message trop long (3 000 caractères au plus)"),
  name: z.string().trim().max(120).default(""),
  kind: z.enum(["message", "modification"]).default("message"),
  lineId: z.string().max(80).default(""),
});

/** Lignes du devis sur lesquelles le client peut demander une modification. */
export function requestableLines(s: QuoteSnapshot) {
  return s.sections.flatMap((sec) => sec.lines.filter((l) => l.kind === "item").map((l) => ({ id: l.id, label: l.label, section: sec.title })));
}

async function insertClientMessage(
  q: Queryable,
  target: { orgId: string; quoteId: string; version: number; snapshot: QuoteSnapshot; defaultName: string },
  raw: unknown,
  ip: string,
) {
  const p = messageSchema.safeParse(raw);
  if (!p.success) throw badRequest(p.error.issues[0].message);
  const d = p.data;
  let lineLabel = "";
  if (d.lineId) {
    const line = requestableLines(target.snapshot).find((l) => l.id === d.lineId);
    if (!line) throw badRequest("Ligne inconnue : rechargez la page");
    lineLabel = line.label;
  }
  if (d.kind === "modification" && !d.lineId) throw badRequest("Choisissez la ligne à modifier");
  const name = d.name || target.defaultName;
  const r = await one<{ id: string }>(
    q,
    `INSERT INTO quote_messages (org_id, quote_id, version, author_type, author_name, kind, line_id, line_label, body, ip)
     VALUES ($1,$2,$3,'client',$4,$5,$6,$7,$8,$9) RETURNING id`,
    [target.orgId, target.quoteId, target.version, name, d.kind, d.lineId || null, lineLabel, d.body, ip],
  );
  const org = await one<{ email: string }>(q, "SELECT email FROM organizations WHERE id=$1", [target.orgId]);
  if (org?.email) {
    const what = d.kind === "modification" ? `demande une modification sur « ${lineLabel} »` : "vous a écrit";
    await sendMail(q, {
      orgId: target.orgId,
      quoteId: target.quoteId,
      kind: "notification",
      to: org.email,
      subject: `Devis ${target.snapshot.number} : ${name} ${what}`,
      body: `${name} ${what} à propos du devis ${target.snapshot.number} :\n\n${d.body}\n\nRépondre : ${appUrl("/app/devis/" + target.quoteId)}`,
    });
  }
  await notifyOrg(q, target.orgId, {
    title: `Devis ${target.snapshot.number} : message de ${name}`,
    body: d.body.slice(0, 140),
    url: `/app/devis/${target.quoteId}#echanges`,
  });
  return r!.id;
}

/** Message ou demande de modification envoyé depuis la page du devis (lien sécurisé). */
export async function postFromQuoteLink(db: Database, token: string, raw: unknown, meta: { ip: string }) {
  await hitRate(db, "public.message", meta.ip);
  const r = await resolveShareToken(db, token);
  if (!r || r.revoked) throw notFound("Lien invalide ou expiré");
  if (r.status === "canceled") throw conflict("Ce devis a été annulé par l'entreprise");
  return insertClientMessage(
    db,
    {
      orgId: r.link.org_id,
      quoteId: r.link.quote_id,
      version: r.version.version,
      snapshot: r.version.snapshot,
      defaultName: r.version.snapshot.customer.contact || r.version.snapshot.customer.name,
    },
    raw,
    meta.ip,
  );
}

function mapMessage(r: Record<string, unknown>): QuoteMessage {
  return { ...(r as unknown as QuoteMessage), version: num(r.version) };
}

/** Échanges visibles par le client, du plus ancien au plus récent. */
export async function publicThread(q: Queryable, orgId: string, quoteId: string): Promise<QuoteMessage[]> {
  const rows = await q.query<Record<string, unknown>>(
    `SELECT id, author_type, author_name, kind, line_label, body, version, handled_at, read_at, created_at FROM quote_messages
     WHERE org_id=$1 AND quote_id=$2 ORDER BY created_at LIMIT 300`,
    [orgId, quoteId],
  );
  return rows.map(mapMessage);
}

/** Échanges du devis pour l'entreprise ; les messages du client sont marqués comme lus. */
export async function listQuoteMessages(ctx: Ctx, quoteId: string, markRead = true): Promise<QuoteMessage[]> {
  if (!isUuid(quoteId)) throw notFound("Devis introuvable");
  const list = await publicThread(ctx.db, ctx.orgId, quoteId);
  if (markRead && list.some((m) => m.author_type === "client" && !m.read_at) && !ctx.supportAccess)
    await ctx.db.query("UPDATE quote_messages SET read_at=now() WHERE org_id=$1 AND quote_id=$2 AND author_type='client' AND read_at IS NULL", [
      ctx.orgId,
      quoteId,
    ]);
  return list;
}

/** Réponse de l'entreprise : envoyée au client par e-mail, avec le lien vers son espace. */
export async function replyToClient(ctx: Ctx, quoteId: string, body: string) {
  requireWritable(ctx);
  const text = body.trim();
  if (text.length < 2) throw badRequest("Écrivez votre réponse");
  if (text.length > 3000) throw badRequest("Réponse trop longue (3 000 caractères au plus)");
  if (!isUuid(quoteId)) throw notFound("Devis introuvable");
  const quote = await one<{ id: string; customer_id: string | null; current_version: unknown; number: string | null }>(
    ctx.db,
    "SELECT id, customer_id, current_version, number FROM quotes WHERE id=$1 AND org_id=$2",
    [quoteId, ctx.orgId],
  );
  if (!quote) throw notFound("Devis introuvable");
  if (!num(quote.current_version)) throw conflict("Émettez le devis avant d'échanger avec le client");
  await hitRate(ctx.db, "mail.send", ctx.orgId);
  const v = await getVersion(ctx.db, ctx.orgId, quoteId, num(quote.current_version));
  await ctx.db.query(
    `INSERT INTO quote_messages (org_id, quote_id, version, author_type, author_name, user_id, body, read_at) VALUES ($1,$2,$3,'entreprise',$4,$5,$6,now())`,
    [ctx.orgId, quoteId, v.version, ctx.userName, ctx.userId, text],
  );
  let emailed = false;
  const to = v.snapshot.customer.email;
  if (to && quote.customer_id) {
    const { url } = await issuePortalLink(ctx.db, ctx, quote.customer_id);
    await sendMail(ctx.db, {
      orgId: ctx.orgId,
      quoteId,
      kind: "client_message",
      to,
      subject: `${v.snapshot.org.trade_name} : réponse à propos du devis ${v.snapshot.number}`,
      body: `Bonjour,\n\n${text}\n\n${ctx.userName}, ${v.snapshot.org.trade_name}\n\nRetrouvez cet échange, vos devis et vos factures dans votre espace client :\n${url}`,
    });
    emailed = true;
  }
  return { emailed };
}

/** Demande de modification prise en compte (ou rouverte). */
export async function setRequestHandled(ctx: Ctx, messageId: string, handled: boolean) {
  requireWritable(ctx);
  const r = await ctx.db.query(
    `UPDATE quote_messages SET handled_at=${handled ? "now()" : "NULL"} WHERE id=$1 AND org_id=$2 AND kind='modification' RETURNING id`,
    [isUuid(messageId) ? messageId : null, ctx.orgId],
  );
  if (!r.length) throw notFound("Demande introuvable");
}

/** Devis avec des messages du client non lus ou des demandes de modification en attente (tableau de bord). */
export async function clientInbox(ctx: Ctx) {
  const rows = await ctx.db.query<{ quote_id: string; number: string | null; title: string; unread: unknown; open_requests: unknown }>(
    `SELECT m.quote_id, q.number, q.title,
       count(*) FILTER (WHERE m.author_type='client' AND m.read_at IS NULL) AS unread,
       count(*) FILTER (WHERE m.kind='modification' AND m.handled_at IS NULL) AS open_requests
     FROM quote_messages m JOIN quotes q ON q.id=m.quote_id
     WHERE m.org_id=$1 AND ((m.author_type='client' AND m.read_at IS NULL) OR (m.kind='modification' AND m.handled_at IS NULL))
     GROUP BY m.quote_id, q.number, q.title ORDER BY max(m.created_at) DESC LIMIT 20`,
    [ctx.orgId],
  );
  return rows.map((r) => ({ ...r, unread: num(r.unread), open_requests: num(r.open_requests) }));
}

/* ------------------------------------------------------------------ */
/* Espace client                                                        */
/* ------------------------------------------------------------------ */

async function issuePortalLink(q: Queryable, ctx: Ctx, customerId: string) {
  const token = randomToken();
  const expires = new Date(Date.now() + PORTAL_DAYS * 86_400_000);
  await q.query("INSERT INTO customer_portal_links (org_id, customer_id, token_hash, expires_at, created_by) VALUES ($1,$2,$3,$4,$5)", [
    ctx.orgId,
    customerId,
    sha256(token),
    expires,
    ctx.userId,
  ]);
  return { token, url: appUrl("/espace/" + token), expiresAt: expires };
}

async function customerRow(q: Queryable, orgId: string, customerId: string) {
  if (!isUuid(customerId)) throw notFound("Client introuvable");
  const c = await one<Record<string, unknown>>(q, "SELECT * FROM customers WHERE id=$1 AND org_id=$2", [customerId, orgId]);
  if (!c) throw notFound("Client introuvable");
  return c;
}

/** Lien d'espace client, valable six mois ; envoyé par e-mail si demandé. */
export async function createPortalLink(ctx: Ctx, customerId: string, opts: { send?: boolean } = {}) {
  requireWritable(ctx);
  const c = await customerRow(ctx.db, ctx.orgId, customerId);
  const link = await issuePortalLink(ctx.db, ctx, customerId);
  let emailed = false;
  if (opts.send) {
    const email = String(c.email ?? "");
    if (!email) throw badRequest("Ce client n'a pas d'adresse e-mail");
    await hitRate(ctx.db, "mail.send", ctx.orgId);
    const org = await one<{ trade_name: string }>(ctx.db, "SELECT trade_name FROM organizations WHERE id=$1", [ctx.orgId]);
    await sendMail(ctx.db, {
      orgId: ctx.orgId,
      kind: "client_portal",
      to: email,
      subject: `${org?.trade_name ?? "Votre artisan"} : votre espace client`,
      body: `Bonjour,\n\nRetrouvez vos devis, vos factures et nos échanges au même endroit :\n${link.url}\n\nCe lien personnel est valable six mois. Ne le transmettez pas.\n\n${org?.trade_name ?? ""}`,
    });
    emailed = true;
  }
  await audit(ctx.db, { orgId: ctx.orgId, userId: ctx.userId, action: "customer.portal", target: customerId, data: { emailed }, ip: ctx.ip });
  return { ...link, emailed };
}

export async function revokePortalLinks(ctx: Ctx, customerId: string) {
  requireWritable(ctx);
  await customerRow(ctx.db, ctx.orgId, customerId);
  await ctx.db.query("UPDATE customer_portal_links SET revoked_at=now() WHERE customer_id=$1 AND org_id=$2 AND revoked_at IS NULL", [
    customerId,
    ctx.orgId,
  ]);
}

export async function portalLinkInfo(ctx: Ctx, customerId: string) {
  const r = await one<{ n: unknown; last_used: Date | null }>(
    ctx.db,
    `SELECT count(*) AS n, max(last_used_at) AS last_used FROM customer_portal_links
     WHERE customer_id=$1 AND org_id=$2 AND revoked_at IS NULL AND expires_at > now()`,
    [customerId, ctx.orgId],
  );
  return { active: num(r?.n), lastUsed: r?.last_used ?? null };
}

export async function resolvePortal(q: Queryable, token: string) {
  if (!/^[A-Za-z0-9_-]{20,100}$/.test(token)) return null;
  const link = await one<{ id: string; org_id: string; customer_id: string; expires_at: Date; revoked_at: Date | null }>(
    q,
    "SELECT id, org_id, customer_id, expires_at, revoked_at FROM customer_portal_links WHERE token_hash=$1",
    [sha256(token)],
  );
  if (!link || link.revoked_at || link.expires_at < new Date()) return null;
  const org = await one<{ status: string }>(q, "SELECT status FROM organizations WHERE id=$1", [link.org_id]);
  if (org?.status !== "active") return null;
  return link;
}

/** Contenu de l'espace client : devis émis, factures, procès-verbaux de réception, échanges. */
export async function openPortal(db: Database, token: string, meta: { ip: string }) {
  await hitRate(db, "public.view", meta.ip);
  const link = await resolvePortal(db, token);
  if (!link) return null;
  await db.query("UPDATE customer_portal_links SET last_used_at=now() WHERE id=$1", [link.id]);
  const [c, org] = await Promise.all([
    one<Record<string, unknown>>(db, "SELECT * FROM customers WHERE id=$1", [link.customer_id]),
    one<{ trade_name: string; email: string; phone: string }>(db, "SELECT trade_name, email, phone FROM organizations WHERE id=$1", [link.org_id]),
  ]);
  const quotes = await db.query<{
    id: string;
    number: string;
    title: string;
    status: QuoteStatus;
    current_version: unknown;
    valid_until: unknown;
    total_ttc_cents: unknown;
  }>(
    `SELECT id, number, title, status, current_version, valid_until, total_ttc_cents FROM quotes
     WHERE org_id=$1 AND customer_id=$2 AND current_version > 0 AND status NOT IN ('draft', 'incomplete') ORDER BY created_at DESC LIMIT 100`,
    [link.org_id, link.customer_id],
  );
  const invoices = (
    await db.query<Record<string, unknown>>(
      `SELECT id, kind, number, title, issue_date, due_date, total_ht_cents, total_vat_cents, total_ttc_cents, amount_due_cents, paid_cents,
         credited_cents, reminder_count, schedule FROM invoices WHERE org_id=$1 AND customer_id=$2 ORDER BY issue_date DESC LIMIT 200`,
      [link.org_id, link.customer_id],
    )
  ).map(mapInvoice);
  const receptions = await db.query<{ id: string; title: string; reception_date: unknown }>(
    `SELECT r.id, j.title, r.reception_date FROM job_receptions r JOIN jobs j ON j.id=r.job_id
     WHERE r.org_id=$1 AND j.customer_id=$2 ORDER BY r.reception_date DESC`,
    [link.org_id, link.customer_id],
  );
  const messages = await db.query<Record<string, unknown>>(
    `SELECT quote_id, id, author_type, author_name, kind, line_label, body, version, handled_at, read_at, created_at FROM quote_messages
     WHERE org_id=$1 AND quote_id = ANY($2::uuid[]) ORDER BY created_at`,
    [link.org_id, quotes.map((x) => x.id)],
  );
  const today = parisDate(new Date());
  const stages = await portalStages(db, link.org_id, quotes.filter((x) => x.status === "accepted").map((x) => x.id));
  return {
    org: { trade_name: org?.trade_name ?? "", email: org?.email ?? "", phone: org?.phone ?? "" },
    customerName: c ? customerDisplayName(c as never) : "",
    quotes: quotes.map((x) => {
      const validUntil = x.valid_until
        ? x.valid_until instanceof Date
          ? x.valid_until.toISOString().slice(0, 10)
          : String(x.valid_until).slice(0, 10)
        : "";
      return {
        id: x.id,
        number: x.number,
        title: x.title,
        status: x.status,
        statusLabel: QUOTE_STATUSES[x.status],
        totalTtcCents: num(x.total_ttc_cents),
        validUntil,
        awaitingAnswer: PENDING.includes(x.status) && (!validUntil || validUntil >= today),
        messages: messages.filter((m) => m.quote_id === x.id).map(mapMessage),
        stages: stages.get(x.id) ?? [],
      };
    }),
    invoices: invoices.map((i) => ({
      id: i.id,
      number: i.number,
      kind: i.kind,
      title: i.title,
      issueDate: i.issue_date,
      dueDate: i.due_date,
      totalTtcCents: i.total_ttc_cents,
      balanceCents: i.balance_cents,
      status: i.status,
      statusLabel: INVOICE_STATUSES[i.status],
    })),
    receptions: receptions.map((r) => ({
      id: r.id,
      title: r.title,
      date: r.reception_date instanceof Date ? r.reception_date.toISOString().slice(0, 10) : String(r.reception_date).slice(0, 10),
    })),
  };
}

async function portalQuote(q: Queryable, token: string, quoteId: string) {
  const link = await resolvePortal(q, token);
  if (!link || !isUuid(quoteId)) throw notFound("Lien invalide ou expiré");
  const quote = await one<{ id: string; status: QuoteStatus; current_version: unknown }>(
    q,
    "SELECT id, status, current_version FROM quotes WHERE id=$1 AND org_id=$2 AND customer_id=$3 AND current_version > 0",
    [quoteId, link.org_id, link.customer_id],
  );
  if (!quote) throw notFound("Devis introuvable");
  return { link, quote, version: await getVersion(q, link.org_id, quoteId, num(quote.current_version)) };
}

/** Ouverture d'un devis en attente depuis l'espace : un lien de réponse neuf, comme celui de l'e-mail. */
export async function portalAnswerLink(db: Database, token: string, quoteId: string, meta: { ip: string }) {
  await hitRate(db, "public.view", meta.ip);
  const { link, quote, version } = await portalQuote(db, token, quoteId);
  if (!PENDING.includes(quote.status)) throw conflict("Ce devis n'attend plus de réponse");
  const share = await createShareLink(db, link.org_id, quoteId, version.version, version.snapshot.validUntil);
  return share.url;
}

/** Message envoyé depuis l'espace client, sur l'un de ses devis. */
export async function postFromPortal(db: Database, token: string, quoteId: string, raw: unknown, meta: { ip: string }) {
  await hitRate(db, "public.message", meta.ip);
  const { link, version } = await portalQuote(db, token, quoteId);
  const c = await one<Record<string, unknown>>(db, "SELECT * FROM customers WHERE id=$1", [link.customer_id]);
  return insertClientMessage(
    db,
    { orgId: link.org_id, quoteId, version: version.version, snapshot: version.snapshot, defaultName: c ? customerDisplayName(c as never) : "" },
    raw,
    meta.ip,
  );
}

/** Documents PDF de l'espace : dernière version d'un devis, facture, procès-verbal de réception. */
export async function portalPdf(db: Database, token: string, kind: string, id: string, meta: { ip: string }) {
  await hitRate(db, "public.view", meta.ip);
  const link = await resolvePortal(db, token);
  if (!link || !isUuid(id)) throw notFound("Lien invalide ou expiré");
  if (kind === "devis") {
    const { version } = await portalQuote(db, token, id);
    const r = await one<{ pdf: Uint8Array }>(db, "SELECT pdf FROM quote_versions WHERE id=$1", [version.id]);
    if (!r) throw notFound("Document introuvable");
    return { pdf: r.pdf, name: `devis-${version.number}.pdf` };
  }
  if (kind === "facture") {
    const r = await one<{ pdf: Uint8Array; number: string }>(db, "SELECT pdf, number FROM invoices WHERE id=$1 AND org_id=$2 AND customer_id=$3", [
      id,
      link.org_id,
      link.customer_id,
    ]);
    if (!r) throw notFound("Document introuvable");
    return { pdf: r.pdf, name: `facture-${r.number}.pdf` };
  }
  if (kind === "reception") {
    const r = await one<{ pdf: Uint8Array }>(
      db,
      "SELECT r.pdf FROM job_receptions r JOIN jobs j ON j.id=r.job_id WHERE r.id=$1 AND r.org_id=$2 AND j.customer_id=$3",
      [id, link.org_id, link.customer_id],
    );
    if (!r) throw notFound("Document introuvable");
    return { pdf: r.pdf, name: "proces-verbal-reception.pdf" };
  }
  throw notFound("Document introuvable");
}
