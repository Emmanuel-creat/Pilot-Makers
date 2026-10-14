/**
 * Estimation de la durée du chantier et de l'équipe pour les lignes d'un devis en cours de saisie.
 */

import { z } from "zod";
import { parseScaled } from "@/lib/calc/decimal";
import { num, one } from "@/lib/db";
import { estimateDuration, type LaborLine } from "@/lib/duration-estimate";
import { badRequest, isUuid } from "@/lib/http";
import type { Ctx } from "./context";
import { readPricing } from "./pricing";

const lineSchema = z.object({
  kind: z.string().optional(),
  catalogItemId: z.string().nullable().optional(),
  nature: z.string().optional(),
  label: z.string().max(500).default(""),
  quantity: z.string().max(40).default(""),
  unit: z.string().max(40).default(""),
  unitPrice: z.string().max(40).default(""),
  unitCost: z.string().max(40).default(""),
  discountPercent: z.string().max(20).default(""),
  optional: z.boolean().optional(),
});
const bodySchema = z.object({ lines: z.array(lineSchema).max(2000) });

function scaled(text: string, digits: number) {
  try {
    return Number(parseScaled(text.replace(/[\s€%]/g, "") || "0", digits));
  } catch {
    return 0;
  }
}

export async function estimateLinesDuration(ctx: Ctx, raw: unknown) {
  const p = bodySchema.safeParse(raw);
  if (!p.success) throw badRequest("Lignes du devis illisibles");
  const labor = p.data.lines.filter((l) => (l.kind ?? "item") === "item" && l.nature === "main_oeuvre" && !l.optional);
  const ids = [...new Set(labor.map((l) => l.catalogItemId).filter((x): x is string => !!x && isUuid(x)))];
  const items = ids.length
    ? await ctx.db.query<{ id: string; duration_minutes: unknown; hourly_cost4: unknown }>(
        "SELECT id, duration_minutes, hourly_cost4 FROM catalog_items WHERE org_id=$1 AND id = ANY($2::uuid[])",
        [ctx.orgId, ids],
      )
    : [];
  const byId = new Map(items.map((i) => [i.id, i]));
  const org = await one<{ pricing: unknown }>(ctx.db, "SELECT pricing FROM organizations WHERE id=$1", [ctx.orgId]);
  const rates = readPricing(org?.pricing).laborRates;
  const avg = (xs: number[]) => (xs.length ? Math.round(xs.reduce((a, x) => a + x, 0) / xs.length) : null);
  const rateCost = avg(rates.map((r) => r.costCents).filter((x) => x > 0));
  const ratePrice = avg(rates.map((r) => r.priceCents).filter((x) => x > 0));
  const team = await one<{ n: unknown }>(ctx.db, "SELECT count(*) AS n FROM memberships WHERE org_id=$1", [ctx.orgId]);
  const lines: LaborLine[] = labor.map((l) => {
    const qty = scaled(l.quantity, 3);
    const item = l.catalogItemId ? byId.get(l.catalogItemId) : undefined;
    const hourly4 = item?.hourly_cost4 == null ? null : num(item.hourly_cost4);
    // Montants en dix-millièmes d'euro par unité, ramenés en centimes pour la ligne entière.
    const cost = Math.round((scaled(l.unitCost, 4) * qty) / 1000 / 100);
    const gross = Math.round((scaled(l.unitPrice, 4) * qty) / 1000 / 100);
    const net = Math.round((gross * (10000 - scaled(l.discountPercent, 2))) / 10000);
    return {
      label: l.label,
      quantityMilli: qty,
      unit: l.unit,
      minutesPerUnit: item?.duration_minutes == null ? null : num(item.duration_minutes),
      costCents: cost,
      hourlyCostCents: hourly4 ? Math.round(hourly4 / 100) : rateCost,
      netCents: net,
      hourlyPriceCents: ratePrice,
    };
  });
  return { laborLines: lines.length, ...estimateDuration(lines, num(team?.n) || 1) };
}
