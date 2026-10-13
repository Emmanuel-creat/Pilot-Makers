/**
 * API publique (v1) : lecture des clients, devis, factures, catalogue et chantiers,
 * création de clients et de prestations. Toutes les règles de l'application s'appliquent
 * (droits, lecture seule, validations), au nom de l'administrateur qui a créé la clé.
 */

import { conflict, isUuid, notFound } from "@/lib/http";
import { requireScope } from "./api-keys";
import { createItem, getItem, searchItems } from "./catalog";
import type { Ctx } from "./context";
import { audit } from "./context";
import { createCustomer, getCustomer, searchCustomers } from "./customers";
import { getInvoice, getInvoicePdf, listInvoices } from "./invoices";
import { getJob, listJobs } from "./jobs";
import { getDraft, getQuoteRow, getVersion, listQuotes, listVersions } from "./quotes";
import { createEndpoint, listEndpoints, WEBHOOK_EVENTS, webhookSamples } from "./webhooks";

export async function apiMe(ctx: Ctx) {
  const org = await ctx.db.query<{ trade_name: string; legal_name: string; siren: string }>(
    "SELECT trade_name, legal_name, siren FROM organizations WHERE id=$1",
    [ctx.orgId],
  );
  return { organization: { id: ctx.orgId, ...org[0] }, scopes: ctx.apiKey?.scopes ?? [], acting_as: ctx.email };
}

export async function apiListCustomers(ctx: Ctx, f: { q?: string; limit: number; offset: number }) {
  const rows = await searchCustomers(ctx, { q: f.q, limit: f.limit, offset: f.offset });
  return { data: rows.map(({ quote_count, ...c }) => ({ ...c, quote_count: Number(quote_count) })), limit: f.limit, offset: f.offset };
}

export async function apiGetCustomer(ctx: Ctx, id: string) {
  return getCustomer(ctx, id);
}

export async function apiCreateCustomer(ctx: Ctx, body: Record<string, unknown>) {
  requireScope(ctx, "write");
  const r = await createCustomer(ctx, body, { allowDuplicate: body.allow_duplicate === true });
  if (!r.id)
    throw conflict("Client probablement déjà enregistré : renvoyez avec allow_duplicate=true pour le créer quand même", { duplicates: r.duplicates });
  await audit(ctx.db, { orgId: ctx.orgId, userId: ctx.userId, action: "api.customer.create", data: { id: r.id, key: ctx.apiKey?.id }, ip: ctx.ip });
  return getCustomer(ctx, r.id);
}

export async function apiListQuotes(ctx: Ctx, f: { status?: string; customerId?: string; page: number; pageSize: number }) {
  const r = await listQuotes(ctx, { status: f.status, customerId: f.customerId, page: f.page, pageSize: f.pageSize, sort: "created" });
  return { data: r.items.map(({ marginCents: _m, ...q }) => q), total: r.total, page: r.page, page_size: r.pageSize };
}

export async function apiGetQuote(ctx: Ctx, id: string) {
  const draft = await getDraft(ctx, id);
  const row = await getQuoteRow(ctx.db, ctx, id);
  const { internalNotes: _n, draftRevision: _d, ...rest } = draft;
  return {
    ...rest,
    totals: { htCents: Number(row.total_ht_cents ?? 0), ttcCents: Number(row.total_ttc_cents ?? 0) },
    versions: await listVersions(ctx, id),
  };
}

/** PDF tel qu'envoyé au client : la dernière version émise, ou celle demandée. */
export async function apiQuotePdf(ctx: Ctx, id: string, version?: number) {
  const row = await getQuoteRow(ctx.db, ctx, id);
  const v = version ?? Number(row.current_version ?? 0);
  if (!v) throw notFound("Ce devis n'a pas encore été émis");
  return getVersion(ctx.db, ctx.orgId, id, v);
}

export async function apiListInvoices(ctx: Ctx, f: { status?: string; customerId?: string; limit: number }) {
  return { data: await listInvoices(ctx, { status: f.status, customerId: f.customerId, limit: f.limit }) };
}

export async function apiGetInvoice(ctx: Ctx, id: string) {
  return getInvoice(ctx, id);
}

export async function apiInvoicePdf(ctx: Ctx, id: string) {
  return getInvoicePdf(ctx, id);
}

export async function apiListCatalog(ctx: Ctx, f: { q?: string; limit: number }) {
  return { data: await searchItems(ctx, { q: f.q, limit: f.limit, sort: "name" }) };
}

export async function apiCreateCatalogItem(ctx: Ctx, body: Record<string, unknown>) {
  requireScope(ctx, "write");
  const id = await createItem(ctx, body);
  await audit(ctx.db, { orgId: ctx.orgId, userId: ctx.userId, action: "api.catalog.create", data: { id, key: ctx.apiKey?.id }, ip: ctx.ip });
  return getItem(ctx, id);
}

export async function apiListJobs(ctx: Ctx, f: { status?: string }) {
  return { data: await listJobs(ctx, { status: f.status }) };
}

export async function apiGetJob(ctx: Ctx, id: string) {
  const job = await getJob(ctx, id);
  return job;
}

/* Abonnements des outils d'automatisation (modèle « REST hooks » de Zapier, Make et n8n) */

export async function apiListSubscriptions(ctx: Ctx) {
  const all = await listEndpoints(ctx);
  return {
    data: all
      .filter((e) => e.api_key_id === ctx.apiKey?.id)
      .map((e) => ({ id: e.id, url: e.url, events: e.events, label: e.label, active: e.active, created_at: e.created_at })),
    events: WEBHOOK_EVENTS,
  };
}

/** Abonnement : l'outil fournit son adresse de réception ; la clé de signature n'est renvoyée qu'ici. */
export async function apiSubscribe(ctx: Ctx, body: Record<string, unknown>) {
  requireScope(ctx, "write");
  const events = Array.isArray(body.events) ? body.events : typeof body.event === "string" ? [body.event] : [];
  const url = typeof body.url === "string" ? body.url : typeof body.target_url === "string" ? body.target_url : "";
  const r = await createEndpoint(ctx, { url, events, label: typeof body.label === "string" ? body.label : "" });
  return { id: r.id, secret: r.secret, url, events };
}

/** Désabonnement : une clé ne retire que les abonnements qu'elle a créés. */
export async function apiUnsubscribe(ctx: Ctx, id: string) {
  requireScope(ctx, "write");
  if (!isUuid(id)) throw notFound("Abonnement introuvable");
  const r = await ctx.db.query("DELETE FROM webhook_endpoints WHERE id=$1 AND org_id=$2 AND api_key_id=$3 RETURNING id", [id, ctx.orgId, ctx.apiKey?.id ?? null]);
  if (!r.length) throw notFound("Abonnement introuvable");
  await audit(ctx.db, { orgId: ctx.orgId, userId: ctx.userId, action: "webhook.delete", target: id, data: { key: ctx.apiKey?.id }, ip: ctx.ip });
  return { deleted: true };
}

export function apiSamples(event?: string) {
  const all = webhookSamples();
  return { data: event ? all.filter((s) => s.type === event) : all };
}
