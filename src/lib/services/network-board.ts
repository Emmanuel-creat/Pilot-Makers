/** Bourse du réseau : annonces de missions et de matériaux, réponses des membres, clôture par l'auteur. */

import { one } from "@/lib/db";
import { badRequest, conflict, forbidden, isUuid, notFound } from "@/lib/http";
import { isVisible, postSchema, priceCents, type PostKind, type PostStatus } from "@/lib/network-board";
import type { Ctx } from "./context";
import { requireWritable } from "./context";
import { notifyOrg } from "./push";
import { parisDate } from "./quotes";

const ORG_NAME = "coalesce(nullif(o.trade_name, ''), nullif(o.legal_name, ''), 'Entreprise')";
const iso = (v: unknown) => (v == null ? null : (v instanceof Date ? v.toISOString() : String(v)).slice(0, 10));

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

export async function networkBoard(ctx: Ctx, networkId: string, now = new Date()) {
  const net = await member(ctx, networkId);
  const today = parisDate(now);
  const posts = await ctx.db.query<Record<string, unknown>>(
    `SELECT p.*, ${ORG_NAME} AS publisher, o.city AS publisher_city,
       (SELECT count(*) FROM network_post_replies r WHERE r.post_id=p.id)::int AS replies,
       EXISTS (SELECT 1 FROM network_post_replies r WHERE r.post_id=p.id AND r.org_id=$2) AS replied
     FROM network_posts p JOIN organizations o ON o.id=p.org_id
     WHERE p.network_id=$1 AND (p.status='ouverte' OR (p.org_id=$2 AND p.created_at > now() - interval '90 days'))
     ORDER BY p.created_at DESC LIMIT 200`,
    [networkId, ctx.orgId],
  );
  const mineIds = posts.filter((p) => p.org_id === ctx.orgId).map((p) => String(p.id));
  const replies = mineIds.length
    ? await ctx.db.query<{ post_id: string; message: string; created_at: Date; name: string; phone: string; email: string; city: string }>(
        `SELECT r.post_id, r.message, r.created_at, ${ORG_NAME} AS name, o.phone, o.email, o.city
         FROM network_post_replies r JOIN organizations o ON o.id=r.org_id WHERE r.post_id = ANY($1::uuid[]) ORDER BY r.created_at`,
        [mineIds],
      )
    : [];
  const list = posts.map((p) => ({
    id: String(p.id),
    kind: p.kind as PostKind,
    title: String(p.title),
    detail: String(p.detail),
    trade: String(p.trade),
    city: String(p.city || p.publisher_city || ""),
    start: iso(p.start_date),
    end: iso(p.end_date),
    quantity: String(p.quantity),
    unit: String(p.unit),
    priceCents: p.price_cents == null ? null : Number(p.price_cents),
    status: p.status as PostStatus,
    publisher: String(p.publisher),
    mine: p.org_id === ctx.orgId,
    replies: Number(p.replies),
    replied: Boolean(p.replied),
    responses: replies
      .filter((r) => r.post_id === p.id)
      .map((r) => ({ name: r.name, phone: r.phone, email: r.email, city: r.city, message: r.message, at: new Date(r.created_at).toISOString() })),
  }));
  return { id: networkId, name: net.name, posts: list.filter((p) => p.mine || isVisible(p, today)) };
}

export async function createPost(ctx: Ctx, networkId: string, raw: unknown) {
  requireWritable(ctx);
  await member(ctx, networkId);
  const p = postSchema.safeParse(raw);
  if (!p.success) throw badRequest(p.error.issues[0].message);
  const d = p.data;
  const price = priceCents(d.price);
  if (price === null) throw badRequest("Prix illisible");
  const r = await one<{ id: string }>(
    ctx.db,
    `INSERT INTO network_posts (network_id, org_id, kind, title, detail, trade, city, start_date, end_date, quantity, unit, price_cents, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING id`,
    [
      networkId,
      ctx.orgId,
      d.kind,
      d.title,
      d.detail,
      d.trade,
      d.city,
      d.start || null,
      d.end || null,
      d.quantity,
      d.unit,
      price === "" ? null : price,
      ctx.userId,
    ],
  );
  return r!.id;
}

export async function replyToPost(ctx: Ctx, postId: string, message: string) {
  requireWritable(ctx);
  if (!isUuid(postId)) throw notFound("Annonce introuvable");
  const p = await one<{ network_id: string; org_id: string; title: string; status: string }>(
    ctx.db,
    "SELECT network_id, org_id, title, status FROM network_posts WHERE id=$1",
    [postId],
  );
  if (!p) throw notFound("Annonce introuvable");
  await member(ctx, p.network_id);
  if (p.org_id === ctx.orgId) throw badRequest("Vous ne pouvez pas répondre à votre propre annonce");
  if (p.status !== "ouverte") throw conflict("Cette annonce n'est plus ouverte");
  const r = await one(
    ctx.db,
    "INSERT INTO network_post_replies (post_id, org_id, message, created_by) VALUES ($1,$2,$3,$4) ON CONFLICT (post_id, org_id) DO NOTHING RETURNING id",
    [postId, ctx.orgId, message.trim().slice(0, 1000), ctx.userId],
  );
  if (!r) throw conflict("Vous avez déjà répondu à cette annonce");
  await notifyOrg(ctx.db, p.org_id, {
    title: "Réponse à votre annonce",
    body: `Un membre du réseau est intéressé par « ${p.title} ».`,
    url: `/app/catalogue/reseaux/${p.network_id}/bourse`,
  });
}

export async function closePost(ctx: Ctx, postId: string, status: "pourvue" | "retiree") {
  requireWritable(ctx);
  if (!isUuid(postId)) throw notFound("Annonce introuvable");
  const p = await one<{ org_id: string; network_id: string }>(ctx.db, "SELECT org_id, network_id FROM network_posts WHERE id=$1", [postId]);
  if (!p) throw notFound("Annonce introuvable");
  if (p.org_id !== ctx.orgId) throw forbidden("Seul l'auteur peut clore l'annonce");
  await ctx.db.query("UPDATE network_posts SET status=$2, closed_at=now() WHERE id=$1", [postId, status]);
  return p.network_id;
}
