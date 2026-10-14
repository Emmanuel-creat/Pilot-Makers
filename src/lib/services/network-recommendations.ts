/** Recommandations de clients entre membres d'un réseau : envoi avec l'accord du client, acceptation en demande entrante. */

import { one } from "@/lib/db";
import { badRequest, conflict, isUuid, notFound } from "@/lib/http";
import { rankTargets, recoSchema, type RecoStatus } from "@/lib/recommendations";
import { validateEmail } from "@/lib/validation/identifiers";
import type { Ctx } from "./context";
import { audit, requireWritable } from "./context";
import { createLead } from "./leads";
import { notifyOrg } from "./push";
import type { QuoteStatus } from "./quote-types";

const ORG_NAME = "coalesce(nullif(o.trade_name, ''), nullif(o.legal_name, ''), 'Entreprise')";

async function member(ctx: Ctx, networkId: string) {
  if (!isUuid(networkId)) throw notFound("Réseau introuvable");
  const m = await one<{ name: string; trade: string }>(
    ctx.db,
    "SELECT n.name, o.trade FROM network_members m JOIN networks n ON n.id=m.network_id JOIN organizations o ON o.id=m.org_id WHERE m.network_id=$1 AND m.org_id=$2",
    [networkId, ctx.orgId],
  );
  if (!m) throw notFound("Réseau introuvable");
  return m;
}

export interface Recommendation {
  id: string;
  partner: string;
  partnerTrade: string;
  customerName: string;
  email: string;
  phone: string;
  city: string;
  need: string;
  status: RecoStatus;
  replyNote: string;
  createdAt: Date;
  /** Côté émetteur : le confrère a-t-il signé un devis avec ce client ? */
  signed: boolean;
}

/** Page des recommandations d'un réseau : confrères classés par complémentarité, reçues et envoyées. */
export async function recommendationsBoard(ctx: Ctx, networkId: string) {
  const net = await member(ctx, networkId);
  const members = await ctx.db.query<{ org_id: string; name: string; trade: string; city: string }>(
    `SELECT m.org_id, ${ORG_NAME} AS name, o.trade, o.city FROM network_members m JOIN organizations o ON o.id=m.org_id
     WHERE m.network_id=$1 AND m.org_id <> $2`,
    [networkId, ctx.orgId],
  );
  const rows = await ctx.db.query<Record<string, unknown>>(
    `SELECT r.*, ${ORG_NAME} AS partner, o.trade AS partner_trade, q.status AS quote_status,
       (r.to_org = $2) AS received
     FROM network_recommendations r
     JOIN organizations o ON o.id = CASE WHEN r.to_org=$2 THEN r.from_org ELSE r.to_org END
     LEFT JOIN leads l ON l.id=r.lead_id LEFT JOIN quotes q ON q.id=l.quote_id
     WHERE r.network_id=$1 AND (r.to_org=$2 OR r.from_org=$2) ORDER BY r.created_at DESC LIMIT 200`,
    [networkId, ctx.orgId],
  );
  const map = (r: Record<string, unknown>): Recommendation => {
    const received = Boolean(r.received);
    const hidden = received && r.status !== "acceptee";
    return {
      id: String(r.id),
      partner: String(r.partner),
      partnerTrade: String(r.partner_trade ?? ""),
      customerName: String(r.customer_name),
      // Coordonnées du client visibles par le destinataire une fois la recommandation acceptée.
      email: hidden ? "" : String(r.email),
      phone: hidden ? "" : String(r.phone),
      city: String(r.city),
      need: String(r.need),
      status: r.status as RecoStatus,
      replyNote: String(r.reply_note ?? ""),
      createdAt: r.created_at as Date,
      signed: (r.quote_status as QuoteStatus | null) === "accepted",
    };
  };
  return {
    name: net.name,
    myTrade: net.trade,
    targets: rankTargets(
      net.trade,
      members.map((m) => ({ orgId: m.org_id, name: m.name, trade: m.trade, city: m.city })),
    ),
    received: rows.filter((r) => r.received).map(map),
    sent: rows.filter((r) => !r.received).map(map),
  };
}

export async function sendRecommendation(ctx: Ctx, networkId: string, raw: unknown) {
  requireWritable(ctx);
  await member(ctx, networkId);
  const parsed = recoSchema.safeParse(raw);
  if (!parsed.success) throw badRequest(parsed.error.issues[0].message);
  const r = parsed.data;
  const e = validateEmail(r.email);
  if (e) throw badRequest(e);
  if (r.toOrg === ctx.orgId) throw badRequest("Choisissez un autre membre du réseau");
  const target = await one(ctx.db, "SELECT 1 FROM network_members WHERE network_id=$1 AND org_id=$2", [networkId, r.toOrg]);
  if (!target) throw badRequest("Ce confrère n'est pas membre du réseau");
  const row = await one<{ id: string }>(
    ctx.db,
    `INSERT INTO network_recommendations (network_id, from_org, to_org, customer_name, email, phone, city, need)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
    [networkId, ctx.orgId, r.toOrg, r.customerName, r.email.toLowerCase(), r.phone, r.city, r.need],
  );
  const from = await one<{ name: string }>(ctx.db, `SELECT ${ORG_NAME} AS name FROM organizations o WHERE o.id=$1`, [ctx.orgId]);
  await notifyOrg(ctx.db, r.toOrg, {
    title: "Un confrère vous recommande un client",
    body: `${from?.name ?? "Un membre du réseau"} : ${r.need.slice(0, 120)}`,
    url: `/app/catalogue/reseaux/${networkId}/recommandations`,
  });
  await audit(ctx.db, { orgId: ctx.orgId, userId: ctx.userId, action: "network.recommend", target: row!.id, ip: ctx.ip });
  return row!.id;
}

/** Réponse du destinataire : acceptée, la recommandation devient une demande entrante de source Recommandation. */
export async function answerRecommendation(ctx: Ctx, id: string, accept: boolean, note = "") {
  requireWritable(ctx);
  if (!isUuid(id)) throw notFound("Recommandation introuvable");
  const r = await one<Record<string, unknown>>(
    ctx.db,
    `SELECT r.*, ${ORG_NAME} AS from_name FROM network_recommendations r JOIN organizations o ON o.id=r.from_org WHERE r.id=$1 AND r.to_org=$2`,
    [id, ctx.orgId],
  );
  if (!r) throw notFound("Recommandation introuvable");
  if (r.status !== "envoyee") throw conflict("Vous avez déjà répondu à cette recommandation");
  const reply = note.trim().slice(0, 500);
  let leadId: string | null = null;
  if (accept) {
    leadId = await createLead(ctx, {
      name: r.customer_name,
      email: r.email,
      phone: r.phone,
      city: r.city,
      description: `Recommandé par ${r.from_name} : ${r.need}`,
      source: "recommandation",
      next_action: "Appeler le client recommandé",
    });
  }
  const done = await ctx.db.query(
    "UPDATE network_recommendations SET status=$2, reply_note=$3, lead_id=$4, answered_at=now() WHERE id=$1 AND status='envoyee' RETURNING id",
    [id, accept ? "acceptee" : "declinee", reply, leadId],
  );
  if (!done.length) throw conflict("Vous avez déjà répondu à cette recommandation");
  const me = await one<{ name: string }>(ctx.db, `SELECT ${ORG_NAME} AS name FROM organizations o WHERE o.id=$1`, [ctx.orgId]);
  await notifyOrg(ctx.db, String(r.from_org), {
    title: accept ? "Recommandation acceptée" : "Recommandation déclinée",
    body: `${me?.name ?? "Votre confrère"} pour ${r.customer_name}${reply ? ` : ${reply}` : ""}`,
    url: `/app/catalogue/reseaux/${r.network_id}/recommandations`,
  });
  return { networkId: String(r.network_id), leadId };
}

/** Nombre de recommandations reçues en attente de réponse, tous réseaux confondus. */
export async function pendingRecommendations(ctx: Ctx): Promise<number> {
  const r = await one<{ n: number }>(ctx.db, "SELECT count(*)::int AS n FROM network_recommendations WHERE to_org=$1 AND status='envoyee'", [ctx.orgId]);
  return r?.n ?? 0;
}
