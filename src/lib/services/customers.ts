/** Clients (module C). */

import { z } from "zod";
import type { Queryable } from "@/lib/db";
import { one } from "@/lib/db";
import { badRequest, notFound } from "@/lib/http";
import { parseCsv, toCsv } from "@/lib/csv";
import { cleanId, validateEmail, validatePostalCode, validateSiren, validateVatNumber } from "@/lib/validation/identifiers";
import type { Ctx } from "./context";
import { enqueueWebhook } from "./webhooks";
import { audit, requireWritable } from "./context";

export const CUSTOMER_TYPES = {
  particulier: "Particulier",
  entreprise: "Entreprise",
  copropriete: "Syndicat de copropriété",
  autre: "Autre",
} as const;

export interface Customer {
  id: string;
  org_id: string;
  type: keyof typeof CUSTOMER_TYPES;
  civility: string;
  first_name: string;
  last_name: string;
  company_name: string;
  billing_line1: string;
  billing_line2: string;
  billing_postal_code: string;
  billing_city: string;
  billing_country: string;
  site_same_as_billing: boolean;
  site_line1: string;
  site_line2: string;
  site_postal_code: string;
  site_city: string;
  email: string;
  phone: string;
  siren: string;
  vat_number: string;
  notes: string;
  tags: string[];
  contact_preference: string;
  archived_at: Date | null;
  created_at: Date;
  updated_at: Date;
  last_activity_at: Date;
}

const t = (max = 200) => z.string().trim().max(max).optional().default("");

export const customerSchema = z.object({
  type: z.enum(["particulier", "entreprise", "copropriete", "autre"]).default("particulier"),
  civility: t(20),
  first_name: t(100),
  last_name: t(100),
  company_name: t(200),
  billing_line1: t(),
  billing_line2: t(),
  billing_postal_code: t(10),
  billing_city: t(120),
  billing_country: t(60).transform((v) => v || "France"),
  site_same_as_billing: z.boolean().default(true),
  site_line1: t(),
  site_line2: t(),
  site_postal_code: t(10),
  site_city: t(120),
  email: t(254),
  phone: t(30),
  siren: t(20),
  vat_number: t(20),
  notes: t(5000),
  tags: z.array(z.string().trim().min(1).max(40)).max(20).default([]),
  contact_preference: z.enum(["email", "telephone", "courrier"]).default("email"),
});

export type CustomerInput = z.input<typeof customerSchema>;

export function customerDisplayName(c: Pick<Customer, "type" | "company_name" | "first_name" | "last_name" | "civility">): string {
  if (c.type !== "particulier" && c.company_name) return c.company_name;
  const person = [c.civility, c.first_name, c.last_name].filter(Boolean).join(" ");
  return person || c.company_name || "Client sans nom";
}

function validate(input: z.infer<typeof customerSchema>) {
  const errors: Record<string, string> = {};
  if (input.type === "particulier" && !input.last_name && !input.first_name) errors.last_name = "Nom ou prénom requis";
  if (input.type !== "particulier" && !input.company_name) errors.company_name = "Dénomination requise";
  const e = validateEmail(input.email);
  if (e) errors.email = e;
  const p = validatePostalCode(input.billing_postal_code);
  if (p) errors.billing_postal_code = p;
  if (!input.site_same_as_billing) {
    const sp = validatePostalCode(input.site_postal_code);
    if (sp) errors.site_postal_code = sp;
  }
  const s = validateSiren(input.siren);
  if (s) errors.siren = s;
  const v = validateVatNumber(input.vat_number, input.siren);
  if (v) errors.vat_number = v;
  return errors;
}

function parseInput(raw: unknown) {
  const parsed = customerSchema.safeParse(raw);
  if (!parsed.success) throw badRequest(parsed.error.issues[0].message, parsed.error.issues);
  const input = parsed.data;
  input.siren = cleanId(input.siren);
  input.vat_number = cleanId(input.vat_number);
  input.email = input.email.toLowerCase();
  const errors = validate(input);
  if (Object.keys(errors).length) throw badRequest("Certains champs sont invalides", errors);
  return input;
}

const normPhone = (p: string) => p.replace(/\D/g, "").replace(/^33/, "0");

/** Doublons probables : même e-mail, téléphone, SIREN ou même nom et code postal. */
export async function findDuplicates(ctx: Ctx, raw: Partial<CustomerInput>, excludeId?: string) {
  const email = (raw.email ?? "").trim().toLowerCase();
  const phone = normPhone(raw.phone ?? "");
  const siren = cleanId(raw.siren ?? "");
  const name = customerDisplayName({
    type: (raw.type ?? "particulier") as Customer["type"],
    company_name: raw.company_name ?? "",
    first_name: raw.first_name ?? "",
    last_name: raw.last_name ?? "",
    civility: "",
  }).toLowerCase();
  const rows = await ctx.db.query<Customer>(
    "SELECT * FROM customers WHERE org_id=$1 AND ($2::uuid IS NULL OR id <> $2) AND archived_at IS NULL",
    [ctx.orgId, excludeId ?? null],
  );
  const result: { customer: Customer; reason: string }[] = [];
  for (const c of rows) {
    let reason = "";
    if (email && c.email.toLowerCase() === email) reason = "même e-mail";
    else if (phone.length >= 9 && normPhone(c.phone) === phone) reason = "même téléphone";
    else if (siren && c.siren === siren) reason = "même SIREN";
    else if (
      name !== "client sans nom" &&
      customerDisplayName(c).toLowerCase() === name &&
      (!raw.billing_postal_code || c.billing_postal_code === raw.billing_postal_code)
    ) {
      reason = "même nom";
    }
    if (reason) result.push({ customer: c, reason });
  }
  return result;
}

const COLUMNS = [
  "type",
  "civility",
  "first_name",
  "last_name",
  "company_name",
  "billing_line1",
  "billing_line2",
  "billing_postal_code",
  "billing_city",
  "billing_country",
  "site_same_as_billing",
  "site_line1",
  "site_line2",
  "site_postal_code",
  "site_city",
  "email",
  "phone",
  "siren",
  "vat_number",
  "notes",
  "tags",
  "contact_preference",
] as const;

async function insertCustomer(q: Queryable, orgId: string, input: z.infer<typeof customerSchema>): Promise<string> {
  const values = COLUMNS.map((c) => input[c]);
  const placeholders = COLUMNS.map((_, i) => `$${i + 2}`).join(",");
  const row = await one<{ id: string }>(
    q,
    `INSERT INTO customers (org_id, ${COLUMNS.join(",")}) VALUES ($1, ${placeholders}) RETURNING id`,
    [orgId, ...values],
  );
  return row!.id;
}

export async function createCustomer(ctx: Ctx, raw: unknown, opts: { allowDuplicate?: boolean } = {}) {
  requireWritable(ctx);
  const input = parseInput(raw);
  if (!opts.allowDuplicate) {
    const dups = await findDuplicates(ctx, input);
    if (dups.length) {
      return {
        id: null,
        duplicates: dups.map((d) => ({ id: d.customer.id, name: customerDisplayName(d.customer), reason: d.reason })),
      };
    }
  }
  const id = await ctx.db.transaction(async (tx) => {
    const id = await insertCustomer(tx, ctx.orgId, input);
    await enqueueWebhook(tx, ctx.orgId, "customer.created", {
      customer_id: id,
      type: input.type,
      name: customerDisplayName(input as unknown as Customer),
      email: input.email,
      phone: input.phone,
      city: input.billing_city,
    });
    return id;
  });
  await audit(ctx.db, { orgId: ctx.orgId, userId: ctx.userId, action: "customer.create", target: id });
  return { id, duplicates: [] };
}

export async function updateCustomer(ctx: Ctx, id: string, raw: unknown) {
  requireWritable(ctx);
  await getCustomer(ctx, id);
  const input = parseInput(raw);
  const sets = COLUMNS.map((c, i) => `${c}=$${i + 3}`).join(", ");
  // Les devis émis conservent leur propre copie des coordonnées : cette modification ne les touche pas.
  await ctx.db.query(`UPDATE customers SET ${sets}, updated_at=now() WHERE id=$1 AND org_id=$2`, [
    id,
    ctx.orgId,
    ...COLUMNS.map((c) => input[c]),
  ]);
  await audit(ctx.db, { orgId: ctx.orgId, userId: ctx.userId, action: "customer.update", target: id });
}

export async function setCustomerArchived(ctx: Ctx, id: string, archived: boolean) {
  requireWritable(ctx);
  await getCustomer(ctx, id);
  await ctx.db.query(
    `UPDATE customers SET archived_at = ${archived ? "now()" : "NULL"}, updated_at=now() WHERE id=$1 AND org_id=$2`,
    [id, ctx.orgId],
  );
}

export async function getCustomer(ctx: Ctx, id: string): Promise<Customer> {
  const c = await one<Customer>(ctx.db, "SELECT * FROM customers WHERE id=$1 AND org_id=$2", [id, ctx.orgId]);
  if (!c) throw notFound("Client introuvable");
  return c;
}

export async function searchCustomers(
  ctx: Ctx,
  opts: { q?: string; archived?: boolean; tag?: string; limit?: number; offset?: number } = {},
) {
  const params: unknown[] = [ctx.orgId];
  const where = ["org_id=$1", opts.archived ? "archived_at IS NOT NULL" : "archived_at IS NULL"];
  if (opts.q?.trim()) {
    params.push(`%${opts.q.trim().toLowerCase()}%`);
    const p = `$${params.length}`;
    where.push(
      `(lower(first_name || ' ' || last_name) LIKE ${p} OR lower(last_name || ' ' || first_name) LIKE ${p} OR lower(company_name) LIKE ${p} OR lower(email) LIKE ${p} OR phone LIKE ${p} OR lower(billing_city) LIKE ${p} OR siren LIKE ${p})`,
    );
  }
  if (opts.tag) {
    params.push(opts.tag);
    where.push(`$${params.length} = ANY(tags)`);
  }
  params.push(Math.min(opts.limit ?? 50, 500), opts.offset ?? 0);
  return ctx.db.query<Customer & { quote_count: unknown }>(
    `SELECT c.*, (SELECT count(*) FROM quotes q WHERE q.customer_id = c.id) AS quote_count
     FROM customers c WHERE ${where.join(" AND ")} ORDER BY last_activity_at DESC
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params,
  );
}

export async function listTags(ctx: Ctx): Promise<string[]> {
  const rows = await ctx.db.query<{ tag: string }>(
    "SELECT DISTINCT unnest(tags) AS tag FROM customers WHERE org_id=$1 ORDER BY 1",
    [ctx.orgId],
  );
  return rows.map((r) => r.tag);
}

export async function customersCsv(ctx: Ctx): Promise<string> {
  const rows = await ctx.db.query<Customer>("SELECT * FROM customers WHERE org_id=$1 ORDER BY created_at", [ctx.orgId]);
  return toCsv(
    [...COLUMNS],
    rows.map((r) => COLUMNS.map((c) => (c === "tags" ? r.tags.join("|") : c === "site_same_as_billing" ? (r[c] ? "oui" : "non") : String(r[c] ?? "")))),
  );
}

export interface ImportPreviewRow {
  line: number;
  data: z.infer<typeof customerSchema> | null;
  errors: string[];
  duplicateOf: string | null;
}

const HEADER_ALIASES: Record<string, (typeof COLUMNS)[number]> = {
  nom: "last_name",
  prenom: "first_name",
  prénom: "first_name",
  societe: "company_name",
  société: "company_name",
  entreprise: "company_name",
  adresse: "billing_line1",
  "code postal": "billing_postal_code",
  cp: "billing_postal_code",
  ville: "billing_city",
  pays: "billing_country",
  telephone: "phone",
  téléphone: "phone",
  tel: "phone",
  mail: "email",
  "e-mail": "email",
  courriel: "email",
  notes: "notes",
  etiquettes: "tags",
  étiquettes: "tags",
};

/** Analyse un CSV et renvoie un aperçu ligne par ligne, sans rien enregistrer. */
export async function previewCustomerImport(ctx: Ctx, csv: string): Promise<ImportPreviewRow[]> {
  const table = parseCsv(csv);
  if (table.length < 2) throw badRequest("Le fichier doit contenir une ligne d'en-tête et au moins une ligne");
  const header = table[0].map((h) => {
    const k = h.trim().toLowerCase();
    return (COLUMNS as readonly string[]).includes(k) ? (k as (typeof COLUMNS)[number]) : HEADER_ALIASES[k];
  });
  if (!header.some(Boolean)) throw badRequest("Aucune colonne reconnue dans l'en-tête");
  if (table.length > 5001) throw badRequest("5 000 lignes maximum par import");
  const existing = await ctx.db.query<Customer>("SELECT * FROM customers WHERE org_id=$1", [ctx.orgId]);
  const seenEmails = new Set(existing.map((c) => c.email.toLowerCase()).filter(Boolean));
  const out: ImportPreviewRow[] = [];
  for (let i = 1; i < table.length; i++) {
    const cells = table[i];
    if (cells.every((c) => !c.trim())) continue;
    const obj: Record<string, unknown> = {};
    header.forEach((col, j) => {
      if (!col) return;
      const v = (cells[j] ?? "").trim();
      if (col === "tags") obj.tags = v ? v.split(/[|;]/).map((s) => s.trim()).filter(Boolean) : [];
      else if (col === "site_same_as_billing") obj.site_same_as_billing = !/^(non|false|0)$/i.test(v);
      else if (col === "type") obj.type = v || "particulier";
      else if (col === "contact_preference") obj.contact_preference = v || "email";
      else obj[col] = v;
    });
    if (!obj.type) obj.type = obj.company_name && !obj.last_name ? "entreprise" : "particulier";
    const parsed = customerSchema.safeParse(obj);
    if (!parsed.success) {
      out.push({ line: i + 1, data: null, errors: parsed.error.issues.map((x) => `${x.path.join(".")} : ${x.message}`), duplicateOf: null });
      continue;
    }
    const data = parsed.data;
    data.siren = cleanId(data.siren);
    data.vat_number = cleanId(data.vat_number);
    data.email = data.email.toLowerCase();
    const errors = Object.values(validate(data));
    let duplicateOf: string | null = null;
    if (data.email && seenEmails.has(data.email)) duplicateOf = data.email;
    if (data.email) seenEmails.add(data.email);
    out.push({ line: i + 1, data, errors, duplicateOf });
  }
  return out;
}

export async function commitCustomerImport(ctx: Ctx, csv: string, opts: { skipDuplicates: boolean }) {
  requireWritable(ctx);
  const preview = await previewCustomerImport(ctx, csv);
  const valid = preview.filter((r) => r.data && r.errors.length === 0 && !(opts.skipDuplicates && r.duplicateOf));
  await ctx.db.transaction(async (tx) => {
    for (const r of valid) await insertCustomer(tx, ctx.orgId, r.data!);
    await audit(tx, { orgId: ctx.orgId, userId: ctx.userId, action: "customer.import", data: { count: valid.length } });
  });
  return { imported: valid.length, skipped: preview.length - valid.length };
}
