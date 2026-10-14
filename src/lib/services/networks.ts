/**
 * Réseaux et groupements d'artisans : création avec un code d'invitation, adhésion, et bibliothèque
 * d'ouvrages partagée. Seuls le libellé, la description, l'unité, la TVA, la durée et, si le membre
 * le choisit, le prix de vente sont partagés ; jamais les coûts d'achat ni les fournisseurs.
 */

import { z } from "zod";
import { num, one } from "@/lib/db";
import { badRequest, conflict, forbidden, isUuid, notFound } from "@/lib/http";
import { makeJoinCode, MAX_NETWORKS, MAX_SHARED, normalizeJoinCode } from "@/lib/network";
import { createItem } from "./catalog";
import type { Ctx } from "./context";
import { audit, requirePermission, requireWritable } from "./context";

const ORG_NAME = "coalesce(nullif(o.trade_name, ''), nullif(o.legal_name, ''), 'Entreprise')";

export async function listNetworks(ctx: Ctx) {
  const rows = await ctx.db.query<{ id: string; name: string; description: string; join_code: string; role: string; members: unknown; items: unknown }>(
    `SELECT n.id, n.name, n.description, n.join_code, m.role,
       (SELECT count(*) FROM network_members x WHERE x.network_id=n.id) AS members,
       (SELECT count(*) FROM network_items i WHERE i.network_id=n.id) AS items
     FROM networks n JOIN network_members m ON m.network_id=n.id AND m.org_id=$1 ORDER BY lower(n.name)`,
    [ctx.orgId],
  );
  return rows.map((r) => ({ ...r, members: num(r.members), items: num(r.items), animator: r.role === "animateur" }));
}

async function membership(ctx: Ctx, networkId: string) {
  if (!isUuid(networkId)) throw notFound("Réseau introuvable");
  const m = await one<{ role: string; name: string; description: string; join_code: string }>(
    ctx.db,
    "SELECT m.role, n.name, n.description, n.join_code FROM network_members m JOIN networks n ON n.id=m.network_id WHERE m.network_id=$1 AND m.org_id=$2",
    [networkId, ctx.orgId],
  );
  if (!m) throw notFound("Réseau introuvable");
  return m;
}

const createSchema = z.object({ name: z.string().trim().min(3, "Nom du réseau trop court").max(120), description: z.string().trim().max(500).default("") });

export async function createNetwork(ctx: Ctx, raw: unknown) {
  requireWritable(ctx);
  requirePermission(ctx, "settings");
  const p = createSchema.safeParse(raw);
  if (!p.success) throw badRequest(p.error.issues[0].message);
  const n = await one<{ n: unknown }>(ctx.db, "SELECT count(*) AS n FROM network_members WHERE org_id=$1", [ctx.orgId]);
  if (num(n?.n) >= MAX_NETWORKS) throw badRequest(`${MAX_NETWORKS} réseaux au plus`);
  return ctx.db.transaction(async (tx) => {
    const r = await one<{ id: string }>(tx, "INSERT INTO networks (name, description, join_code, created_by_org) VALUES ($1,$2,$3,$4) RETURNING id", [
      p.data.name,
      p.data.description,
      makeJoinCode(),
      ctx.orgId,
    ]);
    await tx.query("INSERT INTO network_members (network_id, org_id, role) VALUES ($1,$2,'animateur')", [r!.id, ctx.orgId]);
    await audit(tx, { orgId: ctx.orgId, userId: ctx.userId, action: "network.create", target: r!.id, ip: ctx.ip });
    return r!.id;
  });
}

export async function joinNetwork(ctx: Ctx, rawCode: string) {
  requireWritable(ctx);
  requirePermission(ctx, "settings");
  const code = normalizeJoinCode(rawCode);
  if (!code) throw badRequest("Code d'invitation invalide : 8 lettres et chiffres");
  const n = await one<{ id: string }>(ctx.db, "SELECT id FROM networks WHERE join_code=$1", [code]);
  if (!n) throw notFound("Aucun réseau avec ce code");
  if (await one(ctx.db, "SELECT 1 FROM network_members WHERE network_id=$1 AND org_id=$2", [n.id, ctx.orgId]))
    throw conflict("Vous êtes déjà membre de ce réseau");
  const count = await one<{ n: unknown }>(ctx.db, "SELECT count(*) AS n FROM network_members WHERE org_id=$1", [ctx.orgId]);
  if (num(count?.n) >= MAX_NETWORKS) throw badRequest(`${MAX_NETWORKS} réseaux au plus`);
  await ctx.db.query("INSERT INTO network_members (network_id, org_id) VALUES ($1,$2)", [n.id, ctx.orgId]);
  await audit(ctx.db, { orgId: ctx.orgId, userId: ctx.userId, action: "network.join", target: n.id, ip: ctx.ip });
  return n.id;
}

/** Quitter le réseau retire aussi les ouvrages partagés par l'entreprise ; le dernier membre le supprime. */
export async function leaveNetwork(ctx: Ctx, networkId: string) {
  requireWritable(ctx);
  requirePermission(ctx, "settings");
  await membership(ctx, networkId);
  await ctx.db.transaction(async (tx) => {
    await tx.query("DELETE FROM network_items WHERE network_id=$1 AND org_id=$2", [networkId, ctx.orgId]);
    await tx.query("DELETE FROM network_members WHERE network_id=$1 AND org_id=$2", [networkId, ctx.orgId]);
    const left = await one<{ n: unknown }>(tx, "SELECT count(*) AS n FROM network_members WHERE network_id=$1", [networkId]);
    if (num(left?.n) === 0) await tx.query("DELETE FROM networks WHERE id=$1", [networkId]);
    else if (!(await one(tx, "SELECT 1 FROM network_members WHERE network_id=$1 AND role='animateur'", [networkId])))
      await tx.query(
        "UPDATE network_members SET role='animateur' WHERE network_id=$1 AND org_id=(SELECT org_id FROM network_members WHERE network_id=$1 ORDER BY joined_at LIMIT 1)",
        [networkId],
      );
  });
}

export async function getNetwork(ctx: Ctx, networkId: string, q = "") {
  const m = await membership(ctx, networkId);
  const [members, items, mine] = await Promise.all([
    ctx.db.query<{ org_id: string; name: string; city: string; trade: string; role: string; shared: unknown }>(
      `SELECT m.org_id, ${ORG_NAME} AS name, o.city, o.trade, m.role,
         (SELECT count(*) FROM network_items i WHERE i.network_id=m.network_id AND i.org_id=m.org_id) AS shared
       FROM network_members m JOIN organizations o ON o.id=m.org_id WHERE m.network_id=$1 ORDER BY m.joined_at`,
      [networkId],
    ),
    ctx.db.query<Record<string, unknown>>(
      `SELECT i.*, ${ORG_NAME} AS publisher,
         EXISTS (SELECT 1 FROM catalog_items c WHERE c.org_id=$2 AND lower(c.name)=lower(i.name)) AS owned
       FROM network_items i JOIN organizations o ON o.id=i.org_id
       WHERE i.network_id=$1 AND ($3 = '' OR i.name ILIKE '%' || $3 || '%' OR i.description ILIKE '%' || $3 || '%' OR $3 = ANY(i.tags))
       ORDER BY i.imports DESC, lower(i.name) LIMIT 300`,
      [networkId, ctx.orgId, q.trim().slice(0, 80)],
    ),
    ctx.db.query<{ id: string; name: string; unit: string; shared: boolean }>(
      `SELECT c.id, c.name, c.unit, EXISTS (SELECT 1 FROM network_items i WHERE i.network_id=$2 AND i.source_item_id=c.id) AS shared
       FROM catalog_items c WHERE c.org_id=$1 AND c.active ORDER BY c.usage_count DESC, lower(c.name) LIMIT 300`,
      [ctx.orgId, networkId],
    ),
  ]);
  return {
    id: networkId,
    name: m.name,
    description: m.description,
    joinCode: m.join_code,
    animator: m.role === "animateur",
    members: members.map((x) => ({ ...x, shared: num(x.shared), me: x.org_id === ctx.orgId })),
    items: items.map((i) => ({
      id: String(i.id),
      name: String(i.name),
      description: String(i.description),
      category: String(i.category),
      unit: String(i.unit),
      priceCents: i.unit_price4 == null ? null : Math.round(num(i.unit_price4) / 100),
      vatBp: Number(i.vat_bp),
      publisher: String(i.publisher),
      mine: i.org_id === ctx.orgId,
      owned: Boolean(i.owned),
      imports: Number(i.imports),
    })),
    myItems: mine,
  };
}

/** Partage des ouvrages du catalogue (copie mise à jour à chaque nouveau partage). */
export async function shareItems(ctx: Ctx, networkId: string, ids: string[], withPrices: boolean) {
  requireWritable(ctx);
  await membership(ctx, networkId);
  const valid = ids.filter(isUuid).slice(0, 100);
  if (!valid.length) throw badRequest("Choisissez au moins un ouvrage");
  const count = await one<{ n: unknown }>(ctx.db, "SELECT count(*) AS n FROM network_items WHERE network_id=$1 AND org_id=$2", [networkId, ctx.orgId]);
  if (num(count?.n) + valid.length > MAX_SHARED) throw badRequest(`${MAX_SHARED} ouvrages partagés au plus par entreprise`);
  const r = await ctx.db.query(
    `INSERT INTO network_items (network_id, org_id, source_item_id, name, description, category, unit, unit_price4, vat_bp, duration_minutes, tags)
     SELECT $1, c.org_id, c.id, c.name, c.description, c.category, c.unit, CASE WHEN $4 THEN c.unit_price4 END, c.vat_bp, c.duration_minutes, c.tags
     FROM catalog_items c WHERE c.org_id=$2 AND c.id = ANY($3::uuid[])
     ON CONFLICT (network_id, source_item_id) DO UPDATE SET name=EXCLUDED.name, description=EXCLUDED.description, category=EXCLUDED.category,
       unit=EXCLUDED.unit, unit_price4=EXCLUDED.unit_price4, vat_bp=EXCLUDED.vat_bp, duration_minutes=EXCLUDED.duration_minutes, tags=EXCLUDED.tags, updated_at=now()
     RETURNING id`,
    [networkId, ctx.orgId, valid, withPrices],
  );
  await audit(ctx.db, { orgId: ctx.orgId, userId: ctx.userId, action: "network.share", target: networkId, data: { count: r.length, withPrices }, ip: ctx.ip });
  return r.length;
}

export async function unshareItem(ctx: Ctx, networkId: string, itemId: string) {
  requireWritable(ctx);
  const m = await membership(ctx, networkId);
  if (!isUuid(itemId)) throw notFound("Ouvrage introuvable");
  const it = await one<{ org_id: string }>(ctx.db, "SELECT org_id FROM network_items WHERE id=$1 AND network_id=$2", [itemId, networkId]);
  if (!it) throw notFound("Ouvrage introuvable");
  if (it.org_id !== ctx.orgId && m.role !== "animateur") throw forbidden("Seul l'auteur ou l'animateur du réseau peut retirer cet ouvrage");
  await ctx.db.query("DELETE FROM network_items WHERE id=$1", [itemId]);
}

/** Ajoute au catalogue les ouvrages choisis, sans doublon de nom ; le prix absent est à compléter. */
export async function importNetworkItems(ctx: Ctx, networkId: string, ids: string[]) {
  requireWritable(ctx);
  const m = await membership(ctx, networkId);
  const valid = ids.filter(isUuid).slice(0, 200);
  if (!valid.length) throw badRequest("Choisissez au moins un ouvrage");
  const rows = await ctx.db.query<Record<string, unknown>>(
    `SELECT i.*, ${ORG_NAME} AS publisher FROM network_items i JOIN organizations o ON o.id=i.org_id WHERE i.network_id=$1 AND i.id = ANY($2::uuid[])`,
    [networkId, valid],
  );
  let added = 0;
  let skipped = 0;
  await ctx.db.transaction(async (tx) => {
    for (const r of rows) {
      if (await one(tx, "SELECT 1 FROM catalog_items WHERE org_id=$1 AND lower(name)=lower($2)", [ctx.orgId, r.name])) {
        skipped++;
        continue;
      }
      const price4 = r.unit_price4 == null ? 0 : num(r.unit_price4);
      await createItem(
        ctx,
        {
          name: r.name,
          description: r.description,
          category: r.category,
          unit: r.unit,
          unit_price: (price4 / 10_000).toFixed(4),
          vat_percent: (Number(r.vat_bp) / 100).toFixed(2),
          duration_minutes: r.duration_minutes,
          tags: r.tags,
        },
        tx,
        { source: "network", sourceNote: `Bibliothèque du réseau ${m.name}, partagé par ${r.publisher}.${r.unit_price4 == null ? " Prix à compléter." : ""}` },
      );
      await tx.query("UPDATE network_items SET imports = imports + 1 WHERE id=$1", [r.id]);
      added++;
    }
  });
  return { added, skipped };
}
