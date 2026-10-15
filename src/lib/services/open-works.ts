/** Base ouverte des ouvrages : publication, lecture publique, votes, signalements et reprise au catalogue. */

import type { Queryable } from "@/lib/db";
import { num, one } from "@/lib/db";
import { badRequest, forbidden, isUuid, notFound } from "@/lib/http";
import { authorLabel } from "@/lib/community";
import { HIDE_AFTER_REPORTS, LICENSE, WORK_TRADES, compositionText, workSchema } from "@/lib/open-works";
import { createItem } from "./catalog";
import type { Ctx } from "./context";
import { audit, requireWritable } from "./context";

export interface OpenWork {
  id: string;
  trade: string;
  tradeLabel: string;
  title: string;
  unit: string;
  description: string;
  composition: { label: string; quantity: string; unit: string }[];
  labourMinutes: number | null;
  refs: string;
  author: string;
  votes: number;
  imports: number;
  derivedFrom: string | null;
  createdAt: Date;
  updatedAt: Date;
}

const SELECT = `SELECT w.*, o.trade AS org_trade, o.postal_code, o.country,
    (SELECT count(*) FROM open_work_votes v WHERE v.work_id = w.id) AS votes,
    (SELECT count(*) FROM open_work_imports i WHERE i.work_id = w.id) AS imports
  FROM open_works w JOIN organizations o ON o.id = w.org_id`;

function map(r: Record<string, unknown>): OpenWork {
  return {
    id: String(r.id),
    trade: String(r.trade),
    tradeLabel: WORK_TRADES.find((t) => t.key === r.trade)?.label ?? String(r.trade),
    title: String(r.title),
    unit: String(r.unit),
    description: String(r.description),
    composition: (r.composition ?? []) as OpenWork["composition"],
    labourMinutes: r.labour_minutes == null ? null : num(r.labour_minutes),
    refs: String(r.refs ?? ""),
    author: authorLabel(String(r.org_trade ?? ""), String(r.postal_code ?? ""), String(r.country ?? "France")),
    votes: num(r.votes),
    imports: num(r.imports),
    derivedFrom: r.derived_from ? String(r.derived_from) : null,
    createdAt: r.created_at as Date,
    updatedAt: r.updated_at as Date,
  };
}

function parse(raw: unknown) {
  const p = workSchema.safeParse(raw);
  if (!p.success) throw badRequest(p.error.issues[0].message);
  return p.data;
}

export async function publishWork(ctx: Ctx, raw: unknown, derivedFrom: string | null = null): Promise<string> {
  requireWritable(ctx);
  const w = parse(raw);
  if (derivedFrom && !(isUuid(derivedFrom) && (await one(ctx.db, "SELECT 1 FROM open_works WHERE id=$1 AND NOT hidden", [derivedFrom])))) {
    throw notFound("Fiche d'origine introuvable");
  }
  const r = await one<{ id: string }>(
    ctx.db,
    `INSERT INTO open_works (org_id, user_id, trade, title, unit, description, composition, labour_minutes, refs, derived_from)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,
    [ctx.orgId, ctx.userId, w.trade, w.title, w.unit, w.description, JSON.stringify(w.composition), w.labourMinutes, w.refs, derivedFrom],
  );
  await audit(ctx.db, { orgId: ctx.orgId, userId: ctx.userId, action: "open_work.publish", target: r!.id });
  return r!.id;
}

/** Seule l'entreprise qui a publié la fiche la modifie ; les autres en publient une version dérivée. */
export async function updateWork(ctx: Ctx, id: string, raw: unknown) {
  requireWritable(ctx);
  const w = parse(raw);
  const owner = await one<{ org_id: string }>(ctx.db, "SELECT org_id FROM open_works WHERE id=$1", [isUuid(id) ? id : null]);
  if (!owner) throw notFound("Fiche introuvable");
  if (owner.org_id !== ctx.orgId) throw forbidden("Publiez une version dérivée pour proposer une autre façon de faire");
  await ctx.db.query(
    "UPDATE open_works SET trade=$2, title=$3, unit=$4, description=$5, composition=$6, labour_minutes=$7, refs=$8, updated_at=now() WHERE id=$1",
    [id, w.trade, w.title, w.unit, w.description, JSON.stringify(w.composition), w.labourMinutes, w.refs],
  );
}

/** Lecture publique, sans compte : la base est ouverte. */
export async function listWorks(q: Queryable, opts: { trade?: string; search?: string; limit?: number } = {}): Promise<OpenWork[]> {
  const where = ["NOT w.hidden"];
  const params: unknown[] = [];
  if (opts.trade && WORK_TRADES.some((t) => t.key === opts.trade)) where.push(`w.trade = $${params.push(opts.trade)}`);
  if (opts.search?.trim()) where.push(`(w.title ILIKE $${params.push(`%${opts.search.trim()}%`)} OR w.description ILIKE $${params.length})`);
  const rows = await q.query<Record<string, unknown>>(
    `${SELECT} WHERE ${where.join(" AND ")} ORDER BY votes DESC, w.created_at DESC LIMIT ${opts.limit ?? 200}`,
    params,
  );
  return rows.map(map);
}

export async function getWork(q: Queryable, id: string): Promise<OpenWork> {
  if (!isUuid(id)) throw notFound("Fiche introuvable");
  const r = await one<Record<string, unknown>>(q, `${SELECT} WHERE w.id=$1 AND NOT w.hidden`, [id]);
  if (!r) throw notFound("Fiche introuvable");
  return map(r);
}

export async function workContext(ctx: Ctx, id: string) {
  const r = await one<{ mine: boolean; voted: boolean; imported: string | null }>(
    ctx.db,
    `SELECT w.org_id = $2 AS mine,
            EXISTS (SELECT 1 FROM open_work_votes v WHERE v.work_id=w.id AND v.user_id=$3) AS voted,
            (SELECT i.item_id::text FROM open_work_imports i WHERE i.work_id=w.id AND i.org_id=$2) AS imported
       FROM open_works w WHERE w.id=$1`,
    [id, ctx.orgId, ctx.userId],
  );
  return { mine: !!r?.mine, voted: !!r?.voted, importedItemId: r?.imported ?? null };
}

export async function toggleWorkVote(ctx: Ctx, id: string): Promise<boolean> {
  const w = await one<{ org_id: string }>(ctx.db, "SELECT org_id FROM open_works WHERE id=$1 AND NOT hidden", [isUuid(id) ? id : null]);
  if (!w) throw notFound("Fiche introuvable");
  if (w.org_id === ctx.orgId) throw forbidden("Impossible de voter pour une fiche de votre entreprise");
  const removed = await ctx.db.query("DELETE FROM open_work_votes WHERE work_id=$1 AND user_id=$2 RETURNING work_id", [id, ctx.userId]);
  if (removed.length) return false;
  await ctx.db.query("INSERT INTO open_work_votes (work_id, user_id) VALUES ($1,$2)", [id, ctx.userId]);
  return true;
}

export async function reportWork(ctx: Ctx, id: string, reason: string): Promise<{ hidden: boolean }> {
  if (!["erreur_technique", "publicite", "copie", "autre"].includes(reason)) throw badRequest("Choisissez un motif");
  const w = await one<{ org_id: string }>(ctx.db, "SELECT org_id FROM open_works WHERE id=$1", [isUuid(id) ? id : null]);
  if (!w) throw notFound("Fiche introuvable");
  if (w.org_id === ctx.orgId) throw badRequest("Cette fiche vient de votre entreprise");
  await ctx.db.query("INSERT INTO open_work_reports (work_id, user_id, reason) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING", [id, ctx.userId, reason]);
  const n = await one<{ n: unknown }>(ctx.db, "SELECT count(*) AS n FROM open_work_reports WHERE work_id=$1", [id]);
  const hidden = num(n?.n) >= HIDE_AFTER_REPORTS;
  if (hidden) await ctx.db.query("UPDATE open_works SET hidden=true WHERE id=$1", [id]);
  return { hidden };
}

/** Reprend la fiche dans le catalogue de l'entreprise, prix à compléter. */
export async function importWork(ctx: Ctx, id: string): Promise<string> {
  const w = await getWork(ctx.db, id);
  const existing = await one<{ item_id: string | null }>(ctx.db, "SELECT item_id FROM open_work_imports WHERE work_id=$1 AND org_id=$2", [id, ctx.orgId]);
  if (existing?.item_id) throw badRequest("Cette fiche est déjà dans votre catalogue");
  const description = [
    w.description,
    compositionText(w.composition, w.unit),
    w.refs ? `Références : ${w.refs}.` : "",
    `Source : base ouverte des ouvrages (${LICENSE.name}).`,
  ]
    .filter(Boolean)
    .join("\n");
  const itemId = await createItem(
    ctx,
    {
      name: w.title,
      description: description.slice(0, 4000),
      category: "forfait",
      unit: w.unit,
      unit_price: "0",
      vat_percent: "10",
      duration_minutes: w.labourMinutes,
      tags: ["base ouverte"],
    },
    ctx.db,
    { source: "base_ouverte", sourceNote: w.id },
  );
  await ctx.db.query(
    "INSERT INTO open_work_imports (work_id, org_id, item_id) VALUES ($1,$2,$3) ON CONFLICT (work_id, org_id) DO UPDATE SET item_id=EXCLUDED.item_id, created_at=now()",
    [id, ctx.orgId, itemId],
  );
  return itemId;
}

/** Export ouvert (JSON) de toute la base, sans aucune donnée d'entreprise. */
export async function openDataExport(q: Queryable) {
  const works = await listWorks(q, { limit: 10000 });
  return {
    license: LICENSE,
    generatedAt: new Date().toISOString(),
    works: works.map((w) => ({
      id: w.id,
      trade: w.trade,
      title: w.title,
      unit: w.unit,
      description: w.description,
      composition: w.composition,
      labourMinutes: w.labourMinutes,
      references: w.refs,
      derivedFrom: w.derivedFrom,
      votes: w.votes,
      updatedAt: w.updatedAt,
    })),
  };
}
