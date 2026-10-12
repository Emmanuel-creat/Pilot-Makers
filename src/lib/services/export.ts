/** Export des données du compte (portabilité, RGPD). */

import type { Ctx } from "./context";
import { audit } from "./context";

export async function exportAccountData(ctx: Ctx) {
  const user = await ctx.db.query(
    "SELECT id, email, name, locale, timezone, email_verified_at, terms_version, terms_accepted_at, created_at FROM users WHERE id=$1",
    [ctx.userId],
  );
  const base = { exportedAt: new Date().toISOString(), format: "pilot-makers-export-v1", user: user[0] };
  if (ctx.role === "member") {
    await audit(ctx.db, { orgId: ctx.orgId, userId: ctx.userId, action: "account.export", data: { scope: "user" }, ip: ctx.ip });
    return base;
  }
  const q = (sql: string) => ctx.db.query(sql, [ctx.orgId]);
  const data = {
    ...base,
    organization: (await q("SELECT * FROM organizations WHERE id=$1"))[0],
    organizationHistory: await q("SELECT changes, created_at FROM organization_history WHERE org_id=$1 ORDER BY created_at"),
    members: await q("SELECT u.email, u.name, m.role, m.created_at FROM memberships m JOIN users u ON u.id=m.user_id WHERE m.org_id=$1"),
    customers: await q("SELECT * FROM customers WHERE org_id=$1 ORDER BY created_at"),
    catalog: await q("SELECT * FROM catalog_items WHERE org_id=$1 ORDER BY reference"),
    catalogPriceHistory: await q("SELECT item_id, old_price4, new_price4, old_cost4, new_cost4, created_at FROM catalog_price_history WHERE org_id=$1"),
    quotes: await q("SELECT * FROM quotes WHERE org_id=$1 ORDER BY created_at"),
    quoteSections: await q("SELECT * FROM quote_sections WHERE org_id=$1 ORDER BY quote_id, position"),
    quoteLines: await q("SELECT * FROM quote_lines WHERE org_id=$1 ORDER BY quote_id, position"),
    quoteVersions: await q(
      "SELECT quote_id, version, number, snapshot, pdf_sha256, snapshot_sha256, total_ht_cents, total_ttc_cents, issued_at FROM quote_versions WHERE org_id=$1 ORDER BY issued_at",
    ),
    documentEvents: await q("SELECT quote_id, version, type, actor_type, data, created_at FROM document_events WHERE org_id=$1 ORDER BY created_at"),
    emails: await q("SELECT kind, to_address, subject, status, error, created_at FROM emails WHERE org_id=$1 ORDER BY created_at"),
    subscription: (await q("SELECT plan_code, status, billing_interval, current_period_end, trial_end FROM subscriptions WHERE org_id=$1"))[0],
    invoices: await q("SELECT number, plan_code, amount_ht_cents, amount_ttc_cents, status, created_at FROM billing_invoices WHERE org_id=$1"),
  };
  await audit(ctx.db, { orgId: ctx.orgId, userId: ctx.userId, action: "account.export", data: { scope: "organization" }, ip: ctx.ip });
  // Les entiers 64 bits sont convertis pour rester sérialisables.
  return JSON.parse(JSON.stringify(data, (_k, v) => (typeof v === "bigint" ? Number(v) : v instanceof Uint8Array ? undefined : v)));
}
