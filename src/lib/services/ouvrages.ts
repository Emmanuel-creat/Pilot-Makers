/**
 * Ouvrages composés : une prestation du catalogue qui regroupe d'autres
 * prestations (fournitures, main-d'œuvre, déplacement) avec une quantité par
 * unité d'ouvrage. Son prix de vente et son coût sont la somme de ceux des
 * composants, recalculés à chaque changement de prix d'un composant.
 *
 * Un composant est toujours une prestation simple : pas d'ouvrage dans un
 * ouvrage, donc aucune boucle possible.
 */

import { parseScaled } from "@/lib/calc/decimal";
import { formatQuantity } from "@/lib/calc/format";
import type { Queryable } from "@/lib/db";
import { num, numOrNull, one } from "@/lib/db";
import { badRequest, isUuid, notFound } from "@/lib/http";
import type { Ctx } from "./context";
import { audit, requireWritable } from "./context";

export interface Component {
  child_id: string;
  reference: string;
  name: string;
  unit: string;
  quantity: string;
  quantity_milli: number;
  unit_price4: number;
  unit_cost4: number | null;
  active: boolean;
}

export async function listComponents(q: Queryable, orgId: string, parentId: string): Promise<Component[]> {
  const rows = await q.query<Record<string, unknown>>(
    `SELECT k.child_id, k.quantity, c.reference, c.name, c.unit, c.unit_price4, c.unit_cost4, c.active
     FROM catalog_components k JOIN catalog_items c ON c.id=k.child_id
     WHERE k.parent_id=$1 AND k.org_id=$2 ORDER BY k.position`,
    [parentId, orgId],
  );
  return rows.map((r) => ({
    child_id: String(r.child_id),
    reference: String(r.reference),
    name: String(r.name),
    unit: String(r.unit),
    quantity: String(r.quantity),
    quantity_milli: Number(parseScaled(String(r.quantity), 3)),
    unit_price4: num(r.unit_price4),
    unit_cost4: numOrNull(r.unit_cost4),
    active: Boolean(r.active),
  }));
}

/** Montant d'un composant pour une unité d'ouvrage, arrondi au dix-millième d'euro. */
function part(price4: number, milli: number): bigint {
  const raw = BigInt(price4) * BigInt(milli);
  return (raw + 500n) / 1000n;
}

export function compositionTotals(components: Pick<Component, "quantity_milli" | "unit_price4" | "unit_cost4">[]) {
  let price = 0n;
  let cost: bigint | null = 0n;
  for (const c of components) {
    price += part(c.unit_price4, c.quantity_milli);
    cost = cost === null || c.unit_cost4 === null ? null : cost + part(c.unit_cost4, c.quantity_milli);
  }
  return { unitPrice4: Number(price), unitCost4: cost === null ? null : Number(cost) };
}

export function compositionText(components: Pick<Component, "quantity_milli" | "unit" | "name">[]): string {
  if (!components.length) return "";
  return "Comprend : " + components.map((c) => `${formatQuantity(c.quantity_milli)} ${c.unit} ${c.name}`).join(" ; ");
}

/** Recalcule prix, coût et texte d'un ouvrage ; trace le changement de prix. */
export async function recomputeOuvrage(q: Queryable, orgId: string, parentId: string, userId: string | null) {
  const comps = await listComponents(q, orgId, parentId);
  const cur = await one<{ unit_price4: unknown; unit_cost4: unknown }>(q, "SELECT unit_price4, unit_cost4 FROM catalog_items WHERE id=$1 AND org_id=$2", [
    parentId,
    orgId,
  ]);
  if (!cur) return;
  if (!comps.length) {
    await q.query("UPDATE catalog_items SET kind='simple', composition_text='' WHERE id=$1 AND org_id=$2", [parentId, orgId]);
    return;
  }
  const t = compositionTotals(comps);
  const oldPrice = num(cur.unit_price4);
  const oldCost = numOrNull(cur.unit_cost4);
  await q.query(
    "UPDATE catalog_items SET kind='ouvrage', unit_price4=$3, unit_cost4=$4, composition_text=$5, updated_at=now() WHERE id=$1 AND org_id=$2",
    [parentId, orgId, t.unitPrice4, t.unitCost4, compositionText(comps)],
  );
  if (oldPrice !== t.unitPrice4 || oldCost !== t.unitCost4) {
    await q.query(
      "INSERT INTO catalog_price_history (org_id, item_id, old_price4, new_price4, old_cost4, new_cost4, user_id) VALUES ($1,$2,$3,$4,$5,$6,$7)",
      [orgId, parentId, oldPrice, t.unitPrice4, oldCost, t.unitCost4, userId],
    );
  }
}

/** À appeler après tout changement de prix : met à jour les ouvrages qui utilisent ces prestations. */
export async function recomputeParentsOf(q: Queryable, orgId: string, childIds: string[], userId: string | null) {
  if (!childIds.length) return;
  const parents = await q.query<{ parent_id: string }>(
    "SELECT DISTINCT parent_id FROM catalog_components WHERE org_id=$1 AND child_id = ANY($2::uuid[])",
    [orgId, childIds],
  );
  for (const p of parents) await recomputeOuvrage(q, orgId, p.parent_id, userId);
}

/** Remplace la composition d'un ouvrage. Une liste vide le redevient une prestation simple. */
export async function setComponents(ctx: Ctx, parentId: string, raw: unknown) {
  requireWritable(ctx);
  if (!Array.isArray(raw)) throw badRequest("Composition invalide");
  if (raw.length > 50) throw badRequest("50 composants au plus");
  const items = raw.map((r, i) => {
    const o = (r ?? {}) as Record<string, unknown>;
    const childId = String(o.itemId ?? o.child_id ?? "");
    const quantity = String(o.quantity ?? "").trim();
    if (!isUuid(childId)) throw badRequest(`Composant ${i + 1} : prestation invalide`);
    let milli: bigint;
    try {
      milli = parseScaled(quantity, 3);
    } catch {
      throw badRequest(`Composant ${i + 1} : quantité invalide`);
    }
    if (milli <= 0n) throw badRequest(`Composant ${i + 1} : la quantité doit être positive`);
    return { childId, quantity };
  });
  if (new Set(items.map((i) => i.childId)).size !== items.length) throw badRequest("Une prestation apparaît deux fois dans la composition");
  await ctx.db.transaction(async (tx) => {
    const parent = await one<{ id: string }>(tx, "SELECT id FROM catalog_items WHERE id=$1 AND org_id=$2 FOR UPDATE", [parentId, ctx.orgId]);
    if (!parent) throw notFound("Prestation introuvable");
    const usedAsComponent = await one(tx, "SELECT 1 FROM catalog_components WHERE child_id=$1 LIMIT 1", [parentId]);
    if (usedAsComponent && items.length) throw badRequest("Cette prestation est déjà un composant d'un ouvrage : elle ne peut pas devenir un ouvrage");
    for (const it of items) {
      if (it.childId === parentId) throw badRequest("Un ouvrage ne peut pas se contenir lui-même");
      const child = await one<{ kind: string }>(tx, "SELECT kind FROM catalog_items WHERE id=$1 AND org_id=$2", [it.childId, ctx.orgId]);
      if (!child) throw badRequest("Composant introuvable dans votre catalogue");
      if (child.kind === "ouvrage") throw badRequest("Un ouvrage ne peut contenir que des prestations simples");
    }
    await tx.query("DELETE FROM catalog_components WHERE parent_id=$1 AND org_id=$2", [parentId, ctx.orgId]);
    let pos = 0;
    for (const it of items) {
      await tx.query("INSERT INTO catalog_components (org_id, parent_id, child_id, position, quantity) VALUES ($1,$2,$3,$4,$5)", [
        ctx.orgId,
        parentId,
        it.childId,
        pos++,
        it.quantity,
      ]);
    }
    await recomputeOuvrage(tx, ctx.orgId, parentId, ctx.userId);
    await audit(tx, { orgId: ctx.orgId, userId: ctx.userId, action: "catalog.composition", target: parentId, data: { components: items.length } });
  });
  return listComponents(ctx.db, ctx.orgId, parentId);
}
