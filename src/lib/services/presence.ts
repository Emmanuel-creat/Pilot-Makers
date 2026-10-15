/**
 * Édition à plusieurs d'un même devis : chaque éditeur ouvert signale sa présence toutes les quelques
 * secondes et reçoit en retour la liste des autres personnes présentes et la révision enregistrée,
 * pour reprendre leurs modifications sans recharger la page.
 */

import { one } from "@/lib/db";
import { isUuid } from "@/lib/http";
import type { Ctx } from "./context";
import { getQuoteRow } from "./quotes";

/** Au-delà, une personne qui n'a plus signalé sa présence (onglet fermé, réseau coupé) n'est plus affichée. */
export const PRESENCE_TTL_SECONDS = 30;

export interface Collaborator {
  userId: string;
  name: string;
  sectionId: string;
}

export async function heartbeat(ctx: Ctx, quoteId: string, sectionId: string): Promise<{ others: Collaborator[]; draftRevision: number }> {
  const q = await getQuoteRow(ctx.db, ctx, quoteId);
  const section = isUuid(sectionId) ? sectionId : "";
  await ctx.db.query(
    `INSERT INTO quote_presence (quote_id, user_id, org_id, section_id, seen_at) VALUES ($1,$2,$3,$4,now())
     ON CONFLICT (quote_id, user_id) DO UPDATE SET section_id=$4, seen_at=now()`,
    [quoteId, ctx.userId, ctx.orgId, section],
  );
  const others = await ctx.db.query<{ user_id: string; name: string; email: string; section_id: string }>(
    `SELECT p.user_id, u.name, u.email, p.section_id FROM quote_presence p JOIN users u ON u.id=p.user_id
     WHERE p.quote_id=$1 AND p.org_id=$2 AND p.user_id<>$3 AND p.seen_at > now() - make_interval(secs => $4)
     ORDER BY p.seen_at DESC`,
    [quoteId, ctx.orgId, ctx.userId, PRESENCE_TTL_SECONDS],
  );
  return {
    others: others.map((o) => ({ userId: o.user_id, name: o.name || o.email.split("@")[0], sectionId: o.section_id })),
    draftRevision: Number(q.draft_revision),
  };
}

/** L'éditeur se ferme : la personne disparaît tout de suite de la liste des autres. */
export async function leave(ctx: Ctx, quoteId: string) {
  await getQuoteRow(ctx.db, ctx, quoteId);
  await ctx.db.query("DELETE FROM quote_presence WHERE quote_id=$1 AND user_id=$2 AND org_id=$3", [quoteId, ctx.userId, ctx.orgId]);
}

/** Nombre de personnes présentes, pour les tests et l'administration. */
export async function presentCount(ctx: Ctx, quoteId: string): Promise<number> {
  const r = await one<{ n: unknown }>(
    ctx.db,
    "SELECT count(*) AS n FROM quote_presence WHERE quote_id=$1 AND org_id=$2 AND seen_at > now() - make_interval(secs => $3)",
    [quoteId, ctx.orgId, PRESENCE_TTL_SECONDS],
  );
  return Number(r?.n ?? 0);
}
