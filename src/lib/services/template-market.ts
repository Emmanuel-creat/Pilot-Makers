/** Bourse aux modèles de devis entre artisans : publication, ajout gratuit, vente réglée directement entre entreprises. */

import type { Queryable } from "@/lib/db";
import { num, one } from "@/lib/db";
import { badRequest, conflict, forbidden, isUuid, notFound } from "@/lib/http";
import { canSell, EXPERIENCE_MIN, freeName, parsePrice, preview, publishSchema, sellableData } from "@/lib/template-market";
import type { Ctx } from "./context";
import { audit, requireRole, requireWritable } from "./context";
import { appUrl, sendMail } from "./mail";
import { notifyOrg } from "./push";
import type { TemplateData } from "./templates";

const ORG_NAME = "coalesce(nullif(o.trade_name, ''), nullif(o.legal_name, ''), 'Entreprise')";

async function acceptedQuotes(db: Queryable, orgId: string) {
  return num((await one<{ n: unknown }>(db, "SELECT count(*) AS n FROM quotes WHERE org_id=$1 AND status='accepted'", [orgId]))?.n);
}

/** Publie (ou met à jour) un modèle dans la bourse. Vendre demande un historique d'au moins EXPERIENCE_MIN devis acceptés. */
export async function publishTemplate(ctx: Ctx, templateId: string, raw: { title: string; summary?: string; price?: string }): Promise<string> {
  requireWritable(ctx);
  requireRole(ctx, "admin");
  const p = publishSchema.safeParse(raw);
  if (!p.success) throw badRequest(p.error.issues[0].message);
  let price: number;
  try {
    price = parsePrice(p.data.price);
  } catch (e) {
    throw badRequest((e as Error).message);
  }
  const t = isUuid(templateId)
    ? await one<{ data: TemplateData; line_count: number }>(ctx.db, "SELECT data, line_count FROM quote_templates WHERE id=$1 AND org_id=$2", [
        templateId,
        ctx.orgId,
      ])
    : null;
  if (!t) throw notFound("Modèle introuvable");
  if (price > 0 && !canSell(await acceptedQuotes(ctx.db, ctx.orgId))) {
    throw forbidden(`La vente est réservée aux entreprises qui ont au moins ${EXPERIENCE_MIN} devis acceptés ; vous pouvez le céder gratuitement.`);
  }
  const trade = (await one<{ trade: string }>(ctx.db, "SELECT trade FROM organizations WHERE id=$1", [ctx.orgId]))?.trade ?? "";
  const r = await one<{ id: string }>(
    ctx.db,
    `INSERT INTO template_listings (org_id, template_id, title, summary, trade, price_cents, data, line_count)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
     ON CONFLICT (template_id) DO UPDATE SET status='publie', title=EXCLUDED.title, summary=EXCLUDED.summary, trade=EXCLUDED.trade,
       price_cents=EXCLUDED.price_cents, data=EXCLUDED.data, line_count=EXCLUDED.line_count, updated_at=now()
     RETURNING id`,
    [ctx.orgId, templateId, p.data.title, p.data.summary, trade, price, JSON.stringify(sellableData(t.data)), t.line_count],
  );
  await audit(ctx.db, { orgId: ctx.orgId, userId: ctx.userId, action: "template.publish", target: r!.id, data: { priceCents: price }, ip: ctx.ip });
  return r!.id;
}

export async function withdrawListing(ctx: Ctx, listingId: string) {
  requireWritable(ctx);
  requireRole(ctx, "admin");
  const r = isUuid(listingId)
    ? await ctx.db.query("UPDATE template_listings SET status='retire', updated_at=now() WHERE id=$1 AND org_id=$2 RETURNING id", [listingId, ctx.orgId])
    : [];
  if (!r.length) throw notFound("Modèle introuvable dans la bourse");
}

export interface MarketListing {
  id: string;
  title: string;
  summary: string;
  trade: string;
  priceCents: number;
  lineCount: number;
  seller: string;
  sellerAccepted: number;
  sellerRating: number | null;
  buyers: number;
  preview: ReturnType<typeof preview>;
  /** Achat de l'entreprise qui consulte, s'il existe */
  mine: "a_regler" | "regle" | null;
}

/** Modèles publiés par les autres entreprises, les plus repris d'abord. */
export async function marketListings(ctx: Ctx, filters: { trade?: string; q?: string } = {}): Promise<MarketListing[]> {
  const rows = await ctx.db.query<Record<string, unknown>>(
    `SELECT l.id, l.title, l.summary, l.trade, l.price_cents, l.line_count, l.data, ${ORG_NAME} AS seller,
       (SELECT count(*) FROM quotes q WHERE q.org_id=l.org_id AND q.status='accepted') AS accepted,
       (SELECT avg(rating) FROM customer_reviews r WHERE r.org_id=l.org_id AND r.submitted_at IS NOT NULL AND r.hidden_reason='') AS rating,
       (SELECT count(*) FROM template_purchases p WHERE p.listing_id=l.id AND p.status='regle') AS buyers,
       (SELECT status FROM template_purchases p WHERE p.listing_id=l.id AND p.buyer_org_id=$1) AS mine
     FROM template_listings l JOIN organizations o ON o.id=l.org_id
     WHERE l.status='publie' AND l.org_id <> $1
       AND ($2 = '' OR lower(l.trade) = lower($2))
       AND ($3 = '' OR l.title ILIKE '%' || $3 || '%' OR l.summary ILIKE '%' || $3 || '%')
     ORDER BY buyers DESC, l.updated_at DESC LIMIT 200`,
    [ctx.orgId, (filters.trade ?? "").trim(), (filters.q ?? "").trim().slice(0, 80)],
  );
  return rows.map((r) => ({
    id: String(r.id),
    title: String(r.title),
    summary: String(r.summary),
    trade: String(r.trade),
    priceCents: Number(r.price_cents),
    lineCount: Number(r.line_count),
    seller: String(r.seller),
    sellerAccepted: Number(r.accepted),
    sellerRating: r.rating == null ? null : Math.round(Number(r.rating) * 10) / 10,
    buyers: Number(r.buyers),
    preview: preview(r.data as TemplateData),
    mine: (r.mine as MarketListing["mine"]) ?? null,
  }));
}

export async function marketTrades(ctx: Ctx): Promise<string[]> {
  const rows = await ctx.db.query<{ trade: string }>(
    "SELECT DISTINCT trade FROM template_listings WHERE status='publie' AND org_id <> $1 AND trade <> '' ORDER BY trade",
    [ctx.orgId],
  );
  return rows.map((r) => r.trade);
}

/** Copie le modèle publié dans les modèles de l'acheteur. */
async function deliver(db: Queryable, listing: { title: string; summary: string; data: unknown; line_count: number }, buyerOrgId: string) {
  const names = await db.query<{ name: string }>("SELECT name FROM quote_templates WHERE org_id=$1", [buyerOrgId]);
  const name = freeName(
    listing.title,
    names.map((n) => n.name),
  );
  const r = await one<{ id: string }>(db, "INSERT INTO quote_templates (org_id, name, description, data, line_count) VALUES ($1,$2,$3,$4,$5) RETURNING id", [
    buyerOrgId,
    name,
    listing.summary.slice(0, 500),
    JSON.stringify(listing.data),
    listing.line_count,
  ]);
  return r!.id;
}

/** Ajoute un modèle gratuit, ou demande l'achat d'un modèle payant : le vendeur est prévenu et confirme le règlement. */
export async function acquireListing(ctx: Ctx, listingId: string): Promise<{ status: "a_regler" | "regle"; templateId: string | null }> {
  requireWritable(ctx);
  requireRole(ctx, "admin");
  const l = isUuid(listingId)
    ? await one<{ id: string; org_id: string; title: string; summary: string; data: unknown; line_count: number; price_cents: number; email: string }>(
        ctx.db,
        `SELECT l.id, l.org_id, l.title, l.summary, l.data, l.line_count, l.price_cents, o.email
         FROM template_listings l JOIN organizations o ON o.id=l.org_id WHERE l.id=$1 AND l.status='publie'`,
        [listingId],
      )
    : null;
  if (!l) throw notFound("Modèle introuvable ou retiré de la bourse");
  if (l.org_id === ctx.orgId) throw badRequest("Ce modèle est déjà le vôtre");
  if (await one(ctx.db, "SELECT 1 FROM template_purchases WHERE listing_id=$1 AND buyer_org_id=$2", [l.id, ctx.orgId])) {
    throw conflict("Vous avez déjà demandé ce modèle");
  }
  const buyer = (await one<{ name: string; email: string }>(ctx.db, `SELECT ${ORG_NAME} AS name, o.email FROM organizations o WHERE o.id=$1`, [ctx.orgId]))!;
  if (l.price_cents === 0) {
    const templateId = await deliver(ctx.db, l, ctx.orgId);
    await ctx.db.query(
      "INSERT INTO template_purchases (listing_id, buyer_org_id, status, price_cents, template_id, settled_at) VALUES ($1,$2,'regle',0,$3,now())",
      [l.id, ctx.orgId, templateId],
    );
    await notifyOrg(ctx.db, l.org_id, { title: `Votre modèle « ${l.title} » a été repris`, body: `Par ${buyer.name}.`, url: "/app/modeles/bourse" });
    return { status: "regle", templateId };
  }
  await ctx.db.query("INSERT INTO template_purchases (listing_id, buyer_org_id, status, price_cents) VALUES ($1,$2,'a_regler',$3)", [
    l.id,
    ctx.orgId,
    l.price_cents,
  ]);
  const euros = (l.price_cents / 100).toFixed(2).replace(".", ",");
  const title = `Demande d'achat de votre modèle « ${l.title} »`;
  if (l.email) {
    await sendMail(ctx.db, {
      orgId: l.org_id,
      kind: "notification",
      to: l.email,
      subject: title,
      body: `${buyer.name} souhaite acheter votre modèle « ${l.title} » pour ${euros} euros.\n\nTransmettez-lui vos coordonnées de règlement${buyer.email ? ` (${buyer.email})` : ""}, puis confirmez le règlement reçu dans la bourse aux modèles : le modèle lui sera alors livré.\n\n${appUrl("/app/modeles/bourse")}`,
    });
  }
  await notifyOrg(ctx.db, l.org_id, { title, body: `${buyer.name}, ${euros} euros.`, url: "/app/modeles/bourse" });
  return { status: "a_regler", templateId: null };
}

/** Le vendeur confirme avoir reçu le règlement : le modèle est livré à l'acheteur. */
export async function settlePurchase(ctx: Ctx, purchaseId: string) {
  requireWritable(ctx);
  requireRole(ctx, "admin");
  const p = isUuid(purchaseId)
    ? await one<{ id: string; buyer_org_id: string; title: string; summary: string; data: unknown; line_count: number; listing_id: string }>(
        ctx.db,
        `SELECT p.id, p.buyer_org_id, l.title, l.summary, l.data, l.line_count, l.id AS listing_id
         FROM template_purchases p JOIN template_listings l ON l.id=p.listing_id
         WHERE p.id=$1 AND l.org_id=$2 AND p.status='a_regler'`,
        [purchaseId, ctx.orgId],
      )
    : null;
  if (!p) throw notFound("Demande d'achat introuvable ou déjà réglée");
  await ctx.db.transaction(async (tx) => {
    const templateId = await deliver(tx, p, p.buyer_org_id);
    await tx.query("UPDATE template_purchases SET status='regle', template_id=$2, settled_at=now() WHERE id=$1", [p.id, templateId]);
    await notifyOrg(tx, p.buyer_org_id, { title: `Modèle « ${p.title} » livré`, body: "Il est dans vos modèles de devis.", url: "/app/modeles" });
    await audit(tx, { orgId: ctx.orgId, userId: ctx.userId, action: "template.sale", target: p.listing_id, ip: ctx.ip });
  });
}

/** Modèles publiés par l'entreprise, avec ventes et demandes en attente ; achats de l'entreprise. */
export async function myMarket(ctx: Ctx) {
  const listings = await ctx.db.query<{ id: string; title: string; status: string; price_cents: number; template_id: string; buyers: unknown }>(
    `SELECT l.id, l.title, l.status, l.price_cents, l.template_id,
       (SELECT count(*) FROM template_purchases p WHERE p.listing_id=l.id AND p.status='regle') AS buyers
     FROM template_listings l WHERE l.org_id=$1 ORDER BY l.updated_at DESC`,
    [ctx.orgId],
  );
  const pending = await ctx.db.query<{ id: string; title: string; buyer: string; email: string; price_cents: number; created_at: unknown }>(
    `SELECT p.id, l.title, ${ORG_NAME} AS buyer, o.email, p.price_cents, p.created_at
     FROM template_purchases p JOIN template_listings l ON l.id=p.listing_id JOIN organizations o ON o.id=p.buyer_org_id
     WHERE l.org_id=$1 AND p.status='a_regler' ORDER BY p.created_at`,
    [ctx.orgId],
  );
  const accepted = await acceptedQuotes(ctx.db, ctx.orgId);
  return {
    listings: listings.map((l) => ({ ...l, buyers: num(l.buyers) })),
    pending,
    canSell: canSell(accepted),
    accepted,
    earnedCents: num(
      (
        await one<{ s: unknown }>(
          ctx.db,
          "SELECT coalesce(sum(p.price_cents), 0) AS s FROM template_purchases p JOIN template_listings l ON l.id=p.listing_id WHERE l.org_id=$1 AND p.status='regle'",
          [ctx.orgId],
        )
      )?.s,
    ),
  };
}
