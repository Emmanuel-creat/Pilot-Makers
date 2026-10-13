/**
 * Feuille de route publique : l'équipe annonce ce qu'elle étudie, prévoit, développe et livre ;
 * chaque utilisateur connecté peut soutenir un sujet (un vote par personne et par sujet, retirable).
 * Les votes sont anonymes : seul leur nombre est publié.
 */

import { z } from "zod";
import { one } from "@/lib/db";
import type { Queryable } from "@/lib/db";
import { badRequest, conflict, isUuid, notFound } from "@/lib/http";
import { requirePlatformAdmin } from "./admin";
import type { Ctx } from "./context";
import { audit } from "./context";

export const ROADMAP_STATUSES = {
  idee: "À l'étude",
  prevu: "Prévu",
  en_cours: "En cours",
  livre: "Livré",
} as const;
export type RoadmapStatus = keyof typeof ROADMAP_STATUSES;

export interface RoadmapItem {
  id: string;
  title: string;
  description: string;
  status: RoadmapStatus;
  delivered_on: string | null;
  votes: number;
  /** Vote de la personne connectée */
  voted?: boolean;
}

const itemSchema = z.object({
  title: z.string().trim().min(3, "Titre requis").max(140),
  description: z.string().trim().max(2000).default(""),
  status: z.enum(["idee", "prevu", "en_cours", "livre"]).default("idee"),
});

function mapRow(r: Record<string, unknown>): RoadmapItem {
  const d = r.delivered_on;
  return {
    id: String(r.id),
    title: String(r.title),
    description: String(r.description ?? ""),
    status: r.status as RoadmapStatus,
    delivered_on: d instanceof Date ? d.toISOString().slice(0, 10) : d ? String(d).slice(0, 10) : null,
    votes: Number(r.votes ?? 0),
    ...(r.voted === undefined ? {} : { voted: Boolean(r.voted) }),
  };
}

/** Sujets classés : en cours, prévus, à l'étude (les plus soutenus d'abord), puis les dernières livraisons. */
export async function listRoadmap(q: Queryable, userId?: string | null): Promise<RoadmapItem[]> {
  const rows = await q.query<Record<string, unknown>>(
    `SELECT i.id, i.title, i.description, i.status, i.delivered_on,
            (SELECT count(*) FROM roadmap_votes v WHERE v.item_id=i.id) AS votes
            ${userId ? ", EXISTS (SELECT 1 FROM roadmap_votes v WHERE v.item_id=i.id AND v.user_id=$1) AS voted" : ""}
     FROM roadmap_items i
     WHERE i.status<>'livre' OR i.delivered_on >= current_date - 365`,
    userId ? [userId] : [],
  );
  const order: RoadmapStatus[] = ["en_cours", "prevu", "idee", "livre"];
  return rows
    .map(mapRow)
    .sort((a, b) =>
      a.status !== b.status
        ? order.indexOf(a.status) - order.indexOf(b.status)
        : a.status === "livre"
          ? String(b.delivered_on).localeCompare(String(a.delivered_on))
          : b.votes - a.votes || a.title.localeCompare(b.title),
    );
}

export async function createRoadmapItem(ctx: Ctx, raw: unknown) {
  requirePlatformAdmin(ctx);
  const p = itemSchema.safeParse(raw);
  if (!p.success) throw badRequest(p.error.issues[0].message);
  const r = await one<{ id: string }>(
    ctx.db,
    "INSERT INTO roadmap_items (title, description, status, delivered_on, created_by) VALUES ($1,$2,$3,$4,$5) RETURNING id",
    [p.data.title, p.data.description, p.data.status, p.data.status === "livre" ? new Date().toISOString().slice(0, 10) : null, ctx.userId],
  );
  await audit(ctx.db, { userId: ctx.userId, action: "admin.roadmap_create", target: r!.id, data: { title: p.data.title }, ip: ctx.ip });
  return r!.id;
}

export async function setRoadmapStatus(ctx: Ctx, id: string, status: string) {
  requirePlatformAdmin(ctx);
  if (!isUuid(id)) throw notFound("Sujet introuvable");
  if (!(status in ROADMAP_STATUSES)) throw badRequest("Statut inconnu");
  const r = await ctx.db.query(
    `UPDATE roadmap_items SET status=$2, delivered_on=CASE WHEN $2='livre' THEN coalesce(delivered_on, current_date) ELSE NULL END, updated_at=now()
     WHERE id=$1 RETURNING id`,
    [id, status],
  );
  if (!r.length) throw notFound("Sujet introuvable");
  await audit(ctx.db, { userId: ctx.userId, action: "admin.roadmap_status", target: id, data: { status }, ip: ctx.ip });
}

export async function deleteRoadmapItem(ctx: Ctx, id: string) {
  requirePlatformAdmin(ctx);
  if (!isUuid(id)) throw notFound("Sujet introuvable");
  const r = await ctx.db.query("DELETE FROM roadmap_items WHERE id=$1 RETURNING id", [id]);
  if (!r.length) throw notFound("Sujet introuvable");
  await audit(ctx.db, { userId: ctx.userId, action: "admin.roadmap_delete", target: id, ip: ctx.ip });
}

/** Soutien d'un sujet par la personne connectée, ou retrait de son vote. Un sujet livré ne se vote plus. */
export async function toggleVote(ctx: Ctx, id: string): Promise<{ voted: boolean; votes: number }> {
  if (!isUuid(id)) throw notFound("Sujet introuvable");
  const item = await one<{ status: string }>(ctx.db, "SELECT status FROM roadmap_items WHERE id=$1", [id]);
  if (!item) throw notFound("Sujet introuvable");
  if (item.status === "livre") throw conflict("Ce sujet est déjà livré");
  const removed = await ctx.db.query("DELETE FROM roadmap_votes WHERE item_id=$1 AND user_id=$2 RETURNING item_id", [id, ctx.userId]);
  if (!removed.length) await ctx.db.query("INSERT INTO roadmap_votes (item_id, user_id) VALUES ($1,$2) ON CONFLICT DO NOTHING", [id, ctx.userId]);
  const n = await one<{ n: unknown }>(ctx.db, "SELECT count(*) AS n FROM roadmap_votes WHERE item_id=$1", [id]);
  return { voted: !removed.length, votes: Number(n?.n ?? 0) };
}
