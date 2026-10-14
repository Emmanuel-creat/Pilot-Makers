/** Veille réglementaire de l'entreprise : évolutions à lire, alertes et accusé de lecture. */

import { one } from "@/lib/db";
import { WATCH, pendingAlerts } from "@/lib/regulatory-watch";
import { badRequest } from "@/lib/http";
import type { Ctx } from "./context";
import { requireWritable } from "./context";
import { parisDate } from "./quotes";

async function seenIds(ctx: Ctx): Promise<string[]> {
  const r = await one<{ regulatory_seen: string[] | null }>(ctx.db, "SELECT regulatory_seen FROM organizations WHERE id=$1", [ctx.orgId]);
  return r?.regulatory_seen ?? [];
}

export async function regulatoryWatch(ctx: Ctx, today = parisDate(new Date())) {
  const seen = await seenIds(ctx);
  const alerts = pendingAlerts(WATCH, seen, today).map((e) => e.id);
  return {
    today,
    entries: [...WATCH].filter((e) => e.published <= today).sort((a, b) => b.effective.localeCompare(a.effective)),
    seen,
    alerts,
  };
}

export async function regulatoryAlertCount(ctx: Ctx, today = parisDate(new Date())) {
  return pendingAlerts(WATCH, await seenIds(ctx), today).length;
}

/** Marque une évolution, ou toutes, comme lues pour toute l'entreprise. */
export async function markWatchRead(ctx: Ctx, id: string | "tout") {
  requireWritable(ctx);
  const ids = id === "tout" ? WATCH.map((e) => e.id) : [id];
  if (!ids.every((x) => WATCH.some((e) => e.id === x))) throw badRequest("Évolution inconnue");
  await ctx.db.query("UPDATE organizations SET regulatory_seen = ARRAY(SELECT DISTINCT unnest(regulatory_seen || $2::text[])) WHERE id=$1", [ctx.orgId, ids]);
}
