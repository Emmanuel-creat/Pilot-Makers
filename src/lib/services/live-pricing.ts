/** Devis vivant : comparaison des lignes au catalogue actuel et actualisation avec l'accord de l'artisan. */

import { price4ToInput } from "@/lib/calc/format";
import { num } from "@/lib/db";
import { badRequest, conflict } from "@/lib/http";
import { LIVE_STATUSES, expiredPrices, priceChanges, type LiveLine } from "@/lib/live-pricing";
import type { Ctx } from "./context";
import { requirePermission } from "./context";
import { EDITABLE_STATUSES } from "./quote-types";
import { addEvent, createRevision, getDraft, parisDate, saveDraft } from "./quotes";

async function liveLines(ctx: Ctx, quoteId: string) {
  const draft = await getDraft(ctx, quoteId);
  const lines = draft.sections.flatMap((s) => s.lines).filter((l) => l.kind === "item" && l.catalogItemId && !l.signed);
  const ids = [...new Set(lines.map((l) => l.catalogItemId!))];
  const rows = ids.length
    ? await ctx.db.query<{ id: string; unit_price4: unknown; unit_cost4: unknown; valid: string | null }>(
        "SELECT id, unit_price4, unit_cost4, to_char(price_valid_until, 'YYYY-MM-DD') AS valid FROM catalog_items WHERE org_id=$1 AND id = ANY($2::uuid[])",
        [ctx.orgId, ids],
      )
    : [];
  const byId = new Map(rows.map((r) => [r.id, r]));
  const live: LiveLine[] = lines.flatMap((l) => {
    const c = byId.get(l.catalogItemId!);
    if (!c) return [];
    return [
      {
        id: l.id,
        label: l.label,
        unitPrice: l.unitPrice,
        unitCost: l.unitCost,
        catalogPrice4: num(c.unit_price4),
        catalogCost4: c.unit_cost4 == null ? null : num(c.unit_cost4),
        priceValidUntil: c.valid,
      },
    ];
  });
  return { draft, live };
}

/** Écarts entre le devis et le catalogue actuel ; vide une fois le devis signé ou clos. */
export async function livePrices(ctx: Ctx, quoteId: string, now = new Date()) {
  const { draft, live } = await liveLines(ctx, quoteId);
  if (!(LIVE_STATUSES as readonly string[]).includes(draft.status)) return { status: draft.status, changes: [], expired: [], needsRevision: false };
  return {
    status: draft.status,
    changes: priceChanges(live),
    expired: expiredPrices(live, parisDate(now)),
    needsRevision: !EDITABLE_STATUSES.includes(draft.status),
  };
}

/**
 * Applique les prix actuels du catalogue aux lignes choisies. Un devis déjà émis repasse en
 * brouillon (nouvelle version à émettre et à renvoyer) : le client n'est jamais engagé sur un prix
 * qu'il n'a pas vu.
 */
export async function applyLivePrices(ctx: Ctx, quoteId: string, lineIds: string[]) {
  if (!lineIds.length) throw badRequest("Choisissez au moins une ligne à actualiser");
  const before = await livePrices(ctx, quoteId);
  if (!(LIVE_STATUSES as readonly string[]).includes(before.status)) throw conflict("Ce devis est signé ou clos : ses prix ne changent plus");
  const chosen = before.changes.filter((c) => lineIds.includes(c.lineId));
  if (!chosen.length) throw badRequest("Aucun prix à actualiser sur ces lignes");
  const costs = chosen.some((c) => c.newCost4 !== null && c.oldCost4 !== null && c.newCost4 !== c.oldCost4);
  if (costs) requirePermission(ctx, "costs");
  if (before.needsRevision) await createRevision(ctx, quoteId);
  const draft = await getDraft(ctx, quoteId);
  const byLine = new Map(chosen.map((c) => [c.lineId, c]));
  const sections = draft.sections.map((s) => ({
    ...s,
    lines: s.lines.map((l) => {
      const c = byLine.get(l.id);
      if (!c) return l;
      return { ...l, unitPrice: price4ToInput(c.newPrice4), unitCost: c.newCost4 !== null && l.unitCost ? price4ToInput(c.newCost4) : l.unitCost };
    }),
  }));
  await saveDraft(ctx, quoteId, { ...draft, sections }, draft.draftRevision);
  await addEvent(ctx.db, ctx, quoteId, null, "prices.refreshed", {
    lines: chosen.map((c) => ({ label: c.label, from: c.oldPrice4, to: c.newPrice4 })),
  });
  return { revised: before.needsRevision, updated: chosen.length };
}
