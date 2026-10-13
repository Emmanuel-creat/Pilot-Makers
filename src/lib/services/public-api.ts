/**
 * API publique (v1) : lecture des clients, devis, factures, catalogue et chantiers,
 * création de clients et de prestations. Toutes les règles de l'application s'appliquent
 * (droits, lecture seule, validations), au nom de l'administrateur qui a créé la clé.
 */

import { conflict, notFound } from "@/lib/http";
import { requireScope } from "./api-keys";
import { createItem, getItem, searchItems } from "./catalog";
import type { Ctx } from "./context";
import { audit } from "./context";
import { createCustomer, getCustomer, searchCustomers } from "./customers";
import { getInvoice, getInvoicePdf, listInvoices } from "./invoices";
import { getJob, listJobs } from "./jobs";
import { getDraft, getQuoteRow, getVersion, listQuotes, listVersions } from "./quotes";

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
