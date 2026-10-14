/** Achats groupés d'un réseau : ouverture par un membre, engagements de quantité, clôture au palier atteint. */

import { toCsv } from "@/lib/csv";
import { one } from "@/lib/db";
import { badRequest, conflict, forbidden, isUuid, notFound } from "@/lib/http";
import { nextTier, parseTiers, priceFor, purchaseSchema, reachedTier, type PurchaseStatus, type Tier } from "@/lib/group-buying";
import { priceCents } from "@/lib/network-board";
import type { Ctx } from "./context";
import { audit, requireWritable } from "./context";
import { notifyOrg } from "./push";
import { parisDate } from "./quotes";

const ORG_NAME = "coalesce(nullif(o.trade_name, ''), nullif(o.legal_name, ''), 'Entreprise')";
const iso = (v: unknown) => (v instanceof Date ? v.toISOString() : String(v)).slice(0, 10);

async function member(ctx: Ctx, networkId: string) {
  if (!isUuid(networkId)) throw notFound("Réseau introuvable");
  const m = await one<{ name: string }>(
    ctx.db,
    "SELECT n.name FROM network_members m JOIN networks n ON n.id=m.network_id WHERE m.network_id=$1 AND m.org_id=$2",
    [networkId, ctx.orgId],
  );
  if (!m) throw notFound("Réseau introuvable");
  return m;
}

async function purchase(ctx: Ctx, id: string) {
  if (!isUuid(id)) throw notFound("Achat groupé introuvable");
  const p = await one<Record<string, unknown>>(
    ctx.db,
    "SELECT p.* FROM group_purchases p JOIN network_members m ON m.network_id=p.network_id AND m.org_id=$2 WHERE p.id=$1",
    [id, ctx.orgId],
  );
  if (!p) throw notFound("Achat groupé introuvable");
  return p;
}

export async function groupPurchases(ctx: Ctx, networkId: string, now = new Date()) {
  const net = await member(ctx, networkId);
  const today = parisDate(now);
  const rows = await ctx.db.query<Record<string, unknown>>(
    `SELECT p.*, ${ORG_NAME} AS organizer,
       coalesce((SELECT sum(c.quantity) FROM group_purchase_commitments c WHERE c.purchase_id=p.id), 0)::int AS total,
       (SELECT count(*) FROM group_purchase_commitments c WHERE c.purchase_id=p.id)::int AS participants,
       (SELECT c.quantity FROM group_purchase_commitments c WHERE c.purchase_id=p.id AND c.org_id=$2) AS mine
     FROM group_purchases p JOIN organizations o ON o.id=p.org_id
     WHERE p.network_id=$1 AND (p.status='ouverte' OR p.created_at > now() - interval '180 days')
     ORDER BY (p.status='ouverte') DESC, p.deadline, p.created_at DESC LIMIT 100`,
    [networkId, ctx.orgId],
  );
  return {
    name: net.name,
    today,
    purchases: rows.map((r) => {
      const tiers = (r.tiers as Tier[]) ?? [];
      const base = Number(r.base_price_cents);
      const total = Number(r.total);
      const mine = r.mine == null ? 0 : Number(r.mine);
      const status = r.status as PurchaseStatus;
      const deadline = iso(r.deadline);
      const unit = r.final_price_cents != null ? Number(r.final_price_cents) : (reachedTier(tiers, total)?.priceCents ?? base);
      return {
        id: String(r.id),
        title: String(r.title),
        supplier: String(r.supplier),
        unit: String(r.unit),
        organizer: String(r.organizer),
        isOrganizer: r.org_id === ctx.orgId,
        baseCents: base,
        tiers,
        deadline,
        status,
        open: status === "ouverte" && deadline >= today,
        total,
        participants: Number(r.participants),
        mine,
        unitCents: unit,
        next: status === "ouverte" ? nextTier(tiers, total) : null,
        mySavingCents: mine ? (base - unit) * mine : 0,
      };
    }),
  };
}

export async function createGroupPurchase(
  ctx: Ctx,
  networkId: string,
  raw: { title: string; supplier: string; unit: string; deadline: string; basePrice: string; tiers: { minQty: string; price: string }[] },
  now = new Date(),
) {
  requireWritable(ctx);
  await member(ctx, networkId);
  const parsed = purchaseSchema.safeParse(raw);
  if (!parsed.success) throw badRequest(parsed.error.issues[0].message);
  const p = parsed.data;
  if (p.deadline < parisDate(now)) throw badRequest("La date limite est déjà passée");
  const base = priceCents(raw.basePrice);
  if (typeof base !== "number" || base <= 0) throw badRequest("Indiquez le prix unitaire de base du fournisseur");
  const { tiers, error } = parseTiers(raw.tiers, base);
  if (error) throw badRequest(error);
  const row = await one<{ id: string }>(
    ctx.db,
    `INSERT INTO group_purchases (network_id, org_id, title, supplier, unit, base_price_cents, tiers, deadline)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
    [networkId, ctx.orgId, p.title, p.supplier, p.unit, base, JSON.stringify(tiers), p.deadline],
  );
  const others = await ctx.db.query<{ org_id: string }>("SELECT org_id FROM network_members WHERE network_id=$1 AND org_id<>$2", [networkId, ctx.orgId]);
  for (const o of others) {
    await notifyOrg(ctx.db, o.org_id, {
      title: "Nouvel achat groupé dans votre réseau",
      body: `${p.title} chez ${p.supplier}, engagements jusqu'au ${p.deadline.split("-").reverse().join("/")}`,
      url: `/app/catalogue/reseaux/${networkId}/achats`,
    });
  }
  await audit(ctx.db, { orgId: ctx.orgId, userId: ctx.userId, action: "network.group_purchase", target: row!.id, ip: ctx.ip });
  return row!.id;
}

/** Engagement d'une quantité ; 0 retire l'engagement. Possible jusqu'à la date limite incluse. */
export async function commitQuantity(ctx: Ctx, id: string, rawQty: string, now = new Date()) {
  requireWritable(ctx);
  const p = await purchase(ctx, id);
  if (p.status !== "ouverte" || iso(p.deadline) < parisDate(now)) throw conflict("Les engagements sont clos pour cet achat");
  const q = rawQty.trim();
  if (!/^\d{1,7}$/.test(q)) throw badRequest("Indiquez une quantité entière");
  const qty = Number(q);
  if (qty === 0) {
    await ctx.db.query("DELETE FROM group_purchase_commitments WHERE purchase_id=$1 AND org_id=$2", [id, ctx.orgId]);
  } else {
    await ctx.db.query(
      `INSERT INTO group_purchase_commitments (purchase_id, org_id, quantity) VALUES ($1,$2,$3)
       ON CONFLICT (purchase_id, org_id) DO UPDATE SET quantity=EXCLUDED.quantity, updated_at=now()`,
      [id, ctx.orgId, qty],
    );
  }
  return String(p.network_id);
}

/** Clôture par l'organisateur : le prix final est celui du palier atteint. Les participants sont prévenus. */
export async function closeGroupPurchase(ctx: Ctx, id: string, cancel = false) {
  requireWritable(ctx);
  const p = await purchase(ctx, id);
  if (p.org_id !== ctx.orgId) throw forbidden("Seul l'organisateur clôt l'achat groupé");
  if (p.status !== "ouverte") throw conflict("Cet achat groupé est déjà clos");
  const total = await one<{ n: number }>(ctx.db, "SELECT coalesce(sum(quantity), 0)::int AS n FROM group_purchase_commitments WHERE purchase_id=$1", [id]);
  const base = Number(p.base_price_cents);
  const unit = priceFor(base, (p.tiers as Tier[]) ?? [], total?.n ?? 0, 1).unitCents;
  await ctx.db.query("UPDATE group_purchases SET status=$2, final_price_cents=$3, closed_at=now() WHERE id=$1", [
    id,
    cancel ? "annulee" : "close",
    cancel ? null : unit,
  ]);
  const participants = await ctx.db.query<{ org_id: string; quantity: number }>(
    "SELECT org_id, quantity FROM group_purchase_commitments WHERE purchase_id=$1 AND org_id<>$2",
    [id, ctx.orgId],
  );
  for (const c of participants) {
    await notifyOrg(ctx.db, c.org_id, {
      title: cancel ? "Achat groupé annulé" : "Achat groupé clos",
      body: cancel
        ? `${p.title} : l'organisateur a annulé l'achat.`
        : `${p.title} : ${c.quantity} ${p.unit} à ${(unit / 100).toFixed(2).replace(".", ",")} € l'unité.`,
      url: `/app/catalogue/reseaux/${p.network_id}/achats`,
    });
  }
  return { networkId: String(p.network_id), unitCents: cancel ? null : unit };
}

/** Récapitulatif des engagements pour le fournisseur, réservé à l'organisateur. */
export async function exportCommitments(ctx: Ctx, id: string) {
  const p = await purchase(ctx, id);
  if (p.org_id !== ctx.orgId) throw forbidden("Seul l'organisateur exporte les engagements");
  const rows = await ctx.db.query<{ name: string; siret: string; phone: string; email: string; city: string; quantity: number }>(
    `SELECT ${ORG_NAME} AS name, o.siret, o.phone, o.email, o.city, c.quantity FROM group_purchase_commitments c
     JOIN organizations o ON o.id=c.org_id WHERE c.purchase_id=$1 ORDER BY lower(${ORG_NAME})`,
    [id],
  );
  const total = rows.reduce((s, r) => s + Number(r.quantity), 0);
  const unit = p.final_price_cents != null ? Number(p.final_price_cents) : priceFor(Number(p.base_price_cents), (p.tiers as Tier[]) ?? [], total, 1).unitCents;
  const euros = (c: number) => (c / 100).toFixed(2).replace(".", ",");
  const csv = toCsv(
    ["Entreprise", "SIRET", "Téléphone", "E-mail", "Commune", `Quantité (${p.unit})`, "Prix unitaire HT", "Montant HT"],
    [
      ...rows.map((r) => [r.name, r.siret, r.phone, r.email, r.city, String(r.quantity), euros(unit), euros(unit * Number(r.quantity))]),
      ["Total", "", "", "", "", String(total), euros(unit), euros(unit * total)],
    ],
  );
  return {
    csv,
    fileName: `achat-groupe-${String(p.title)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .slice(0, 40)}.csv`,
  };
}
