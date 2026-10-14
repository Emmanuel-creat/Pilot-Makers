/**
 * Commandes groupées : les commandes en brouillon de plusieurs chantiers chez un même fournisseur
 * réunies en un seul bon, livré en une fois ; à l'envoi, chaque commande du groupe passe à « Envoyée »
 * et se réceptionne ensuite sur son chantier.
 */

import { z } from "zod";
import { num, one, type Queryable } from "@/lib/db";
import { badRequest, conflict, isUuid, notFound } from "@/lib/http";
import { mergeLines, milliText, supplierKey, type GroupSource } from "@/lib/order-groups";
import { BLACK, fr, GREY, LEFT, Page, WIDTH } from "@/lib/pdf/reception-pdf";
import { sanitize } from "@/lib/pdf/quote-pdf";
import { PDFDocument, StandardFonts } from "pdf-lib";
import type { Ctx } from "./context";
import { audit, requirePermission, requireWritable } from "./context";
import { parisDate } from "./quotes";

const day = (v: unknown) => (v ? (v instanceof Date ? v.toISOString().slice(0, 10) : String(v).slice(0, 10)) : null);

export interface DraftOrder {
  id: string;
  number: string;
  supplier: string;
  jobId: string;
  jobTitle: string;
  deliveryAddress: string;
  lines: number;
  totalCents: number;
}

/** Brouillons non groupés, par fournisseur ; seuls les fournisseurs avec au moins deux commandes à envoyer sont proposés. */
export async function draftsBySupplier(ctx: Ctx) {
  requirePermission(ctx, "costs");
  const rows = await ctx.db.query<Record<string, unknown>>(
    `SELECT o.id, o.number, o.supplier, o.job_id, o.delivery_address, j.title,
       (SELECT count(*) FROM purchase_order_lines l WHERE l.order_id=o.id) AS lines,
       coalesce((SELECT sum(round(l.quantity_milli * l.unit_cost_cents / 1000.0)) FROM purchase_order_lines l WHERE l.order_id=o.id), 0) AS total
     FROM purchase_orders o JOIN jobs j ON j.id=o.job_id
     WHERE o.org_id=$1 AND o.status='brouillon' AND o.group_id IS NULL AND o.supplier <> ''
     ORDER BY lower(o.supplier), o.created_at`,
    [ctx.orgId],
  );
  const groups = new Map<string, { supplier: string; orders: DraftOrder[] }>();
  for (const r of rows) {
    const o: DraftOrder = {
      id: String(r.id),
      number: String(r.number),
      supplier: String(r.supplier),
      jobId: String(r.job_id),
      jobTitle: String(r.title),
      deliveryAddress: String(r.delivery_address),
      lines: num(r.lines),
      totalCents: num(r.total),
    };
    const k = supplierKey(o.supplier);
    const g = groups.get(k) ?? { supplier: o.supplier, orders: [] };
    g.orders.push(o);
    groups.set(k, g);
  }
  return [...groups.values()].filter((g) => g.orders.filter((o) => o.lines > 0).length >= 2);
}

async function nextNumber(q: Queryable, orgId: string) {
  await q.query("SELECT id FROM organizations WHERE id=$1 FOR UPDATE", [orgId]);
  const year = parisDate(new Date()).slice(0, 4);
  const r = await one<{ n: unknown }>(q, "SELECT count(*) AS n FROM purchase_order_groups WHERE org_id=$1 AND number LIKE $2", [orgId, `CG-${year}-%`]);
  return `CG-${year}-${String(num(r?.n) + 1).padStart(4, "0")}`;
}

const schema = z.object({
  orderIds: z.array(z.string()).min(2, "Choisissez au moins deux commandes").max(30),
  deliveryAddress: z.string().trim().min(5, "Indiquez l'adresse de livraison").max(300),
  deliveryDate: z.union([z.literal(""), z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date invalide")]).default(""),
  notes: z.string().trim().max(2000).default(""),
});

export async function createGroup(ctx: Ctx, raw: unknown) {
  requireWritable(ctx);
  requirePermission(ctx, "costs");
  const p = schema.safeParse(raw);
  if (!p.success) throw badRequest(p.error.issues[0].message);
  const v = p.data;
  const ids = [...new Set(v.orderIds)];
  if (ids.length < 2 || !ids.every(isUuid)) throw badRequest("Choisissez au moins deux commandes");
  return ctx.db.transaction(async (tx) => {
    const orders = await tx.query<{ id: string; supplier: string; status: string; group_id: string | null; lines: string }>(
      `SELECT o.id, o.supplier, o.status, o.group_id, (SELECT count(*) FROM purchase_order_lines l WHERE l.order_id=o.id) AS lines
       FROM purchase_orders o WHERE o.org_id=$1 AND o.id = ANY($2::uuid[]) FOR UPDATE`,
      [ctx.orgId, ids],
    );
    if (orders.length !== ids.length) throw notFound("Commande introuvable");
    if (orders.some((o) => o.status !== "brouillon" || o.group_id)) throw conflict("Seules les commandes en brouillon, pas encore groupées, se regroupent");
    if (new Set(orders.map((o) => supplierKey(o.supplier))).size !== 1) throw badRequest("Les commandes doivent être chez le même fournisseur");
    if (orders.some((o) => !Number(o.lines))) throw badRequest("Une des commandes ne contient aucune ligne");
    const number = await nextNumber(tx, ctx.orgId);
    const g = await one<{ id: string }>(
      tx,
      `INSERT INTO purchase_order_groups (org_id, number, supplier, delivery_address, delivery_date, notes, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
      [ctx.orgId, number, orders[0].supplier, v.deliveryAddress, v.deliveryDate || null, v.notes, ctx.userId],
    );
    await tx.query("UPDATE purchase_orders SET group_id=$2, delivery_address=$3, delivery_date=$4, updated_at=now() WHERE id = ANY($1::uuid[])", [
      ids,
      g!.id,
      v.deliveryAddress,
      v.deliveryDate || null,
    ]);
    await audit(tx, { orgId: ctx.orgId, userId: ctx.userId, action: "order.group", target: g!.id, data: { orders: ids.length }, ip: ctx.ip });
    return g!.id;
  });
}

export async function getGroup(ctx: Ctx, id: string) {
  requirePermission(ctx, "costs");
  if (!isUuid(id)) throw notFound("Commande groupée introuvable");
  const g = await one<Record<string, unknown>>(ctx.db, "SELECT * FROM purchase_order_groups WHERE id=$1 AND org_id=$2", [id, ctx.orgId]);
  if (!g) throw notFound("Commande groupée introuvable");
  const orders = await ctx.db.query<Record<string, unknown>>(
    `SELECT o.id, o.number, o.status, o.job_id, j.title FROM purchase_orders o JOIN jobs j ON j.id=o.job_id WHERE o.group_id=$1 ORDER BY o.created_at`,
    [id],
  );
  const lines = await ctx.db.query<Record<string, unknown>>(
    "SELECT order_id, label, reference, unit, quantity_milli, unit_cost_cents FROM purchase_order_lines WHERE order_id = ANY($1::uuid[]) ORDER BY position, id",
    [orders.map((o) => o.id)],
  );
  const sources: GroupSource[] = orders.map((o) => ({
    orderNumber: String(o.number),
    jobTitle: String(o.title),
    lines: lines
      .filter((l) => l.order_id === o.id)
      .map((l) => ({
        label: String(l.label),
        reference: String(l.reference),
        unit: String(l.unit),
        quantityMilli: num(l.quantity_milli),
        unitCostCents: num(l.unit_cost_cents),
      })),
  }));
  const merged = mergeLines(sources);
  return {
    group: {
      id,
      number: String(g.number),
      supplier: String(g.supplier),
      deliveryAddress: String(g.delivery_address),
      deliveryDate: day(g.delivery_date),
      notes: String(g.notes),
      sentAt: g.sent_at ? new Date(g.sent_at as string).toISOString() : null,
    },
    orders: orders.map((o) => ({ id: String(o.id), number: String(o.number), status: String(o.status), jobId: String(o.job_id), jobTitle: String(o.title) })),
    lines: merged,
    totalCents: merged.reduce((s, l) => s + l.totalCents, 0),
  };
}

export async function listGroups(ctx: Ctx) {
  requirePermission(ctx, "costs");
  const rows = await ctx.db.query<Record<string, unknown>>(
    `SELECT g.id, g.number, g.supplier, g.sent_at, g.created_at, (SELECT count(*) FROM purchase_orders o WHERE o.group_id=g.id) AS orders
     FROM purchase_order_groups g WHERE g.org_id=$1 ORDER BY g.created_at DESC LIMIT 50`,
    [ctx.orgId],
  );
  return rows.map((r) => ({
    id: String(r.id),
    number: String(r.number),
    supplier: String(r.supplier),
    orders: num(r.orders),
    sentAt: r.sent_at ? new Date(r.sent_at as string).toISOString() : null,
  }));
}

/** Envoi : toutes les commandes du groupe passent à « Envoyée » en même temps. */
export async function sendGroup(ctx: Ctx, id: string) {
  requireWritable(ctx);
  const { group, orders } = await getGroup(ctx, id);
  if (group.sentAt) throw conflict("Commande groupée déjà envoyée");
  if (orders.length < 2) throw badRequest("Une commande groupée réunit au moins deux commandes");
  await ctx.db.transaction(async (tx) => {
    await tx.query("UPDATE purchase_orders SET status='envoye', sent_at=now(), updated_at=now() WHERE group_id=$1 AND status='brouillon'", [id]);
    await tx.query("UPDATE purchase_order_groups SET sent_at=now() WHERE id=$1", [id]);
  });
  await audit(ctx.db, { orgId: ctx.orgId, userId: ctx.userId, action: "order.group_send", target: id, ip: ctx.ip });
}

/** Dégroupe avant l'envoi : chaque commande redevient un brouillon indépendant. */
export async function deleteGroup(ctx: Ctx, id: string) {
  requireWritable(ctx);
  const { group } = await getGroup(ctx, id);
  if (group.sentAt) throw conflict("Commande groupée déjà envoyée : elle ne se défait plus");
  await ctx.db.query("DELETE FROM purchase_order_groups WHERE id=$1 AND org_id=$2", [id, ctx.orgId]);
}

const euros = (cents: number) => (cents / 100).toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).replace(/ | /g, " ") + " EUR";

export async function groupPdf(ctx: Ctx, id: string): Promise<{ number: string; pdf: Uint8Array }> {
  const { group, orders, lines, totalCents } = await getGroup(ctx, id);
  const org = await one<{
    trade_name: string;
    legal_name: string;
    address_line1: string;
    postal_code: string;
    city: string;
    siret: string;
    email: string;
    phone: string;
  }>(ctx.db, "SELECT trade_name, legal_name, address_line1, postal_code, city, siret, email, phone FROM organizations WHERE id=$1", [ctx.orgId]);
  const doc = await PDFDocument.create();
  doc.setTitle(`Commande groupée ${group.number}`);
  doc.setProducer("Pilot-Makers");
  const p = new Page(doc, await doc.embedFont(StandardFonts.Helvetica), await doc.embedFont(StandardFonts.HelveticaBold));
  p.title(`Commande groupée ${group.number}`, `Émise le ${fr(parisDate(group.sentAt ? new Date(group.sentAt) : new Date()))}`);
  p.field(
    "Client (commanditaire)",
    [org?.trade_name || org?.legal_name, org?.address_line1, [org?.postal_code, org?.city].filter(Boolean).join(" ")].filter(Boolean).join(", "),
  );
  if (org?.siret) p.field("SIRET", org.siret);
  if (org?.phone || org?.email) p.field("Contact", [org?.phone, org?.email].filter(Boolean).join(", "));
  p.field("Fournisseur", group.supplier);
  p.field("Livraison", group.deliveryAddress);
  if (group.deliveryDate) p.field("Date souhaitée", fr(group.deliveryDate));
  p.field("Commandes réunies", orders.map((o) => `${o.number} (${o.jobTitle})`).join(", "));
  p.rule();
  const cols = [LEFT, LEFT + 70, LEFT + 290, LEFT + 345, LEFT + 420];
  p.ensure(20);
  p.y -= 14;
  ["Réf.", "Désignation", "Qté", "Prix unit. HT", "Total HT"].forEach((h, i) =>
    p.page.drawText(sanitize(h, p.bold), { x: cols[i], y: p.y, size: 9, font: p.bold, color: GREY }),
  );
  for (const l of lines) {
    p.ensure(30);
    p.y -= 16;
    const cells = [
      l.reference,
      l.label,
      `${milliText(l.quantityMilli)} ${l.unit}`,
      l.unitCostCents ? euros(l.unitCostCents) : "",
      l.unitCostCents ? euros(l.totalCents) : "",
    ];
    cells.forEach((c, i) => {
      let t = sanitize(c, p.regular);
      const max = (cols[i + 1] ?? LEFT + WIDTH) - cols[i] - 6;
      while (t && p.regular.widthOfTextAtSize(t, 9) > max) t = t.slice(0, -2) + ".";
      p.page.drawText(t, { x: cols[i], y: p.y, size: 9, font: p.regular, color: BLACK });
    });
    if (l.split.length > 1) p.line(`dont ${l.split.map((s) => `${milliText(s.quantityMilli)} pour ${s.jobTitle}`).join(", ")}`, 8, p.regular, GREY, cols[1]);
  }
  p.rule();
  if (totalCents) p.field("Total HT", euros(totalCents));
  if (group.notes) {
    p.heading("Remarques");
    p.line(group.notes, 10);
  }
  p.gap(16);
  p.line("Merci de rappeler le numéro de commande groupée sur le bon de livraison et la facture, avec la répartition par chantier.", 9, p.regular, GREY);
  return { number: group.number, pdf: await doc.save() };
}
