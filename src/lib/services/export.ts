/** Export des données du compte (portabilité, RGPD). */

import { toCsv } from "@/lib/csv";
import { zip, type ZipEntry } from "@/lib/zip";
import type { Ctx } from "./context";
import { audit, can, requirePermission } from "./context";
import { isSealed, open } from "@/lib/secret-box";
import { revealBank } from "./organization";

export async function exportAccountData(ctx: Ctx) {
  const user = await ctx.db.query(
    "SELECT id, email, name, locale, timezone, email_verified_at, terms_version, terms_accepted_at, created_at FROM users WHERE id=$1",
    [ctx.userId],
  );
  const base = { exportedAt: new Date().toISOString(), format: "pilot-makers-export-v1", user: user[0] };
  if (!can(ctx, "settings")) {
    await audit(ctx.db, { orgId: ctx.orgId, userId: ctx.userId, action: "account.export", data: { scope: "user" }, ip: ctx.ip });
    return base;
  }
  const q = (sql: string) => ctx.db.query(sql, [ctx.orgId]);
  const data = {
    ...base,
    organization: revealBank((await q("SELECT * FROM organizations WHERE id=$1"))[0]),
    organizationHistory: await q("SELECT changes, created_at FROM organization_history WHERE org_id=$1 ORDER BY created_at"),
    members: await q("SELECT u.email, u.name, m.role, m.created_at FROM memberships m JOIN users u ON u.id=m.user_id WHERE m.org_id=$1"),
    customers: await q("SELECT * FROM customers WHERE org_id=$1 ORDER BY created_at"),
    leads: await q("SELECT * FROM leads WHERE org_id=$1 ORDER BY created_at"),
    catalog: await q("SELECT * FROM catalog_items WHERE org_id=$1 ORDER BY reference"),
    catalogPriceHistory: await q(
      "SELECT item_id, old_price4, new_price4, old_cost4, new_cost4, created_at FROM catalog_price_history WHERE org_id=$1",
    ),
    quotes: await q("SELECT * FROM quotes WHERE org_id=$1 ORDER BY created_at"),
    quoteSections: await q("SELECT * FROM quote_sections WHERE org_id=$1 ORDER BY quote_id, position"),
    quoteLines: await q("SELECT * FROM quote_lines WHERE org_id=$1 ORDER BY quote_id, position"),
    quoteVersions: await q(
      "SELECT quote_id, version, number, snapshot, pdf_sha256, snapshot_sha256, total_ht_cents, total_ttc_cents, issued_at FROM quote_versions WHERE org_id=$1 ORDER BY issued_at",
    ),
    documentEvents: await q("SELECT quote_id, version, type, actor_type, data, created_at FROM document_events WHERE org_id=$1 ORDER BY created_at"),
    emails: await q("SELECT kind, to_address, subject, status, error, created_at FROM emails WHERE org_id=$1 ORDER BY created_at"),
    subscription: (await q("SELECT plan_code, status, billing_interval, current_period_end, trial_end FROM subscriptions WHERE org_id=$1"))[0],
    subscriptionInvoices: await q(
      "SELECT number, plan_code, amount_ht_cents, amount_ttc_cents, status, created_at FROM billing_invoices WHERE org_id=$1",
    ),
    customerInvoices: await q(
      `SELECT id, quote_id, customer_id, kind, number, credited_invoice_id, title, issue_date, due_date, schedule, snapshot, pdf_sha256, snapshot_sha256,
         total_ht_cents, total_vat_cents, total_ttc_cents, amount_due_cents, paid_cents, credited_cents, issued_at FROM invoices WHERE org_id=$1 ORDER BY issued_at`,
    ),
    payments: await q(
      "SELECT invoice_id, amount_cents, paid_on, method, reference, canceled_at, created_at FROM invoice_payments WHERE org_id=$1 ORDER BY paid_on",
    ),
    quoteTemplates: await q("SELECT name, description, data, created_at FROM quote_templates WHERE org_id=$1"),
    catalogComponents: await q("SELECT parent_id, child_id, position, quantity FROM catalog_components WHERE org_id=$1"),
    priceIndexes: await q("SELECT code, month, value_centi, updated_at FROM price_indexes WHERE org_id=$1 ORDER BY code, month"),
    jobs: (await q("SELECT * FROM jobs WHERE org_id=$1 ORDER BY created_at")).map((j) => {
      const codes = String(j.access_codes ?? "");
      return { ...j, access_codes: codes && isSealed(codes) ? open(codes) : codes };
    }),
    jobTasks: await q("SELECT * FROM job_tasks WHERE org_id=$1 ORDER BY job_id, position"),
    jobJournal: await q(
      "SELECT id, job_id, author_id, note, photo_type, taken_at, latitude, longitude, created_at FROM job_journal WHERE org_id=$1 ORDER BY taken_at",
    ),
    jobReceptions: await q("SELECT id, job_id, decision, reception_date, snapshot, created_by, created_at FROM job_receptions WHERE org_id=$1"),
    jobReserves: await q("SELECT * FROM job_reserves WHERE org_id=$1 ORDER BY job_id, position"),
    vehicles: await q("SELECT id, name, plate, created_at FROM org_vehicles WHERE org_id=$1 ORDER BY name"),
    assignments: await q("SELECT * FROM job_assignments WHERE org_id=$1 ORDER BY start_date"),
    timeEntries: await q("SELECT * FROM time_entries WHERE org_id=$1 ORDER BY work_date, created_at"),
    jobPurchases: await q("SELECT * FROM job_purchases WHERE org_id=$1 ORDER BY purchase_date"),
    purchaseOrders: await q("SELECT * FROM purchase_orders WHERE org_id=$1 ORDER BY created_at"),
    purchaseOrderLines: await q("SELECT * FROM purchase_order_lines WHERE org_id=$1 ORDER BY order_id, position"),
    subcontractors: await q("SELECT * FROM subcontractors WHERE org_id=$1 ORDER BY name"),
    subcontractorDocuments: await q(
      "SELECT id, subcontractor_id, kind, label, valid_until, file_name, file_type, file_sha256, uploaded_at FROM subcontractor_documents WHERE org_id=$1",
    ),
    jobSubcontractors: await q("SELECT * FROM job_subcontractors WHERE org_id=$1"),
    expenses: await q(
      `SELECT id, user_id, job_id, expense_date, merchant, category, amount_ttc_cents, vat_cents, payment, note, photo_type, photo_sha256, status,
         review_note, reviewed_by, reviewed_at, reimbursed_at, created_at FROM expenses WHERE org_id=$1 ORDER BY expense_date`,
    ),
    subcontractorQuotes: await q(
      `SELECT id, subcontractor_id, quote_id, title, description, status, expires_at, amount_ht_cents, delay, answer_note, answered_by, file_name,
         file_type, file_sha256, margin_bp, line_id, answered_at, decided_at, created_at FROM subcontractor_quotes WHERE org_id=$1 ORDER BY created_at`,
    ),
    quoteMessages: await q("SELECT * FROM quote_messages WHERE org_id=$1 ORDER BY created_at"),
    // Les liens d'espace client ne sont exportés que par leurs métadonnées, jamais par leur jeton.
    portalLinks: await q("SELECT id, customer_id, expires_at, revoked_at, last_used_at, created_at FROM customer_portal_links WHERE org_id=$1"),
    // Les secrets de signature ne sont jamais exportés.
    webhookEndpoints: await q("SELECT id, url, events, active, created_at FROM webhook_endpoints WHERE org_id=$1"),
  };
  await audit(ctx.db, { orgId: ctx.orgId, userId: ctx.userId, action: "account.export", data: { scope: "organization" }, ip: ctx.ip });
  // Les entiers 64 bits sont convertis pour rester sérialisables.
  return JSON.parse(JSON.stringify(data, (_k, v) => (typeof v === "bigint" ? Number(v) : v instanceof Uint8Array ? undefined : v)));
}

/** Valeur lisible dans un tableur : dates ISO, listes séparées par « | », objets en JSON. */
function cell(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (v instanceof Date) return v.toISOString();
  if (Array.isArray(v) && v.every((x) => typeof x !== "object")) return v.join("|");
  if (typeof v === "object") return JSON.stringify(v);
  if (typeof v === "boolean") return v ? "oui" : "non";
  return String(v);
}

export function tableCsv(rows: Record<string, unknown>[]): string {
  if (!rows.length) return toCsv(["aucune_donnee"], []);
  const header = Object.keys(rows[0]);
  return toCsv(
    header,
    rows.map((r) => header.map((k) => cell(r[k]))),
  );
}

function fileName(s: string): string {
  return (
    s
      .normalize("NFC")
      .replace(/[^\p{L}\p{N}._-]+/gu, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80) || "sans-nom"
  );
}

const CSV_TABLES: [string, string][] = [
  ["clients", "customers"],
  ["demandes", "leads"],
  ["catalogue", "catalog"],
  ["devis", "quotes"],
  ["lots-devis", "quoteSections"],
  ["lignes-devis", "quoteLines"],
  ["factures", "customerInvoices"],
  ["paiements", "payments"],
  ["chantiers", "jobs"],
  ["taches-chantier", "jobTasks"],
  ["journal-chantier", "jobJournal"],
  ["reserves", "jobReserves"],
  ["planning", "assignments"],
  ["vehicules", "vehicles"],
  ["indices-prix", "priceIndexes"],
  ["pointages", "timeEntries"],
  ["achats-chantier", "jobPurchases"],
  ["commandes-fournisseurs", "purchaseOrders"],
  ["lignes-commandes", "purchaseOrderLines"],
  ["sous-traitants", "subcontractors"],
  ["documents-sous-traitants", "subcontractorDocuments"],
  ["sous-traitants-chantiers", "jobSubcontractors"],
  ["notes-de-frais", "expenses"],
  ["devis-sous-traitants", "subcontractorQuotes"],
  ["echanges-clients", "quoteMessages"],
  ["liens-espace-client", "portalLinks"],
];

const README = `Export complet Pilot-Makers

Ce dossier contient l'ensemble des données de l'entreprise dans des formats ouverts, lisibles sans Pilot-Makers :

- donnees.json : toutes les données structurées (format JSON, encodage UTF-8).
- tableaux/*.csv : une table par fichier, séparateur point-virgule, encodage UTF-8, ouvrable dans Excel ou LibreOffice.
  Les montants en centimes se terminent par _cents, les quantités et prix en dix-millièmes par 4.
  Les listes sont séparées par « | », les données composées sont au format JSON.
- devis/ : chaque version émise de chaque devis, au format PDF, telle qu'envoyée au client.
- factures/ : chaque facture et avoir émis, au format PDF, avec son empreinte d'intégrité dans donnees.json.
- receptions/ : les procès-verbaux de réception de chantier signés, au format PDF.
- photos/ : les photos du journal de chantier, rangées par chantier.
- sous-traitants/ : les attestations, assurances et contrats des sous-traitants.

Les secrets techniques (mots de passe, clés de double authentification, secrets des webhooks) ne sont jamais exportés.
`;

/** Archive ZIP complète (réversibilité) : JSON, tableaux CSV, PDF émis et photos. Réservée aux administrateurs. */
export async function exportArchive(ctx: Ctx): Promise<Buffer> {
  requirePermission(ctx, "settings");
  const data = (await exportAccountData(ctx)) as Record<string, unknown>;
  const date = new Date();
  const entries: ZipEntry[] = [
    { name: "LISEZMOI.txt", data: README, date },
    { name: "donnees.json", data: JSON.stringify(data, null, 2), date },
  ];
  for (const [file, key] of CSV_TABLES) {
    entries.push({ name: `tableaux/${file}.csv`, data: tableCsv((data[key] as Record<string, unknown>[]) ?? []), date });
  }
  const q = <T extends object>(sql: string) => ctx.db.query<T>(sql, [ctx.orgId]);
  const names = new Set<string>();
  const unique = (name: string) => {
    let n = name;
    for (let i = 2; names.has(n); i++) n = name.replace(/(\.[a-z]+)$/, `-${i}$1`);
    names.add(n);
    return n;
  };
  for (const v of await q<{ number: string; version: number; pdf: Uint8Array; issued_at: Date }>(
    "SELECT number, version, pdf, issued_at FROM quote_versions WHERE org_id=$1 ORDER BY issued_at",
  )) {
    entries.push({ name: unique(`devis/${fileName(v.number)}-v${v.version}.pdf`), data: v.pdf, date: new Date(v.issued_at) });
  }
  for (const f of await q<{ number: string; pdf: Uint8Array; issued_at: Date }>(
    "SELECT number, pdf, issued_at FROM invoices WHERE org_id=$1 ORDER BY issued_at",
  )) {
    entries.push({ name: unique(`factures/${fileName(f.number)}.pdf`), data: f.pdf, date: new Date(f.issued_at) });
  }
  for (const r of await q<{ title: string; reception_date: string | Date; pdf: Uint8Array; created_at: Date }>(
    "SELECT j.title, r.reception_date, r.pdf, r.created_at FROM job_receptions r JOIN jobs j ON j.id=r.job_id WHERE r.org_id=$1",
  )) {
    entries.push({ name: unique(`receptions/${fileName(r.title)}.pdf`), data: r.pdf, date: new Date(r.created_at) });
  }
  for (const p of await q<{ id: string; title: string; photo: Uint8Array; photo_type: string; taken_at: Date }>(
    `SELECT jj.id, j.title, jj.photo, jj.photo_type, jj.taken_at FROM job_journal jj JOIN jobs j ON j.id=jj.job_id
     WHERE jj.org_id=$1 AND jj.photo IS NOT NULL ORDER BY jj.taken_at`,
  )) {
    const ext = p.photo_type === "image/png" ? "png" : p.photo_type === "image/webp" ? "webp" : "jpg";
    const taken = new Date(p.taken_at);
    entries.push({
      name: unique(`photos/${fileName(p.title)}/${taken.toISOString().slice(0, 10)}-${p.id.slice(0, 8)}.${ext}`),
      data: p.photo,
      date: taken,
    });
  }
  for (const d of await q<{ id: string; name: string; kind: string; file: Uint8Array; file_type: string; uploaded_at: Date }>(
    `SELECT d.id, s.name, d.kind, d.file, d.file_type, d.uploaded_at FROM subcontractor_documents d JOIN subcontractors s ON s.id=d.subcontractor_id
     WHERE d.org_id=$1 AND d.file IS NOT NULL ORDER BY d.uploaded_at`,
  )) {
    const ext = d.file_type === "image/png" ? "png" : d.file_type === "image/jpeg" ? "jpg" : "pdf";
    const at = new Date(d.uploaded_at);
    entries.push({ name: unique(`sous-traitants/${fileName(d.name)}/${d.kind}-${at.toISOString().slice(0, 10)}.${ext}`), data: d.file, date: at });
  }
  return zip(entries);
}
