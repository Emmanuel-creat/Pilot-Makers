/**
 * Comparateur de prix entre fournisseurs : pour chaque article du catalogue, les offres des autres tarifs
 * importés pour le même produit, l'économie annuelle estimée d'après les devis acceptés, et le changement
 * de fournisseur en un clic.
 */

import { parseScaled } from "@/lib/calc/decimal";
import { num, one } from "@/lib/db";
import { conflict, isUuid, notFound } from "@/lib/http";
import { annualSavingCents, productKey, rankOffers, type Offer } from "@/lib/supplier-compare";
import type { Ctx } from "./context";
import { audit, requirePermission, requireWritable } from "./context";
import { recomputeParentsOf } from "./ouvrages";

type PriceRow = { id: string; supplier: string; reference: string; ean: string; label: string; unit: string; net_price4: unknown };

const toOffer = (r: PriceRow): Offer => ({
  id: r.id,
  supplier: r.supplier,
  reference: r.reference,
  ean: r.ean,
  label: r.label,
  unit: r.unit,
  net4: num(r.net_price4),
});

function quantityMilli(text: string) {
  try {
    const v = Number(parseScaled(text.replace(/\s/g, "") || "0", 3));
    return v > 0 ? v : 0;
  } catch {
    return 0;
  }
}

export async function compareSuppliers(ctx: Ctx) {
  requirePermission(ctx, "costs");
  const rows = await ctx.db.query<PriceRow>("SELECT id, supplier, reference, ean, label, unit, net_price4 FROM supplier_prices WHERE org_id=$1 LIMIT 50000", [
    ctx.orgId,
  ]);
  const byKey = new Map<string, Offer[]>();
  const own = new Map<string, Offer>();
  for (const r of rows) {
    const o = toOffer(r);
    const k = productKey(o);
    if (k) byKey.set(k, [...(byKey.get(k) ?? []), o]);
    const s = r.supplier.trim().toLowerCase();
    own.set(`${s}|${r.reference.toLowerCase()}`, o);
    if (r.ean) own.set(`${s}|${r.ean}`, o);
  }
  const suppliers = new Set(rows.map((r) => r.supplier.trim().toLowerCase())).size;
  const items = await ctx.db.query<{ id: string; reference: string; name: string; unit: string; supplier: string; supplier_ref: string; unit_cost4: unknown }>(
    "SELECT id, reference, name, unit, supplier, supplier_ref, unit_cost4 FROM catalog_items WHERE org_id=$1 AND kind='simple' AND active ORDER BY name",
    [ctx.orgId],
  );
  // Quantités des devis acceptés sur douze mois, pour estimer l'économie annuelle.
  const used = await ctx.db.query<{ catalog_item_id: string; quantity: string }>(
    `SELECT l.catalog_item_id, l.quantity FROM quote_lines l JOIN quotes q ON q.id=l.quote_id
     WHERE q.org_id=$1 AND q.status='accepted' AND q.updated_at > now() - interval '365 days' AND l.catalog_item_id IS NOT NULL`,
    [ctx.orgId],
  );
  const volume = new Map<string, number>();
  for (const u of used) volume.set(u.catalog_item_id, (volume.get(u.catalog_item_id) ?? 0) + quantityMilli(u.quantity));

  const out = [];
  for (const it of items) {
    const s = it.supplier.trim().toLowerCase();
    const mine = s ? (own.get(`${s}|${(it.supplier_ref || it.reference).toLowerCase()}`) ?? own.get(`${s}|${it.supplier_ref}`)) : undefined;
    const key = mine ? productKey(mine) : productKey({ label: it.name, unit: it.unit });
    if (!key) continue;
    const cost4 = it.unit_cost4 == null ? null : num(it.unit_cost4);
    const offers = rankOffers(it.supplier, cost4, byKey.get(key) ?? []);
    if (!offers.length) continue;
    const qty = volume.get(it.id) ?? 0;
    const best = offers[0];
    out.push({
      itemId: it.id,
      reference: it.reference,
      name: it.name,
      unit: it.unit,
      supplier: it.supplier,
      cost4,
      matchedBy: key.startsWith("ean:") ? ("ean" as const) : ("libelle" as const),
      offers,
      cheaper: cost4 != null && best.net4 < cost4,
      yearQuantityMilli: qty,
      savingCents: annualSavingCents(qty, cost4, best.net4),
    });
  }
  out.sort((a, b) => b.savingCents - a.savingCents || (a.offers[0].gapBp ?? 0) - (b.offers[0].gapBp ?? 0));
  return { items: out, suppliers, savingCents: out.reduce((a, i) => a + i.savingCents, 0) };
}

/** Passe l'article chez le fournisseur de l'offre : fournisseur, référence et coût d'achat mis à jour. */
export async function switchSupplier(ctx: Ctx, itemId: string, offerId: string) {
  requireWritable(ctx);
  requirePermission(ctx, "costs");
  if (!isUuid(itemId) || !isUuid(offerId)) throw notFound("Offre introuvable");
  const it = await one<{ name: string; kind: string; supplier: string; unit_cost4: unknown; unit_price4: unknown }>(
    ctx.db,
    "SELECT name, kind, supplier, unit_cost4, unit_price4 FROM catalog_items WHERE id=$1 AND org_id=$2",
    [itemId, ctx.orgId],
  );
  const offer = await one<PriceRow>(ctx.db, "SELECT id, supplier, reference, ean, label, unit, net_price4 FROM supplier_prices WHERE id=$1 AND org_id=$2", [
    offerId,
    ctx.orgId,
  ]);
  if (!it || !offer) throw notFound("Offre introuvable");
  if (it.kind !== "simple") throw conflict("Un ouvrage se compose de plusieurs articles : changez le fournisseur de ses composants");
  if (it.supplier.trim().toLowerCase() === offer.supplier.trim().toLowerCase()) throw conflict("L'article est déjà acheté chez ce fournisseur");
  const oldCost4 = it.unit_cost4 == null ? null : num(it.unit_cost4);
  const newCost4 = num(offer.net_price4);
  const price4 = num(it.unit_price4);
  await ctx.db.transaction(async (tx) => {
    await tx.query("UPDATE catalog_items SET supplier=$3, supplier_ref=$4, unit_cost4=$5, updated_by=$6, updated_at=now() WHERE id=$1 AND org_id=$2", [
      itemId,
      ctx.orgId,
      offer.supplier,
      offer.reference,
      newCost4,
      ctx.userId,
    ]);
    await tx.query("INSERT INTO catalog_price_history (org_id, item_id, old_price4, new_price4, old_cost4, new_cost4, user_id) VALUES ($1,$2,$3,$3,$4,$5,$6)", [
      ctx.orgId,
      itemId,
      price4,
      oldCost4,
      newCost4,
      ctx.userId,
    ]);
    await recomputeParentsOf(tx, ctx.orgId, [itemId], ctx.userId);
    await audit(tx, {
      orgId: ctx.orgId,
      userId: ctx.userId,
      action: "catalog.switch_supplier",
      target: itemId,
      data: { supplier: offer.supplier },
      ip: ctx.ip,
    });
  });
  return { name: it.name, supplier: offer.supplier, oldCost4, newCost4 };
}
