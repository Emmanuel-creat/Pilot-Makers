/**
 * Campagnes e-mail vers les anciens clients : ciblage d'après la dernière facture, le type de client,
 * une étiquette ou le code postal, aperçu, envoi personnalisé et désinscription en un clic.
 */

import { z } from "zod";
import { one, type Queryable } from "@/lib/db";
import { MAX_RECIPIENTS, readFilters, render, unknownFields, unsubscribeFooter, type CampaignFilters } from "@/lib/campaigns";
import { badRequest, conflict, isUuid, notFound } from "@/lib/http";
import { randomToken } from "@/lib/security";
import type { Ctx } from "./context";
import { audit, requirePermission, requireWritable } from "./context";
import { appUrl, sendMail } from "./mail";
import { parisDate } from "./quotes";

export interface Recipient {
  customerId: string;
  name: string;
  firstName: string;
  lastName: string;
  email: string;
  lastWork: string;
  lastInvoiceDate: string | null;
}

async function orgName(q: Queryable, orgId: string) {
  const o = await one<{ name: string }>(q, "SELECT coalesce(nullif(trade_name, ''), legal_name) AS name FROM organizations WHERE id=$1", [orgId]);
  return o?.name ?? "";
}

/** Clients joignables par e-mail, non désinscrits, qui répondent aux critères. */
export async function audience(ctx: Ctx, f: CampaignFilters, today = parisDate(new Date())): Promise<Recipient[]> {
  requirePermission(ctx, "billing");
  const params: unknown[] = [ctx.orgId, today];
  const where: string[] = [];
  const months = "(date_part('year', age($2::date, l.last_date)) * 12 + date_part('month', age($2::date, l.last_date)))";
  if (f.monthsMin != null) where.push(`l.last_date IS NOT NULL AND ${months} >= ${f.monthsMin}`);
  if (f.monthsMax != null) where.push(`l.last_date IS NOT NULL AND ${months} <= ${f.monthsMax}`);
  if (f.type) {
    params.push(f.type);
    where.push(`c.type = $${params.length}`);
  }
  if (f.tag) {
    params.push(f.tag.toLowerCase());
    where.push(`EXISTS (SELECT 1 FROM unnest(c.tags) t WHERE lower(t) = $${params.length})`);
  }
  if (f.postalPrefix) {
    params.push(f.postalPrefix + "%");
    where.push(`(c.billing_postal_code LIKE $${params.length} OR c.site_postal_code LIKE $${params.length})`);
  }
  const rows = await ctx.db.query<{
    id: string;
    first_name: string;
    last_name: string;
    name: string;
    email: string;
    last_title: string | null;
    last_date: string | null;
  }>(
    `SELECT c.id, c.first_name, c.last_name, coalesce(nullif(c.company_name, ''), nullif(trim(c.first_name || ' ' || c.last_name), ''), c.email) AS name, c.email,
       l.last_title, to_char(l.last_date, 'YYYY-MM-DD') AS last_date, $2::date AS today
     FROM customers c
     LEFT JOIN LATERAL (SELECT i.title AS last_title, i.issue_date AS last_date FROM invoices i
       WHERE i.customer_id=c.id AND i.org_id=c.org_id AND i.kind <> 'credit_note' ORDER BY i.issue_date DESC LIMIT 1) l ON true
     WHERE c.org_id=$1 AND c.archived_at IS NULL AND c.marketing_optout_at IS NULL AND c.email LIKE '%@%'
     ${where.length ? "AND " + where.join(" AND ") : ""}
     ORDER BY name LIMIT ${MAX_RECIPIENTS + 1}`,
    params,
  );
  return rows.map((r) => ({
    customerId: r.id,
    name: r.name,
    firstName: r.first_name,
    lastName: r.last_name,
    email: r.email.trim(),
    lastWork: (r.last_title ?? "").replace(/^(Facture|Situation n° \d+)\s*:\s*/i, ""),
    lastInvoiceDate: r.last_date,
  }));
}

const schema = z.object({
  name: z.string().trim().min(1, "Donnez un nom à la campagne").max(120),
  subject: z.string().trim().min(3, "Indiquez l'objet du message").max(150, "Objet trop long"),
  body: z.string().trim().min(20, "Le message est trop court").max(5000, "Message trop long"),
});

export async function saveCampaign(ctx: Ctx, id: string | null, raw: Record<string, unknown>) {
  requireWritable(ctx);
  requirePermission(ctx, "billing");
  const p = schema.safeParse(raw);
  if (!p.success) throw badRequest(p.error.issues[0].message);
  const bad = unknownFields(p.data.subject + " " + p.data.body);
  if (bad.length) throw badRequest(`Champ inconnu : {${bad[0]}}. Champs possibles : {prenom}, {nom}, {entreprise}, {derniers_travaux}`);
  const filters = readFilters(raw);
  if (filters.monthsMin != null && filters.monthsMax != null && filters.monthsMin > filters.monthsMax)
    throw badRequest("La période de dernière facture est inversée");
  if (id) {
    const c = await getCampaign(ctx, id);
    if (c.status !== "brouillon") throw conflict("Une campagne envoyée ne se modifie plus : dupliquez-la");
    await ctx.db.query("UPDATE campaigns SET name=$2, subject=$3, body=$4, filters=$5 WHERE id=$1", [
      id,
      p.data.name,
      p.data.subject,
      p.data.body,
      JSON.stringify(filters),
    ]);
    return id;
  }
  const r = await one<{ id: string }>(
    ctx.db,
    "INSERT INTO campaigns (org_id, name, subject, body, filters, created_by) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id",
    [ctx.orgId, p.data.name, p.data.subject, p.data.body, JSON.stringify(filters), ctx.userId],
  );
  return r!.id;
}

export interface Campaign {
  id: string;
  name: string;
  subject: string;
  body: string;
  filters: CampaignFilters;
  status: "brouillon" | "envoyee";
  recipients: number;
  sentAt: Date | null;
  createdAt: Date;
}

const mapCampaign = (r: Record<string, unknown>): Campaign => ({
  id: String(r.id),
  name: String(r.name),
  subject: String(r.subject),
  body: String(r.body),
  filters: readFilters((r.filters as Record<string, unknown>) ?? {}),
  status: r.status as Campaign["status"],
  recipients: Number(r.recipients),
  sentAt: (r.sent_at as Date | null) ?? null,
  createdAt: r.created_at as Date,
});

export async function listCampaigns(ctx: Ctx) {
  requirePermission(ctx, "billing");
  return (await ctx.db.query<Record<string, unknown>>("SELECT * FROM campaigns WHERE org_id=$1 ORDER BY created_at DESC LIMIT 100", [ctx.orgId])).map(
    mapCampaign,
  );
}

export async function getCampaign(ctx: Ctx, id: string) {
  requirePermission(ctx, "billing");
  if (!isUuid(id)) throw notFound("Campagne introuvable");
  const r = await one<Record<string, unknown>>(ctx.db, "SELECT * FROM campaigns WHERE id=$1 AND org_id=$2", [id, ctx.orgId]);
  if (!r) throw notFound("Campagne introuvable");
  return mapCampaign(r);
}

export async function deleteCampaign(ctx: Ctx, id: string) {
  requireWritable(ctx);
  const c = await getCampaign(ctx, id);
  if (c.status !== "brouillon") throw conflict("Une campagne envoyée reste dans l'historique");
  await ctx.db.query("DELETE FROM campaigns WHERE id=$1", [id]);
}

/** Message tel que le recevra un client donné, mention de désinscription comprise. */
export function personalize(c: Pick<Campaign, "subject" | "body">, r: Recipient, org: string, unsubscribeUrl: string) {
  const vars = { prenom: r.firstName, nom: r.lastName, entreprise: org, derniers_travaux: r.lastWork || "vos derniers travaux" };
  return { subject: render(c.subject, vars), body: render(c.body, vars) + unsubscribeFooter(unsubscribeUrl, org) };
}

export async function previewCampaign(ctx: Ctx, id: string) {
  const c = await getCampaign(ctx, id);
  const list = await audience(ctx, c.filters);
  const org = await orgName(ctx.db, ctx.orgId);
  const sample = list[0] ? personalize(c, list[0], org, appUrl("/desinscription/...")) : null;
  return { campaign: c, recipients: list.slice(0, MAX_RECIPIENTS), tooMany: list.length > MAX_RECIPIENTS, sample };
}

/** Envoi : un e-mail personnel par client, jamais deux fois au même client pour la même campagne. */
export async function sendCampaign(ctx: Ctx, id: string) {
  requireWritable(ctx);
  const c = await getCampaign(ctx, id);
  if (c.status !== "brouillon") throw conflict("Campagne déjà envoyée");
  const list = await audience(ctx, c.filters);
  if (!list.length) throw badRequest("Aucun client ne correspond aux critères");
  if (list.length > MAX_RECIPIENTS) throw badRequest(`Plus de ${MAX_RECIPIENTS} destinataires : affinez les critères`);
  const org = await orgName(ctx.db, ctx.orgId);
  const claimed = await one<{ id: string }>(
    ctx.db,
    "UPDATE campaigns SET status='envoyee', sent_at=now(), recipients=$2 WHERE id=$1 AND status='brouillon' RETURNING id",
    [id, list.length],
  );
  if (!claimed) throw conflict("Campagne déjà envoyée");
  let sent = 0;
  for (const r of list) {
    let token = (await one<{ marketing_token: string | null }>(ctx.db, "SELECT marketing_token FROM customers WHERE id=$1", [r.customerId]))?.marketing_token;
    if (!token) {
      token = randomToken(18);
      await ctx.db.query("UPDATE customers SET marketing_token=$2 WHERE id=$1", [r.customerId, token]);
    }
    const m = personalize(c, r, org, appUrl(`/desinscription/${token}`));
    const mail = await sendMail(ctx.db, {
      orgId: ctx.orgId,
      kind: "campaign",
      to: r.email,
      subject: m.subject,
      body: m.body,
      idempotencyKey: `campaign:${id}:${r.customerId}`,
    });
    await ctx.db.query("INSERT INTO campaign_recipients (campaign_id, customer_id, email_id) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING", [
      id,
      r.customerId,
      mail.id,
    ]);
    if (mail.status !== "failed" && mail.status !== "bounced") sent++;
  }
  await audit(ctx.db, { orgId: ctx.orgId, userId: ctx.userId, action: "campaign.send", target: id, ip: ctx.ip });
  return { recipients: list.length, sent };
}

/** Désinscription par le lien du message, sans compte. */
export async function unsubscribeInfo(db: Queryable, token: string) {
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(token)) return null;
  const r = await one<{ id: string; org_id: string; optout: Date | null }>(
    db,
    "SELECT id, org_id, marketing_optout_at AS optout FROM customers WHERE marketing_token=$1",
    [token],
  );
  return r ? { customerId: r.id, orgName: await orgName(db, r.org_id), unsubscribed: !!r.optout } : null;
}

export async function unsubscribe(db: Queryable, token: string) {
  const info = await unsubscribeInfo(db, token);
  if (!info) throw notFound("Lien de désinscription invalide");
  await db.query("UPDATE customers SET marketing_optout_at=coalesce(marketing_optout_at, now()) WHERE id=$1", [info.customerId]);
  return info;
}
