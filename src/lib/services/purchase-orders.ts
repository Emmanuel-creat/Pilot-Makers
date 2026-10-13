/**
 * Bons de commande fournisseurs.
 *
 * Préparés depuis le devis signé (fournitures et sous-traitance, regroupées par fournisseur du catalogue),
 * modifiables tant qu'ils sont en brouillon, puis envoyés. La réception se saisit ligne par ligne ;
 * la facture du fournisseur est rapprochée de la valeur reçue et devient un achat du chantier.
 */

import { z } from "zod";
import { DecimalError, formatScaled, parseScaled } from "@/lib/calc/decimal";
import { num, one, type Queryable } from "@/lib/db";
import { badRequest, conflict, isUuid, notFound } from "@/lib/http";
import { BLACK, fr, GREY, LEFT, Page, WIDTH } from "@/lib/pdf/reception-pdf";
import { sanitize } from "@/lib/pdf/quote-pdf";
import { PDFDocument, StandardFonts } from "pdf-lib";
import type { Ctx } from "./context";
import { audit, requirePermission, requireWritable } from "./context";
import { acceptedQuote } from "./invoices";
import { getJob } from "./jobs";
import { eurosToCents } from "./pricing";
import { parisDate } from "./quotes";

export const ORDER_STATUSES = {
  brouillon: "Brouillon",
  envoye: "Envoyée",
  recu_partiel: "Reçue en partie",
  recu: "Reçue",
  annule: "Annulée",
} as const;
export type OrderStatus = keyof typeof ORDER_STATUSES;

export interface OrderLine {
  id: string;
  task_id: string | null;
  position: number;
  label: string;
  reference: string;
  unit: string;
  quantity: string;
  received: string;
  quantity_milli: number;
  received_milli: number;
  unit_cost_cents: number;
  total_cents: number;
  received_cents: number;
}

export interface PurchaseOrder {
  id: string;
  job_id: string;
  number: string;
  supplier: string;
  supplier_email: string;
  status: OrderStatus;
  delivery_date: string | null;
  delivery_address: string;
  notes: string;
  sent_at: Date | null;
  created_at: Date;
}

const ORDERABLE = new Set(["materiau", "sous_traitance"]);
const amount = (milli: number, cents: number) => Math.round((milli * cents) / 1000);
const day = (v: unknown) => (v ? (v instanceof Date ? v.toISOString().slice(0, 10) : String(v).slice(0, 10)) : null);

function mapOrder(r: Record<string, unknown>): PurchaseOrder {
  return { ...(r as unknown as PurchaseOrder), delivery_date: day(r.delivery_date) };
}

function mapLine(r: Record<string, unknown>): OrderLine {
  const q = num(r.quantity_milli);
  const rec = num(r.received_milli);
  const c = num(r.unit_cost_cents);
  return {
    id: String(r.id),
    task_id: (r.task_id as string | null) ?? null,
    position: num(r.position),
    label: String(r.label),
    reference: String(r.reference),
    unit: String(r.unit),
    quantity: formatScaled(BigInt(q), 3),
    received: formatScaled(BigInt(rec), 3),
    quantity_milli: q,
    received_milli: rec,
    unit_cost_cents: c,
    total_cents: amount(q, c),
    received_cents: amount(Math.min(rec, q), c),
  };
}

function parseQuantity(input: string, label = "Quantité"): number {
  try {
    const v = Number(parseScaled(input || "0", 3));
    if (v < 0) throw new DecimalError("négative");
    return v;
  } catch {
    throw badRequest(`${label} invalide : ${input}`);
  }
}

function parseCost(input: string): number {
  if (!input.trim()) return 0;
  try {
    return Math.round(Number(parseScaled(input.replace(/[\s€]/g, ""), 4)) / 100);
  } catch {
    throw badRequest(`Prix invalide : ${input}`);
  }
}

async function nextNumber(q: Queryable, orgId: string): Promise<string> {
  await q.query("SELECT id FROM organizations WHERE id=$1 FOR UPDATE", [orgId]);
  const year = parisDate(new Date()).slice(0, 4);
  const r = await one<{ n: unknown }>(q, "SELECT count(*) AS n FROM purchase_orders WHERE org_id=$1 AND number LIKE $2", [orgId, `BC-${year}-%`]);
  return `BC-${year}-${String(num(r?.n) + 1).padStart(4, "0")}`;
}

async function loadOrder(q: Queryable, ctx: Ctx, id: string) {
  if (!isUuid(id)) throw notFound("Commande introuvable");
  const r = await one<Record<string, unknown>>(q, "SELECT * FROM purchase_orders WHERE id=$1 AND org_id=$2", [id, ctx.orgId]);
  if (!r) throw notFound("Commande introuvable");
  return mapOrder(r);
}

async function draftOrder(q: Queryable, ctx: Ctx, id: string) {
  const o = await loadOrder(q, ctx, id);
  if (o.status !== "brouillon") throw conflict("Commande déjà envoyée : elle ne se modifie plus");
  return o;
}

/* ------------------------------------------------------------------ */
/* Préparation depuis le devis                                          */
/* ------------------------------------------------------------------ */

/**
 * Prépare les commandes des fournitures et de la sous-traitance du devis signé qui ne sont pas encore
 * commandées, une commande par fournisseur du catalogue. Renvoie les commandes créées.
 */
export async function prepareOrders(ctx: Ctx, jobId: string): Promise<string[]> {
  requireWritable(ctx);
  requirePermission(ctx, "costs");
  const { job, tasks } = await getJob(ctx, jobId);
  if (!job.quote_id) throw badRequest("Ce chantier n'a pas de devis : créez une commande vide");
  return ctx.db.transaction(async (tx) => {
    const quote = await acceptedQuote(tx, ctx, job.quote_id!);
    const lines = quote.snapshot.sections.flatMap((s) => s.lines).filter((l) => l.kind === "item" && !l.optional);
    // Les tâches issues du devis sont créées dans l'ordre de ses lignes ; les tâches ajoutées à la main n'ont pas de nature.
    const quoteTasks = tasks.filter((t) => t.nature).sort((a, b) => a.position - b.position);
    const ordered = new Set(
      (
        await tx.query<{ task_id: string }>(
          `SELECT l.task_id FROM purchase_order_lines l JOIN purchase_orders o ON o.id=l.order_id
           WHERE o.job_id=$1 AND o.status <> 'annule' AND l.task_id IS NOT NULL`,
          [jobId],
        )
      ).map((r) => r.task_id),
    );
    const itemIds = lines.map((l) => l.catalogItemId).filter((x): x is string => !!x && isUuid(x));
    const suppliers = new Map(
      (
        await tx.query<{ id: string; supplier: string; reference: string }>(
          "SELECT id, supplier, reference FROM catalog_items WHERE org_id=$1 AND id = ANY($2::uuid[])",
          [ctx.orgId, itemIds],
        )
      ).map((r) => [r.id, r]),
    );
    const groups = new Map<string, { taskId: string | null; label: string; reference: string; unit: string; qty: number; cost: number }[]>();
    lines.forEach((l, i) => {
      if (!ORDERABLE.has(l.nature)) return;
      const task = quoteTasks[i] && quoteTasks[i].label === l.label ? quoteTasks[i] : null;
      if (task && ordered.has(task.id)) return;
      let qty: number;
      try {
        qty = Number(parseScaled(l.quantity || "0", 3));
      } catch {
        return;
      }
      if (qty <= 0) return;
      const item = l.catalogItemId ? suppliers.get(l.catalogItemId) : undefined;
      const supplier = item?.supplier?.trim() ?? "";
      const list = groups.get(supplier) ?? [];
      list.push({
        taskId: task?.id ?? null,
        label: l.label,
        reference: item?.reference ?? "",
        unit: l.unit || "u",
        qty,
        cost: parseCost(l.unitCost ?? ""),
      });
      groups.set(supplier, list);
    });
    if (!groups.size) throw conflict("Toutes les fournitures du devis sont déjà commandées");
    const address = [job.site_line1, job.site_line2, [job.site_postal_code, job.site_city].filter(Boolean).join(" ")].filter(Boolean).join(", ");
    const ids: string[] = [];
    for (const [supplier, list] of groups) {
      const number = await nextNumber(tx, ctx.orgId);
      const o = await one<{ id: string }>(
        tx,
        "INSERT INTO purchase_orders (org_id, job_id, number, supplier, delivery_address, created_by) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id",
        [ctx.orgId, jobId, number, supplier, address, ctx.userId],
      );
      let pos = 0;
      for (const l of list) {
        await tx.query(
          `INSERT INTO purchase_order_lines (org_id, order_id, task_id, position, label, reference, unit, quantity_milli, unit_cost_cents)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
          [ctx.orgId, o!.id, l.taskId, pos++, l.label, l.reference, l.unit, l.qty, l.cost],
        );
      }
      ids.push(o!.id);
    }
    await audit(tx, { orgId: ctx.orgId, userId: ctx.userId, action: "order.prepare", target: jobId, data: { count: ids.length }, ip: ctx.ip });
    return ids;
  });
}

export async function createOrder(ctx: Ctx, jobId: string, supplier = "") {
  requireWritable(ctx);
  requirePermission(ctx, "costs");
  const { job } = await getJob(ctx, jobId);
  return ctx.db.transaction(async (tx) => {
    const number = await nextNumber(tx, ctx.orgId);
    const address = [job.site_line1, job.site_line2, [job.site_postal_code, job.site_city].filter(Boolean).join(" ")].filter(Boolean).join(", ");
    const o = await one<{ id: string }>(
      tx,
      "INSERT INTO purchase_orders (org_id, job_id, number, supplier, delivery_address, created_by) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id",
      [ctx.orgId, jobId, number, supplier.trim().slice(0, 120), address, ctx.userId],
    );
    return o!.id;
  });
}

/* ------------------------------------------------------------------ */
/* Lecture                                                              */
/* ------------------------------------------------------------------ */

export async function listOrders(ctx: Ctx, jobId: string) {
  const rows = await ctx.db.query<Record<string, unknown>>(
    `SELECT o.*, coalesce((SELECT sum(round(l.quantity_milli * l.unit_cost_cents / 1000.0)) FROM purchase_order_lines l WHERE l.order_id=o.id), 0) AS total_cents
     FROM purchase_orders o WHERE o.job_id=$1 AND o.org_id=$2 ORDER BY o.created_at`,
    [jobId, ctx.orgId],
  );
  return rows.map((r) => ({ ...mapOrder(r), total_cents: num(r.total_cents) }));
}

export type Matching = "aucune" | "conforme" | "ecart";

export async function getOrder(ctx: Ctx, id: string) {
  requirePermission(ctx, "costs");
  const order = await loadOrder(ctx.db, ctx, id);
  const lines = (await ctx.db.query<Record<string, unknown>>("SELECT * FROM purchase_order_lines WHERE order_id=$1 ORDER BY position, id", [id])).map(
    mapLine,
  );
  const invoices = await ctx.db.query<{ id: string; purchase_date: unknown; reference: string; amount_ht_cents: unknown }>(
    "SELECT id, purchase_date, reference, amount_ht_cents FROM job_purchases WHERE purchase_order_id=$1 ORDER BY purchase_date",
    [id],
  );
  const totalCents = lines.reduce((a, l) => a + l.total_cents, 0);
  const receivedCents = lines.reduce((a, l) => a + l.received_cents, 0);
  const invoicedCents = invoices.reduce((a, i) => a + num(i.amount_ht_cents), 0);
  const gapCents = invoicedCents - receivedCents;
  // Tolérance : 1 euro ou 1 % de la valeur reçue (arrondis, frais de port mineurs).
  const tolerance = Math.max(100, Math.round(receivedCents / 100));
  const matching: Matching = !invoices.length ? "aucune" : Math.abs(gapCents) <= tolerance ? "conforme" : "ecart";
  return {
    order,
    lines,
    totalCents,
    receivedCents,
    invoicedCents,
    gapCents,
    matching,
    invoices: invoices.map((i) => ({ id: i.id, date: day(i.purchase_date)!, reference: i.reference, amountCents: num(i.amount_ht_cents) })),
  };
}

/* ------------------------------------------------------------------ */
/* Modification du brouillon                                            */
/* ------------------------------------------------------------------ */

const orderSchema = z.object({
  supplier: z.string().trim().max(120).default(""),
  supplierEmail: z.union([z.literal(""), z.string().trim().email("Adresse e-mail du fournisseur invalide").max(200)]).default(""),
  deliveryDate: z.union([z.literal(""), z.string().regex(/^\d{4}-\d{2}-\d{2}$/)]).default(""),
  deliveryAddress: z.string().trim().max(300).default(""),
  notes: z.string().trim().max(2000).default(""),
});

export async function updateOrder(ctx: Ctx, id: string, raw: unknown) {
  requireWritable(ctx);
  requirePermission(ctx, "costs");
  await draftOrder(ctx.db, ctx, id);
  const p = orderSchema.safeParse(raw);
  if (!p.success) throw badRequest(p.error.issues[0].message);
  await ctx.db.query(
    "UPDATE purchase_orders SET supplier=$2, supplier_email=$3, delivery_date=$4, delivery_address=$5, notes=$6, updated_at=now() WHERE id=$1",
    [id, p.data.supplier, p.data.supplierEmail, p.data.deliveryDate || null, p.data.deliveryAddress, p.data.notes],
  );
}

const lineSchema = z.object({
  id: z.string().optional().default(""),
  label: z.string().trim().min(1, "Désignation requise").max(300),
  reference: z.string().trim().max(60).default(""),
  unit: z.string().trim().min(1).max(20).default("u"),
  quantity: z.string().trim().min(1, "Quantité requise"),
  unitCost: z.string().trim().default(""),
});

export async function saveLine(ctx: Ctx, orderId: string, raw: unknown) {
  requireWritable(ctx);
  requirePermission(ctx, "costs");
  await draftOrder(ctx.db, ctx, orderId);
  const p = lineSchema.safeParse(raw);
  if (!p.success) throw badRequest(p.error.issues[0].message);
  const qty = parseQuantity(p.data.quantity);
  if (qty <= 0) throw badRequest("La quantité doit être positive");
  const cost = parseCost(p.data.unitCost);
  if (p.data.id) {
    const r = await ctx.db.query(
      "UPDATE purchase_order_lines SET label=$3, reference=$4, unit=$5, quantity_milli=$6, unit_cost_cents=$7 WHERE id=$1 AND order_id=$2 RETURNING id",
      [isUuid(p.data.id) ? p.data.id : null, orderId, p.data.label, p.data.reference, p.data.unit, qty, cost],
    );
    if (!r.length) throw notFound("Ligne introuvable");
    return p.data.id;
  }
  const pos = await one<{ n: unknown }>(ctx.db, "SELECT coalesce(max(position), -1) + 1 AS n FROM purchase_order_lines WHERE order_id=$1", [orderId]);
  const r = await one<{ id: string }>(
    ctx.db,
    `INSERT INTO purchase_order_lines (org_id, order_id, position, label, reference, unit, quantity_milli, unit_cost_cents)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
    [ctx.orgId, orderId, num(pos?.n), p.data.label, p.data.reference, p.data.unit, qty, cost],
  );
  return r!.id;
}

export async function deleteLine(ctx: Ctx, orderId: string, lineId: string) {
  requireWritable(ctx);
  requirePermission(ctx, "costs");
  await draftOrder(ctx.db, ctx, orderId);
  const r = await ctx.db.query("DELETE FROM purchase_order_lines WHERE id=$1 AND order_id=$2 RETURNING id", [
    isUuid(lineId) ? lineId : null,
    orderId,
  ]);
  if (!r.length) throw notFound("Ligne introuvable");
}

/* ------------------------------------------------------------------ */
/* Envoi, réception, facture                                            */
/* ------------------------------------------------------------------ */

export async function sendOrder(ctx: Ctx, id: string) {
  requireWritable(ctx);
  requirePermission(ctx, "costs");
  const o = await draftOrder(ctx.db, ctx, id);
  if (!o.supplier) throw badRequest("Indiquez le fournisseur avant d'envoyer la commande");
  const n = await one<{ n: unknown }>(ctx.db, "SELECT count(*) AS n FROM purchase_order_lines WHERE order_id=$1", [id]);
  if (!num(n?.n)) throw badRequest("La commande ne contient aucune ligne");
  await ctx.db.query("UPDATE purchase_orders SET status='envoye', sent_at=now(), updated_at=now() WHERE id=$1", [id]);
  await audit(ctx.db, { orgId: ctx.orgId, userId: ctx.userId, action: "order.send", target: id, ip: ctx.ip });
}

export async function cancelOrder(ctx: Ctx, id: string) {
  requireWritable(ctx);
  requirePermission(ctx, "costs");
  const o = await loadOrder(ctx.db, ctx, id);
  if (o.status === "recu" || o.status === "recu_partiel") throw conflict("Marchandises déjà reçues : la commande ne s'annule plus");
  if (o.status === "annule") return;
  await ctx.db.query("UPDATE purchase_orders SET status='annule', updated_at=now() WHERE id=$1", [id]);
}

/** Réception : quantités reçues au total pour chaque ligne (cumul des livraisons). */
export async function receiveOrder(ctx: Ctx, id: string, received: Record<string, string>) {
  requireWritable(ctx);
  requirePermission(ctx, "costs");
  const o = await loadOrder(ctx.db, ctx, id);
  if (!["envoye", "recu_partiel", "recu"].includes(o.status)) throw conflict("Envoyez la commande avant d'en saisir la réception");
  return ctx.db.transaction(async (tx) => {
    const lines = (await tx.query<Record<string, unknown>>("SELECT * FROM purchase_order_lines WHERE order_id=$1", [id])).map(mapLine);
    for (const l of lines) {
      if (received[l.id] === undefined) continue;
      const q = parseQuantity(received[l.id], `Quantité reçue (${l.label})`);
      // Une livraison peut dépasser la commande (conditionnement) jusqu'au double, au-delà c'est une erreur de saisie.
      if (q > l.quantity_milli * 2) throw badRequest(`Quantité reçue trop élevée pour ${l.label}`);
      await tx.query("UPDATE purchase_order_lines SET received_milli=$2 WHERE id=$1", [l.id, q]);
      l.received_milli = q;
    }
    const all = lines.every((l) => l.received_milli >= l.quantity_milli);
    const any = lines.some((l) => l.received_milli > 0);
    const status: OrderStatus = all ? "recu" : any ? "recu_partiel" : "envoye";
    await tx.query("UPDATE purchase_orders SET status=$2, updated_at=now() WHERE id=$1", [id, status]);
    await audit(tx, { orgId: ctx.orgId, userId: ctx.userId, action: "order.receive", target: id, data: { status }, ip: ctx.ip });
    return status;
  });
}

const invoiceSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date invalide"),
  amount: z.string().trim().min(1, "Montant HT requis"),
  reference: z.string().trim().max(80).default(""),
});

/** Facture du fournisseur rapprochée de la commande : elle devient un achat du chantier. */
export async function recordSupplierInvoice(ctx: Ctx, id: string, raw: unknown) {
  requireWritable(ctx);
  requirePermission(ctx, "costs");
  const o = await loadOrder(ctx.db, ctx, id);
  if (o.status === "brouillon" || o.status === "annule") throw conflict("Seule une commande envoyée peut recevoir une facture");
  const p = invoiceSchema.safeParse(raw);
  if (!p.success) throw badRequest(p.error.issues[0].message);
  let cents: number;
  try {
    cents = eurosToCents(p.data.amount.replace(/[\s€]/g, ""), "Montant");
  } catch (e) {
    throw badRequest((e as Error).message);
  }
  if (cents <= 0) throw badRequest("Montant invalide");
  await ctx.db.query(
    `INSERT INTO job_purchases (org_id, job_id, purchase_order_id, purchase_date, supplier, label, category, amount_ht_cents, reference, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,'materiau',$7,$8,$9)`,
    [ctx.orgId, o.job_id, id, p.data.date, o.supplier, `Facture ${o.supplier} (commande ${o.number})`, cents, p.data.reference, ctx.userId],
  );
  await audit(ctx.db, { orgId: ctx.orgId, userId: ctx.userId, action: "order.invoice", target: id, data: { amount: cents }, ip: ctx.ip });
  return getOrder(ctx, id);
}

/* ------------------------------------------------------------------ */
/* PDF                                                                  */
/* ------------------------------------------------------------------ */

const euros = (cents: number) =>
  (cents / 100).toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).replace(/ | /g, " ") + " EUR";

export async function orderPdf(ctx: Ctx, id: string): Promise<{ number: string; pdf: Uint8Array }> {
  const { order, lines, totalCents } = await getOrder(ctx, id);
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
  const { job } = await getJob(ctx, order.job_id);
  const doc = await PDFDocument.create();
  doc.setTitle(`Bon de commande ${order.number}`);
  const p = new Page(doc, await doc.embedFont(StandardFonts.Helvetica), await doc.embedFont(StandardFonts.HelveticaBold));
  p.title(`Bon de commande ${order.number}`, `Émis le ${fr(parisDate(order.sent_at ? new Date(order.sent_at) : new Date()))}`);
  p.field(
    "Client (commanditaire)",
    [org?.trade_name || org?.legal_name, org?.address_line1, [org?.postal_code, org?.city].filter(Boolean).join(" ")].filter(Boolean).join(", "),
  );
  if (org?.siret) p.field("SIRET", org.siret);
  if (org?.phone || org?.email) p.field("Contact", [org?.phone, org?.email].filter(Boolean).join(" · "));
  p.field("Fournisseur", order.supplier);
  p.field("Chantier", job.title);
  p.field("Livraison", order.delivery_address);
  if (order.delivery_date) p.field("Date souhaitée", fr(order.delivery_date));
  p.rule();
  const cols = [LEFT, LEFT + 70, LEFT + 290, LEFT + 345, LEFT + 420];
  p.ensure(20);
  p.y -= 14;
  ["Réf.", "Désignation", "Qté", "Prix unit. HT", "Total HT"].forEach((h, i) =>
    p.page.drawText(sanitize(h, p.bold), { x: cols[i], y: p.y, size: 9, font: p.bold, color: GREY }),
  );
  for (const l of lines) {
    p.ensure(18);
    p.y -= 16;
    const cells = [
      l.reference,
      l.label,
      `${l.quantity.replace(".", ",")} ${l.unit}`,
      l.unit_cost_cents ? euros(l.unit_cost_cents) : "",
      l.unit_cost_cents ? euros(l.total_cents) : "",
    ];
    cells.forEach((c, i) => {
      let t = sanitize(c, p.regular);
      const max = (cols[i + 1] ?? LEFT + WIDTH) - cols[i] - 6;
      while (t && p.regular.widthOfTextAtSize(t, 9) > max) t = t.slice(0, -2) + ".";
      p.page.drawText(t, { x: cols[i], y: p.y, size: 9, font: p.regular, color: BLACK });
    });
  }
  p.rule();
  if (totalCents) p.field("Total HT", euros(totalCents));
  if (order.notes) {
    p.heading("Remarques");
    p.line(order.notes, 10);
  }
  p.gap(16);
  p.line("Merci de rappeler le numéro de commande sur le bon de livraison et la facture.", 9, p.regular, GREY);
  return { number: order.number, pdf: await doc.save() };
}
