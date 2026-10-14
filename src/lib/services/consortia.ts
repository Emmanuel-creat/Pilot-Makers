/** Groupements d'entreprises sur un devis : cotraitants du réseau ou extérieurs, répartition des lots, convention. */

import { draftToCalcInput } from "@/lib/calc/draft";
import { computeQuote } from "@/lib/calc/engine";
import { one } from "@/lib/db";
import { badRequest, conflict, isUuid, notFound } from "@/lib/http";
import { allocate, conventionClauses, consortiumIssues, type ConsortiumForm, type MemberStatus } from "@/lib/consortium";
import { validateSiret } from "@/lib/validation/identifiers";
import type { Ctx } from "./context";
import { audit, requireWritable } from "./context";
import { notifyOrg } from "./push";
import { getDraft } from "./quotes";

const ORG_NAME = "coalesce(nullif(o.trade_name, ''), nullif(o.legal_name, ''), 'Entreprise')";

interface MemberRow {
  id: string;
  org_id: string | null;
  name: string;
  siret: string;
  trade: string;
  status: MemberStatus;
  section_ids: string[];
}

async function sectionsOf(ctx: Ctx, quoteId: string) {
  const d = await getDraft(ctx, quoteId);
  const calc = computeQuote(draftToCalcInput(d, false));
  const sections = d.sections.map((s) => ({ id: s.id, title: s.title, subtotalCents: calc.sections.find((c) => c.id === s.id)?.subtotalCents ?? 0 }));
  return { draft: d, sections, totalHtCents: calc.totalHtCents };
}

async function ownConsortium(ctx: Ctx, id: string) {
  if (!isUuid(id)) throw notFound("Groupement introuvable");
  const c = await one<{ id: string; quote_id: string }>(ctx.db, "SELECT id, quote_id FROM consortia WHERE id=$1 AND org_id=$2", [id, ctx.orgId]);
  if (!c) throw notFound("Groupement introuvable");
  return c;
}

/** Vue du mandataire : groupement du devis (ou null), répartition, points à régler, convention, confrères possibles. */
export async function quoteConsortium(ctx: Ctx, quoteId: string) {
  if (!isUuid(quoteId)) throw notFound("Devis introuvable");
  const { draft, sections, totalHtCents } = await sectionsOf(ctx, quoteId);
  const c = await one<{ id: string; form: ConsortiumForm; mandataire_solidaire: boolean }>(
    ctx.db,
    "SELECT id, form, mandataire_solidaire FROM consortia WHERE quote_id=$1 AND org_id=$2",
    [quoteId, ctx.orgId],
  );
  const candidates = await ctx.db.query<{ org_id: string; name: string; trade: string }>(
    `SELECT DISTINCT o.id AS org_id, ${ORG_NAME} AS name, o.trade FROM network_members mine
     JOIN network_members other ON other.network_id=mine.network_id AND other.org_id<>mine.org_id
     JOIN organizations o ON o.id=other.org_id WHERE mine.org_id=$1 ORDER BY 2`,
    [ctx.orgId],
  );
  if (!c) return { quote: draft, sections, totalHtCents, consortium: null, candidates };
  const members = await ctx.db.query<MemberRow>(
    "SELECT id, org_id, name, siret, trade, status, section_ids FROM consortium_members WHERE consortium_id=$1 ORDER BY (status='mandataire') DESC, created_at",
    [c.id],
  );
  const lots = members.map((m) => ({ id: m.id, name: m.name, status: m.status, sectionIds: m.section_ids }));
  const mandataire = members.find((m) => m.status === "mandataire")?.name ?? "";
  const taken = new Set(members.map((m) => m.org_id));
  return {
    quote: draft,
    sections,
    totalHtCents,
    consortium: {
      id: c.id,
      form: c.form,
      mandataireSolidaire: c.mandataire_solidaire,
      members: members.map((m) => ({ id: m.id, orgId: m.org_id, name: m.name, siret: m.siret, trade: m.trade, status: m.status, sectionIds: m.section_ids })),
      shares: allocate(sections, lots, totalHtCents),
      issues: consortiumIssues(sections, lots),
      clauses: conventionClauses(c.form, c.mandataire_solidaire, mandataire, draft.title || "travaux"),
    },
    candidates: candidates.filter((x) => !taken.has(x.org_id)),
  };
}

export async function createConsortium(ctx: Ctx, quoteId: string, form: string, mandataireSolidaire: boolean) {
  requireWritable(ctx);
  if (form !== "conjoint" && form !== "solidaire") throw badRequest("Choisissez la forme du groupement");
  const { sections } = await sectionsOf(ctx, quoteId);
  const org = await one<{ name: string; siret: string; trade: string }>(
    ctx.db,
    `SELECT ${ORG_NAME} AS name, o.siret, o.trade FROM organizations o WHERE o.id=$1`,
    [ctx.orgId],
  );
  return ctx.db.transaction(async (tx) => {
    const exists = await one(tx, "SELECT 1 FROM consortia WHERE quote_id=$1", [quoteId]);
    if (exists) throw conflict("Ce devis a déjà un groupement");
    const c = await one<{ id: string }>(tx, "INSERT INTO consortia (org_id, quote_id, form, mandataire_solidaire) VALUES ($1,$2,$3,$4) RETURNING id", [
      ctx.orgId,
      quoteId,
      form,
      form === "solidaire" ? true : mandataireSolidaire,
    ]);
    await tx.query("INSERT INTO consortium_members (consortium_id, org_id, name, siret, trade, status, section_ids) VALUES ($1,$2,$3,$4,$5,'mandataire',$6)", [
      c!.id,
      ctx.orgId,
      org?.name ?? "",
      org?.siret ?? "",
      org?.trade ?? "",
      sections.map((s) => s.id),
    ]);
    await audit(tx, { orgId: ctx.orgId, userId: ctx.userId, action: "quote.consortium", target: quoteId, data: { form }, ip: ctx.ip });
    return c!.id;
  });
}

/** Ajout d'un cotraitant : un confrère d'un réseau commun (invité dans l'application) ou une entreprise extérieure. */
export async function addConsortiumMember(ctx: Ctx, consortiumId: string, input: { orgId?: string; name?: string; siret?: string; trade?: string }) {
  requireWritable(ctx);
  const c = await ownConsortium(ctx, consortiumId);
  if (input.orgId) {
    if (!isUuid(input.orgId) || input.orgId === ctx.orgId) throw badRequest("Confrère invalide");
    const peer = await one<{ name: string; siret: string; trade: string }>(
      ctx.db,
      `SELECT ${ORG_NAME} AS name, o.siret, o.trade FROM organizations o WHERE o.id=$2 AND EXISTS (
         SELECT 1 FROM network_members a JOIN network_members b ON b.network_id=a.network_id WHERE a.org_id=$1 AND b.org_id=$2)`,
      [ctx.orgId, input.orgId],
    );
    if (!peer) throw badRequest("Ce confrère ne fait partie d'aucun de vos réseaux");
    const r = await ctx.db.query(
      `INSERT INTO consortium_members (consortium_id, org_id, name, siret, trade, status) VALUES ($1,$2,$3,$4,$5,'invite')
       ON CONFLICT (consortium_id, org_id) DO NOTHING RETURNING id`,
      [consortiumId, input.orgId, peer.name, peer.siret, peer.trade],
    );
    if (!r.length) throw conflict("Ce confrère fait déjà partie du groupement");
    const me = await one<{ name: string }>(ctx.db, `SELECT ${ORG_NAME} AS name FROM organizations o WHERE o.id=$1`, [ctx.orgId]);
    await notifyOrg(ctx.db, input.orgId, {
      title: "Invitation dans un groupement d'entreprises",
      body: `${me?.name ?? "Un confrère"} vous propose de répondre ensemble à un chantier.`,
      url: "/app/groupements",
    });
    return c.quote_id;
  }
  const name = (input.name ?? "").trim();
  if (name.length < 2 || name.length > 160) throw badRequest("Indiquez la raison sociale du cotraitant");
  const siret = (input.siret ?? "").replace(/\s/g, "");
  if (siret) {
    const e = validateSiret(siret);
    if (e) throw badRequest(e);
  }
  await ctx.db.query("INSERT INTO consortium_members (consortium_id, name, siret, trade, status) VALUES ($1,$2,$3,$4,'externe')", [
    consortiumId,
    name,
    siret,
    (input.trade ?? "").trim().slice(0, 120),
  ]);
  return c.quote_id;
}

/** Attribue un lot du devis à un membre (un lot n'a qu'une entreprise). */
export async function assignLot(ctx: Ctx, consortiumId: string, sectionId: string, memberId: string) {
  requireWritable(ctx);
  const c = await ownConsortium(ctx, consortiumId);
  const { sections } = await sectionsOf(ctx, c.quote_id);
  if (!sections.some((s) => s.id === sectionId)) throw badRequest("Lot inconnu");
  if (!isUuid(memberId)) throw badRequest("Membre inconnu");
  const m = await one<{ status: MemberStatus }>(ctx.db, "SELECT status FROM consortium_members WHERE id=$1 AND consortium_id=$2", [memberId, consortiumId]);
  if (!m) throw badRequest("Membre inconnu");
  if (m.status === "refuse") throw conflict("Ce membre a refusé de participer");
  await ctx.db.transaction(async (tx) => {
    await tx.query("UPDATE consortium_members SET section_ids = array_remove(section_ids, $2) WHERE consortium_id=$1", [consortiumId, sectionId]);
    await tx.query("UPDATE consortium_members SET section_ids = array_append(section_ids, $2) WHERE id=$1", [memberId, sectionId]);
  });
  return c.quote_id;
}

/** Retire un cotraitant ; ses lots reviennent au mandataire. */
export async function removeConsortiumMember(ctx: Ctx, consortiumId: string, memberId: string) {
  requireWritable(ctx);
  const c = await ownConsortium(ctx, consortiumId);
  if (!isUuid(memberId)) throw notFound("Membre introuvable");
  await ctx.db.transaction(async (tx) => {
    const m = await one<{ status: MemberStatus; section_ids: string[] }>(
      tx,
      "DELETE FROM consortium_members WHERE id=$1 AND consortium_id=$2 AND status <> 'mandataire' RETURNING status, section_ids",
      [memberId, consortiumId],
    );
    if (!m) throw notFound("Membre introuvable");
    if (m.section_ids.length) {
      await tx.query("UPDATE consortium_members SET section_ids = section_ids || $2::text[] WHERE consortium_id=$1 AND status='mandataire'", [
        consortiumId,
        m.section_ids,
      ]);
    }
  });
  return c.quote_id;
}

/** Groupements auxquels l'entreprise est invitée comme cotraitante. */
export async function myConsortiumInvitations(ctx: Ctx) {
  const rows = await ctx.db.query<Record<string, unknown>>(
    `SELECT m.id, m.status, m.section_ids, c.id AS consortium_id, c.form, c.quote_id, q.title, ${ORG_NAME} AS mandataire
     FROM consortium_members m JOIN consortia c ON c.id=m.consortium_id JOIN quotes q ON q.id=c.quote_id JOIN organizations o ON o.id=c.org_id
     WHERE m.org_id=$1 AND m.status IN ('invite', 'accepte', 'refuse') ORDER BY m.created_at DESC LIMIT 100`,
    [ctx.orgId],
  );
  const out = [];
  for (const r of rows) {
    const lots = await ctx.db.query<{ title: string }>("SELECT title FROM quote_sections WHERE quote_id=$1 AND id::text = ANY($2::text[]) ORDER BY position", [
      r.quote_id,
      r.section_ids,
    ]);
    out.push({
      id: String(r.id),
      status: r.status as MemberStatus,
      form: r.form as ConsortiumForm,
      title: String(r.title),
      mandataire: String(r.mandataire),
      lots: lots.map((s) => s.title || "Lot sans titre"),
    });
  }
  return out;
}

export async function answerConsortiumInvitation(ctx: Ctx, memberId: string, accept: boolean) {
  requireWritable(ctx);
  if (!isUuid(memberId)) throw notFound("Invitation introuvable");
  const r = await one<{ org_id: string; quote_id: string }>(
    ctx.db,
    `UPDATE consortium_members m SET status=$3, answered_at=now() FROM consortia c
     WHERE m.id=$1 AND m.org_id=$2 AND m.status='invite' AND c.id=m.consortium_id RETURNING c.org_id, c.quote_id`,
    [memberId, ctx.orgId, accept ? "accepte" : "refuse"],
  );
  if (!r) throw conflict("Cette invitation n'attend plus de réponse");
  const me = await one<{ name: string }>(ctx.db, `SELECT ${ORG_NAME} AS name FROM organizations o WHERE o.id=$1`, [ctx.orgId]);
  await notifyOrg(ctx.db, r.org_id, {
    title: accept ? "Cotraitant engagé dans le groupement" : "Cotraitant indisponible",
    body: `${me?.name ?? "Votre confrère"} ${accept ? "accepte" : "décline"} de participer au groupement.`,
    url: `/app/devis/${r.quote_id}/groupement`,
  });
}
