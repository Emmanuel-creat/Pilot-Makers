/** Rénovation coordonnée : dossier partagé entre le pilote, les confrères du réseau et le client. */

import type { Queryable } from "@/lib/db";
import { num, one } from "@/lib/db";
import { badRequest, conflict, forbidden, isUuid, notFound } from "@/lib/http";
import { tradeByKey } from "@/lib/coordination";
import { type Participant, type ParticipantStatus, dossierSummary, parseEuros, tradeLabel } from "@/lib/renovation";
import { randomToken, sha256 } from "@/lib/security";
import type { Ctx } from "./context";
import { audit, requireWritable } from "./context";
import { appUrl } from "./mail";
import { notifyOrg } from "./push";

const ORG_NAME = "coalesce(nullif(o.trade_name, ''), nullif(o.legal_name, ''), 'Entreprise')";
const CUSTOMER = "coalesce(nullif(c.company_name, ''), nullif(trim(c.first_name || ' ' || c.last_name), ''), '')";
const day = (v: unknown) => (v == null ? null : (v instanceof Date ? v.toISOString() : String(v)).slice(0, 10));
const trade = (v: unknown) => (typeof v === "string" && tradeByKey(v) ? v : "autre");

async function orgName(db: Queryable, orgId: string) {
  return (await one<{ name: string }>(db, `SELECT ${ORG_NAME} AS name FROM organizations o WHERE o.id=$1`, [orgId]))?.name ?? "Entreprise";
}

export async function createRenovation(ctx: Ctx, input: { customerId: string; title: string; site?: string; trade?: string }): Promise<string> {
  requireWritable(ctx);
  const title = input.title.trim();
  if (title.length < 3 || title.length > 160) throw badRequest("Donnez un intitulé au dossier (3 à 160 caractères)");
  const c = isUuid(input.customerId)
    ? await one<{ id: string; site: string }>(
        ctx.db,
        `SELECT id, CASE WHEN site_same_as_billing THEN trim(concat_ws(' ', billing_line1, billing_postal_code, billing_city))
                ELSE trim(concat_ws(' ', site_line1, site_postal_code, site_city)) END AS site
         FROM customers WHERE id=$1 AND org_id=$2`,
        [input.customerId, ctx.orgId],
      )
    : null;
  if (!c) throw badRequest("Choisissez le client");
  const r = await one<{ id: string }>(ctx.db, "INSERT INTO renovation_projects (org_id, customer_id, title, site) VALUES ($1,$2,$3,$4) RETURNING id", [
    ctx.orgId,
    c.id,
    title,
    (input.site ?? "").trim().slice(0, 300) || c.site,
  ]);
  const org = await one<{ trade: string }>(ctx.db, "SELECT trade FROM organizations WHERE id=$1", [ctx.orgId]);
  await ctx.db.query("INSERT INTO renovation_participants (project_id, org_id, name, trade, status) VALUES ($1,$2,$3,$4,'pilote')", [
    r!.id,
    ctx.orgId,
    await orgName(ctx.db, ctx.orgId),
    trade(input.trade || org?.trade),
  ]);
  await audit(ctx.db, { orgId: ctx.orgId, userId: ctx.userId, action: "renovation.create", target: r!.id });
  return r!.id;
}

/** Dossiers pilotés par l'entreprise et dossiers où elle intervient. */
export async function listRenovations(ctx: Ctx) {
  const rows = await ctx.db.query<Record<string, unknown>>(
    `SELECT p.id, p.title, p.created_at, p.org_id = $1 AS piloted, ${ORG_NAME} AS pilot, ${CUSTOMER} AS customer, me.status AS my_status, me.id AS my_participant,
            (SELECT count(*) FROM renovation_participants x WHERE x.project_id=p.id AND x.status <> 'refuse') AS companies
     FROM renovation_projects p JOIN organizations o ON o.id=p.org_id LEFT JOIN customers c ON c.id=p.customer_id
     LEFT JOIN renovation_participants me ON me.project_id=p.id AND me.org_id=$1
     WHERE p.org_id=$1 OR me.status IN ('invite', 'accepte') ORDER BY p.created_at DESC LIMIT 200`,
    [ctx.orgId],
  );
  return rows.map((r) => ({
    id: String(r.id),
    title: String(r.title),
    piloted: !!r.piloted,
    pilot: String(r.pilot),
    customer: r.piloted ? String(r.customer ?? "") : "",
    myStatus: (r.my_status ?? null) as ParticipantStatus | null,
    myParticipantId: r.my_participant ? String(r.my_participant) : null,
    companies: num(r.companies),
    createdAt: r.created_at as Date,
  }));
}

async function participants(
  db: Queryable,
  projectId: string,
  viewer: { orgId: string | null; pilot: boolean },
): Promise<(Participant & { orgId: string | null; quoteId: string | null })[]> {
  const rows = await db.query<Record<string, unknown>>(
    `SELECT r.*, q.total_ttc_cents, q.status AS quote_status, q.number AS quote_number FROM renovation_participants r
     LEFT JOIN quotes q ON q.id=r.quote_id AND q.org_id=r.org_id WHERE r.project_id=$1 ORDER BY r.created_at`,
    [projectId],
  );
  return rows.map((r) => {
    const amount = r.quote_id && r.total_ttc_cents != null ? num(r.total_ttc_cents) : r.amount_ttc_cents != null ? num(r.amount_ttc_cents) : null;
    const mine = viewer.pilot || (viewer.orgId != null && r.org_id === viewer.orgId);
    return {
      id: String(r.id),
      orgId: r.org_id ? String(r.org_id) : null,
      name: String(r.name),
      trade: String(r.trade),
      status: r.status as ParticipantStatus,
      startDate: day(r.start_date),
      endDate: day(r.end_date),
      hasQuote: amount != null,
      amountTtcCents: mine ? amount : null,
      quoteId: mine && r.quote_id ? String(r.quote_id) : null,
      quoteStatus: r.quote_id ? String(r.quote_status ?? "") || null : null,
      quoteNumber: mine && r.quote_number ? String(r.quote_number) : null,
    };
  });
}

/** Dossier vu par le pilote ou par une entreprise invitée : chacune ne voit que le montant de son propre devis. */
export async function getRenovation(ctx: Ctx, id: string) {
  if (!isUuid(id)) throw notFound("Dossier introuvable");
  const p = await one<Record<string, unknown>>(
    ctx.db,
    `SELECT p.*, ${ORG_NAME} AS pilot, ${CUSTOMER} AS customer FROM renovation_projects p JOIN organizations o ON o.id=p.org_id
     LEFT JOIN customers c ON c.id=p.customer_id WHERE p.id=$1`,
    [id],
  );
  if (!p) throw notFound("Dossier introuvable");
  const pilot = p.org_id === ctx.orgId;
  if (!pilot) {
    const me = await one(ctx.db, "SELECT 1 FROM renovation_participants WHERE project_id=$1 AND org_id=$2 AND status IN ('invite','accepte')", [id, ctx.orgId]);
    if (!me) throw notFound("Dossier introuvable");
  }
  const list = await participants(ctx.db, id, { orgId: ctx.orgId, pilot });
  const summary = dossierSummary(list);
  return {
    id,
    title: String(p.title),
    site: String(p.site ?? ""),
    pilot: String(p.pilot),
    customer: String(p.customer ?? ""),
    isPilot: pilot,
    shared: !!p.token_hash,
    participants: list,
    summary: { ...summary, totalTtcCents: pilot ? summary.totalTtcCents : null },
    myParticipant: list.find((x) => x.orgId === ctx.orgId) ?? null,
  };
}

async function pilotProject(ctx: Ctx, id: string) {
  requireWritable(ctx);
  const p = isUuid(id)
    ? await one<{ id: string; title: string }>(ctx.db, "SELECT id, title FROM renovation_projects WHERE id=$1 AND org_id=$2", [id, ctx.orgId])
    : null;
  if (!p) throw notFound("Dossier introuvable");
  return p;
}

/** Les confrères des réseaux de l'entreprise, invitables dans un dossier. */
export async function renovationPeers(ctx: Ctx) {
  return ctx.db.query<{ org_id: string; name: string; trade: string }>(
    `SELECT DISTINCT o.id AS org_id, ${ORG_NAME} AS name, o.trade FROM network_members mine
     JOIN network_members other ON other.network_id=mine.network_id AND other.org_id<>mine.org_id
     JOIN organizations o ON o.id=other.org_id WHERE mine.org_id=$1 ORDER BY 2`,
    [ctx.orgId],
  );
}

export async function addRenovationParticipant(ctx: Ctx, id: string, input: { orgId?: string; name?: string; trade?: string; amount?: string }) {
  const p = await pilotProject(ctx, id);
  if (input.orgId) {
    if (!isUuid(input.orgId) || input.orgId === ctx.orgId) throw badRequest("Confrère invalide");
    const peer = (await renovationPeers(ctx)).find((x) => x.org_id === input.orgId);
    if (!peer) throw badRequest("Ce confrère ne fait partie d'aucun de vos réseaux");
    const r = await ctx.db.query(
      `INSERT INTO renovation_participants (project_id, org_id, name, trade, status) VALUES ($1,$2,$3,$4,'invite')
       ON CONFLICT (project_id, org_id) DO NOTHING RETURNING id`,
      [id, peer.org_id, peer.name, trade(input.trade || peer.trade)],
    );
    if (!r.length) throw conflict("Ce confrère est déjà dans le dossier");
    await notifyOrg(ctx.db, peer.org_id, {
      title: "Invitation dans une rénovation coordonnée",
      body: `${await orgName(ctx.db, ctx.orgId)} vous propose d'intervenir sur « ${p.title} ».`,
      url: `/app/renovations/${id}`,
    });
    return;
  }
  const name = (input.name ?? "").trim();
  if (name.length < 2 || name.length > 160) throw badRequest("Indiquez le nom de l'entreprise");
  let amount: number | null;
  try {
    amount = parseEuros(input.amount ?? "");
  } catch (e) {
    throw badRequest((e as Error).message);
  }
  await ctx.db.query("INSERT INTO renovation_participants (project_id, name, trade, status, amount_ttc_cents) VALUES ($1,$2,$3,'externe',$4)", [
    id,
    name,
    trade(input.trade),
    amount,
  ]);
}

export async function answerRenovationInvite(ctx: Ctx, participantId: string, accept: boolean) {
  requireWritable(ctx);
  const r = isUuid(participantId)
    ? await one<{ project_id: string; org_id: string }>(
        ctx.db,
        `UPDATE renovation_participants r SET status=$3 FROM renovation_projects p
         WHERE r.id=$1 AND r.org_id=$2 AND r.status='invite' AND p.id=r.project_id RETURNING r.project_id, p.org_id`,
        [participantId, ctx.orgId, accept ? "accepte" : "refuse"],
      )
    : null;
  if (!r) throw conflict("Cette invitation n'attend plus de réponse");
  await notifyOrg(ctx.db, r.org_id, {
    title: accept ? "Un confrère rejoint le dossier" : "Un confrère décline le dossier",
    body: `${await orgName(ctx.db, ctx.orgId)} ${accept ? "participe" : "ne participe pas"} à la rénovation coordonnée.`,
    url: `/app/renovations/${r.project_id}`,
  });
  return r.project_id;
}

/** Chaque entreprise rattache son propre devis ; le pilote fixe les dates et le montant des entreprises hors application. */
export async function updateRenovationParticipant(
  ctx: Ctx,
  participantId: string,
  input: { quoteId?: string; start?: string; end?: string; amount?: string; trade?: string },
) {
  requireWritable(ctx);
  const r = isUuid(participantId)
    ? await one<{ project_id: string; org_id: string | null; status: ParticipantStatus; pilot_org: string }>(
        ctx.db,
        "SELECT r.project_id, r.org_id, r.status, p.org_id AS pilot_org FROM renovation_participants r JOIN renovation_projects p ON p.id=r.project_id WHERE r.id=$1",
        [participantId],
      )
    : null;
  if (!r) throw notFound("Entreprise introuvable dans ce dossier");
  const isPilot = r.pilot_org === ctx.orgId;
  const isSelf = r.org_id === ctx.orgId && r.status !== "refuse";
  if (!isPilot && !isSelf) throw forbidden("Seul le pilote du dossier modifie cette entreprise");
  if (input.quoteId !== undefined) {
    if (!isSelf) throw forbidden("Chaque entreprise rattache son propre devis");
    if (input.quoteId) {
      const q = isUuid(input.quoteId) ? await one(ctx.db, "SELECT 1 FROM quotes WHERE id=$1 AND org_id=$2", [input.quoteId, ctx.orgId]) : null;
      if (!q) throw badRequest("Devis introuvable");
    }
    await ctx.db.query("UPDATE renovation_participants SET quote_id=$2 WHERE id=$1", [participantId, input.quoteId || null]);
  }
  if (input.start !== undefined || input.end !== undefined) {
    if (!isPilot) throw forbidden("Le pilote fixe l'enchaînement des interventions");
    const iso = (v?: string) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);
    const [start, end] = [iso(input.start), iso(input.end)];
    if (start && end && end < start) throw badRequest("La fin doit suivre le début");
    await ctx.db.query("UPDATE renovation_participants SET start_date=$2, end_date=$3 WHERE id=$1", [participantId, start, end]);
  }
  if (input.trade !== undefined && isPilot) await ctx.db.query("UPDATE renovation_participants SET trade=$2 WHERE id=$1", [participantId, trade(input.trade)]);
  if (input.amount !== undefined) {
    if (!isPilot || r.status !== "externe") throw forbidden("Le montant se saisit seulement pour une entreprise hors application");
    let amount: number | null;
    try {
      amount = parseEuros(input.amount);
    } catch (e) {
      throw badRequest((e as Error).message);
    }
    await ctx.db.query("UPDATE renovation_participants SET amount_ttc_cents=$2 WHERE id=$1", [participantId, amount]);
  }
  await ctx.db.query("UPDATE renovation_projects SET updated_at=now() WHERE id=$1", [r.project_id]);
  return r.project_id;
}

export async function removeRenovationParticipant(ctx: Ctx, participantId: string) {
  requireWritable(ctx);
  const r = isUuid(participantId)
    ? await one<{ project_id: string }>(
        ctx.db,
        `DELETE FROM renovation_participants r USING renovation_projects p
         WHERE r.id=$1 AND p.id=r.project_id AND p.org_id=$2 AND r.status <> 'pilote' RETURNING r.project_id`,
        [participantId, ctx.orgId],
      )
    : null;
  if (!r) throw notFound("Entreprise introuvable dans ce dossier");
  return r.project_id;
}

/** Lien unique pour le client : un nouveau lien remplace l'ancien. */
export async function shareRenovation(ctx: Ctx, id: string): Promise<string> {
  await pilotProject(ctx, id);
  const token = randomToken(24);
  await ctx.db.query("UPDATE renovation_projects SET token_hash=$2, updated_at=now() WHERE id=$1", [id, sha256(token)]);
  await audit(ctx.db, { orgId: ctx.orgId, userId: ctx.userId, action: "renovation.share", target: id });
  return appUrl(`/renovation/${token}`);
}

/** Dossier vu par le client : toutes les entreprises, leurs devis, l'enchaînement et un seul interlocuteur. */
export async function publicRenovation(db: Queryable, token: string) {
  if (!/^[A-Za-z0-9_-]{20,80}$/.test(token)) return null;
  const p = await one<Record<string, unknown>>(
    db,
    `SELECT p.id, p.title, p.site, ${ORG_NAME} AS pilot, o.phone, o.email FROM renovation_projects p JOIN organizations o ON o.id=p.org_id WHERE p.token_hash=$1`,
    [sha256(token)],
  );
  if (!p) return null;
  const list = await participants(db, String(p.id), { orgId: null, pilot: true });
  const summary = dossierSummary(list);
  return {
    title: String(p.title),
    site: String(p.site ?? ""),
    pilot: { name: String(p.pilot), phone: String(p.phone ?? ""), email: String(p.email ?? "") },
    participants: summary.participants.map((x) => ({ ...x, tradeLabel: tradeLabel(x.trade), quoteId: undefined })),
    summary,
  };
}

/** Devis de l'entreprise rattachables à son lot. */
export async function myQuoteOptions(ctx: Ctx) {
  return ctx.db.query<{ id: string; number: string | null; title: string; status: string }>(
    "SELECT id, number, title, status FROM quotes WHERE org_id=$1 AND archived_at IS NULL ORDER BY created_at DESC LIMIT 200",
    [ctx.orgId],
  );
}
