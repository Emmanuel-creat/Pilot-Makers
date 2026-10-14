/**
 * Tarifs fournisseurs : import du fichier de prix d'un négoce (CSV ou tableur, colonnes des formats courants
 * du bâtiment comme FAB-DIS), mise à jour des prix d'achat des articles du catalogue reliés à ce fournisseur,
 * et alerte quand une hausse fait passer la marge sous le seuil choisi.
 *
 * Un article est relié par sa référence chez le fournisseur (ou son code EAN), à défaut par sa propre référence.
 * Les prix de vente ne changent jamais automatiquement : l'artisan décide de les revoir.
 */

import { z } from "zod";
import { headerKey, cleanAmount } from "@/lib/sheet";
import { badRequest, notFound } from "@/lib/http";
import type { Ctx } from "./context";
import { audit, requirePermission, requireWritable } from "./context";
import { recomputeParentsOf } from "./ouvrages";
import { invoiceLinesTable, readPurchaseInvoiceLines } from "@/lib/invoice-reader";

type Field = "reference" | "ean" | "label" | "unit" | "net" | "list" | "discount";

const ALIASES: Record<string, Field> = {
  reference: "reference",
  ref: "reference",
  refciale: "reference",
  "ref ciale": "reference",
  "reference commerciale": "reference",
  "reference fournisseur": "reference",
  "ref fournisseur": "reference",
  "code article": "reference",
  article: "reference",
  code: "reference",
  ean: "ean",
  ean13: "ean",
  gtin: "ean",
  "code ean": "ean",
  "code barre": "ean",
  libelle: "label",
  libelle240: "label",
  libelle80: "label",
  libelle30: "label",
  designation: "label",
  description: "label",
  unite: "unit",
  ub: "unit",
  uv: "unit",
  "unite de vente": "unit",
  "unite de base": "unit",
  "prix net": "net",
  "prix net ht": "net",
  "tarif net": "net",
  net: "net",
  "prix achat": "net",
  "prix d achat": "net",
  "prix d achat ht": "net",
  "prix public": "list",
  "prix public ht": "list",
  "prix base": "list",
  prixbase: "list",
  tarif: "list",
  "tarif public": "list",
  prix: "list",
  "prix ht": "list",
  "pu ht": "list",
  remise: "discount",
  "taux de remise": "discount",
  "remise client": "discount",
};

export interface SupplierRow {
  line: number;
  reference: string;
  ean: string;
  label: string;
  unit: string;
  net4: number | null;
  list4: number | null;
  discountBp: number | null;
  error?: string;
}

const price4 = (raw: string): number | null => {
  const v = cleanAmount(raw ?? "", 4);
  if (!v || !/^-?\d+(\.\d+)?$/.test(v)) return null;
  const n = Math.round(Number(v) * 10000);
  return n >= 0 ? n : null;
};

/** Lignes du fichier de prix : colonnes reconnues par leur intitulé, prix net calculé si seule la remise est donnée. */
export function parseSupplierTable(table: string[][]): { rows: SupplierRow[]; columns: Field[] } {
  if (table.length < 2) throw badRequest("Fichier vide");
  if (table.length > 5001) throw badRequest("5 000 lignes maximum par import");
  const header = table[0].map((h) => ALIASES[headerKey(h)]);
  const columns = [...new Set(header.filter(Boolean))] as Field[];
  if (!columns.includes("reference") && !columns.includes("ean")) throw badRequest("Colonne de référence introuvable (référence, code article ou EAN)");
  if (!columns.includes("net") && !columns.includes("list")) throw badRequest("Colonne de prix introuvable (prix net, prix public ou tarif)");
  const rows: SupplierRow[] = [];
  for (let i = 1; i < table.length; i++) {
    const cells = table[i];
    if (cells.every((c) => !String(c ?? "").trim())) continue;
    const get = (f: Field) => {
      const j = header.indexOf(f);
      return j < 0 ? "" : String(cells[j] ?? "").trim();
    };
    const list4 = price4(get("list"));
    let net4 = price4(get("net"));
    const rawDiscount = cleanAmount(get("discount"), 2);
    let discountBp = rawDiscount && /^\d+(\.\d+)?$/.test(rawDiscount) ? Math.round(Number(rawDiscount) * 100) : null;
    // Remise saisie au format Excel (0,35 pour 35 %).
    if (discountBp !== null && discountBp > 0 && discountBp < 100) discountBp *= 100;
    if (discountBp !== null && discountBp > 10000) discountBp = null;
    if (net4 === null && list4 !== null) net4 = discountBp ? Math.round((list4 * (10000 - discountBp)) / 10000) : list4;
    const row: SupplierRow = {
      line: i + 1,
      reference: get("reference").slice(0, 60),
      ean: get("ean").replace(/\s/g, "").slice(0, 20),
      label: get("label").slice(0, 240),
      unit: get("unit").slice(0, 20),
      net4,
      list4,
      discountBp,
    };
    if (!row.reference && !row.ean) row.error = "Référence manquante";
    else if (net4 === null) row.error = "Prix illisible";
    rows.push(row);
  }
  return { rows, columns };
}

export interface CostChange {
  itemId: string;
  reference: string;
  name: string;
  supplierRef: string;
  oldCost4: number | null;
  newCost4: number;
  price4: number;
  /** Marge sur le prix de vente avec le nouveau prix d'achat, en points de base */
  marginBp: number | null;
  alert: boolean;
}

const importSchema = z.object({
  supplier: z.string().trim().min(2, "Indiquez le nom du fournisseur").max(120),
  minMarginPercent: z.coerce.number().min(0).max(90).default(20),
});

export function marginBp(price4: number, cost4: number): number | null {
  return price4 > 0 ? Math.round(((price4 - cost4) * 10000) / price4) : null;
}

/** Aperçu (commit = false) ou application d'un fichier de prix fournisseur. */
export async function importSupplierPrices(ctx: Ctx, raw: { supplier?: unknown; minMarginPercent?: unknown }, table: string[][], commit: boolean) {
  requireWritable(ctx);
  requirePermission(ctx, "costs");
  const p = importSchema.safeParse(raw);
  if (!p.success) throw badRequest(p.error.issues[0].message);
  const { supplier, minMarginPercent } = p.data;
  const threshold = Math.round(minMarginPercent * 100);
  const { rows, columns } = parseSupplierTable(table);
  const valid = rows.filter((r) => !r.error);
  const byRef = new Map<string, SupplierRow>();
  for (const r of valid) {
    if (r.reference) byRef.set(r.reference.toLowerCase(), r);
    if (r.ean) byRef.set(r.ean, r);
  }
  const items = await ctx.db.query<{ id: string; reference: string; name: string; supplier_ref: string; unit_cost4: unknown; unit_price4: unknown }>(
    "SELECT id, reference, name, supplier_ref, unit_cost4, unit_price4 FROM catalog_items WHERE org_id=$1 AND lower(supplier)=lower($2) AND kind='simple'",
    [ctx.orgId, supplier],
  );
  const changes: CostChange[] = [];
  let unchanged = 0;
  for (const it of items) {
    const match = (it.supplier_ref && (byRef.get(it.supplier_ref.toLowerCase()) ?? byRef.get(it.supplier_ref))) || byRef.get(it.reference.toLowerCase());
    if (!match) continue;
    const oldCost4 = it.unit_cost4 === null ? null : Number(it.unit_cost4);
    const newCost4 = match.net4!;
    if (oldCost4 === newCost4) {
      unchanged++;
      continue;
    }
    const price = Number(it.unit_price4);
    const m = marginBp(price, newCost4);
    changes.push({
      itemId: it.id,
      reference: it.reference,
      name: it.name,
      supplierRef: match.reference || match.ean,
      oldCost4,
      newCost4,
      price4: price,
      marginBp: m,
      alert: (oldCost4 === null || newCost4 > oldCost4) && m !== null && m < threshold,
    });
  }
  const summary = {
    supplier,
    columns,
    lines: rows.length,
    errors: rows
      .filter((r) => r.error)
      .map((r) => ({ line: r.line, message: r.error! }))
      .slice(0, 50),
    linked: changes.length + unchanged,
    unchanged,
    changes,
    increases: changes.filter((c) => c.oldCost4 !== null && c.newCost4 > c.oldCost4).length,
    alerts: changes.filter((c) => c.alert).length,
    applied: false,
  };
  if (!commit) return summary;

  await ctx.db.transaction(async (tx) => {
    for (const r of valid) {
      await tx.query(
        `INSERT INTO supplier_prices (org_id, supplier, reference, ean, label, unit, net_price4, list_price4, discount_bp)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
         ON CONFLICT (org_id, supplier, reference) DO UPDATE SET ean=$4, label=$5, unit=$6, net_price4=$7, list_price4=$8, discount_bp=$9, imported_at=now()`,
        [ctx.orgId, supplier, r.reference || r.ean, r.ean, r.label, r.unit, r.net4, r.list4, r.discountBp],
      );
    }
    for (const c of changes) {
      await tx.query("UPDATE catalog_items SET unit_cost4=$3, updated_by=$4, updated_at=now() WHERE id=$1 AND org_id=$2", [
        c.itemId,
        ctx.orgId,
        c.newCost4,
        ctx.userId,
      ]);
      await tx.query(
        "INSERT INTO catalog_price_history (org_id, item_id, old_price4, new_price4, old_cost4, new_cost4, user_id) VALUES ($1,$2,$3,$3,$4,$5,$6)",
        [ctx.orgId, c.itemId, c.price4, c.oldCost4, c.newCost4, ctx.userId],
      );
      if (c.alert) {
        await tx.query("INSERT INTO cost_alerts (org_id, item_id, supplier, old_cost4, new_cost4, price4, margin_bp) VALUES ($1,$2,$3,$4,$5,$6,$7)", [
          ctx.orgId,
          c.itemId,
          supplier,
          c.oldCost4,
          c.newCost4,
          c.price4,
          c.marginBp,
        ]);
      }
    }
    // Les ouvrages qui contiennent ces articles suivent leur nouveau coût.
    if (changes.length)
      await recomputeParentsOf(
        tx,
        ctx.orgId,
        changes.map((c) => c.itemId),
        ctx.userId,
      );
  });
  await audit(ctx.db, {
    orgId: ctx.orgId,
    userId: ctx.userId,
    action: "catalog.supplier_prices",
    target: supplier,
    data: { lines: valid.length, updated: changes.length, alerts: summary.alerts },
    ip: ctx.ip,
  });
  return { ...summary, applied: true };
}

export interface CostAlert {
  id: string;
  item_id: string;
  reference: string;
  name: string;
  supplier: string;
  old_cost4: number | null;
  new_cost4: number;
  price4: number;
  margin_bp: number;
  created_at: Date;
}

/** Alertes de marge en cours ; seules les plus récentes par article sont gardées. */
export async function listCostAlerts(ctx: Ctx): Promise<CostAlert[]> {
  const rows = await ctx.db.query<Record<string, unknown>>(
    `SELECT DISTINCT ON (a.item_id) a.id, a.item_id, c.reference, c.name, a.supplier, a.old_cost4, a.new_cost4, a.price4, a.margin_bp, a.created_at
     FROM cost_alerts a JOIN catalog_items c ON c.id=a.item_id
     WHERE a.org_id=$1 AND a.dismissed_at IS NULL ORDER BY a.item_id, a.created_at DESC`,
    [ctx.orgId],
  );
  return rows
    .map((r) => ({
      ...(r as unknown as CostAlert),
      old_cost4: r.old_cost4 === null ? null : Number(r.old_cost4),
      new_cost4: Number(r.new_cost4),
      price4: Number(r.price4),
      margin_bp: Number(r.margin_bp),
    }))
    .sort((a, b) => a.margin_bp - b.margin_bp);
}

/** Alerte traitée : prix de vente revu ou marge acceptée. Toutes les alertes de l'article sont closes. */
export async function dismissCostAlert(ctx: Ctx, id: string) {
  requireWritable(ctx);
  requirePermission(ctx, "costs");
  const r = await ctx.db.query(
    `UPDATE cost_alerts SET dismissed_at=now() WHERE org_id=$1 AND dismissed_at IS NULL
       AND item_id=(SELECT item_id FROM cost_alerts WHERE id=$2 AND org_id=$1) RETURNING id`,
    [ctx.orgId, id],
  );
  if (!r.length) throw notFound("Alerte introuvable");
}

/** Fournisseurs déjà cités dans le catalogue, pour la saisie. */
export async function catalogSuppliers(ctx: Ctx): Promise<string[]> {
  const rows = await ctx.db.query<{ supplier: string }>("SELECT DISTINCT supplier FROM catalog_items WHERE org_id=$1 AND supplier<>'' ORDER BY supplier", [
    ctx.orgId,
  ]);
  return rows.map((r) => r.supplier);
}

/**
 * Facture d'achat électronique (PDF Factur-X, XML CII ou UBL) lue ligne à ligne : les prix nets facturés mettent à
 * jour les prix d'achat des articles reliés, avec le même aperçu et les mêmes alertes de marge qu'un fichier de prix.
 * Le fournisseur choisi par l'artisan prime ; à défaut, celui de la facture.
 */
export async function importSupplierInvoice(ctx: Ctx, raw: { supplier?: unknown; minMarginPercent?: unknown }, bytes: Uint8Array, commit: boolean) {
  const read = await readPurchaseInvoiceLines(bytes);
  if (!read) throw badRequest("Facture illisible : seuls les PDF Factur-X et les fichiers XML CII ou UBL sont lus ligne à ligne.");
  const priced = read.lines.filter((l) => l.reference || l.ean);
  if (!priced.length) throw badRequest("Aucune ligne de la facture ne porte de référence d'article.");
  const supplier = typeof raw.supplier === "string" && raw.supplier.trim() ? raw.supplier : read.invoice.supplier;
  const result = await importSupplierPrices(ctx, { ...raw, supplier }, invoiceLinesTable(priced), commit);
  return {
    ...result,
    invoice: { number: read.invoice.number, supplier: read.invoice.supplier, issueDate: read.invoice.issueDate, lines: read.lines.length },
  };
}
