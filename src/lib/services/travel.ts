/** Indemnités de déplacement : barème de l'entreprise et calcul mensuel par salarié depuis le pointage. */

import { num, one } from "@/lib/db";
import { badRequest } from "@/lib/http";
import { monthAllowance, readRates, ZONE_COUNT, zoneFor, type MonthAllowance, type TravelRates, type Zone } from "@/lib/travel";
import type { Ctx } from "./context";
import { audit, requirePermission, requireWritable } from "./context";
import { monthRange } from "./planning-dates";
import { eurosToCents } from "./pricing";
import { haversineKm } from "./routes";
import { memberCosts } from "./timesheets";

export async function getTravelRates(ctx: Ctx): Promise<TravelRates> {
  requirePermission(ctx, "staff");
  const r = await one<{ travel_rates: unknown }>(ctx.db, "SELECT travel_rates FROM organizations WHERE id=$1", [ctx.orgId]);
  return readRates(r?.travel_rates);
}

/** Champs attendus : meal, grand, transport1..5, trip1..5 (en euros). */
export async function saveTravelRates(ctx: Ctx, input: Record<string, string>): Promise<TravelRates> {
  requirePermission(ctx, "staff");
  requireWritable(ctx);
  const cents = (key: string, label: string) => {
    const v = String(input[key] ?? "").trim();
    if (!v) return 0;
    let c: number;
    try {
      c = eurosToCents(v, label);
    } catch (e) {
      throw badRequest((e as Error).message);
    }
    if (c < 0 || c > 100000) throw badRequest(`${label} : montant entre 0 et 1 000 €`);
    return c;
  };
  const rates: TravelRates = {
    meal: cents("meal", "Indemnité de repas"),
    grand: cents("grand", "Indemnité de grand déplacement"),
    zones: Array.from({ length: ZONE_COUNT }, (_, i) => ({
      transport: cents(`transport${i + 1}`, `Transport zone ${i + 1}`),
      trip: cents(`trip${i + 1}`, `Trajet zone ${i + 1}`),
    })),
  };
  await ctx.db.query("UPDATE organizations SET travel_rates=$2 WHERE id=$1", [ctx.orgId, JSON.stringify(rates)]);
  await audit(ctx.db, { orgId: ctx.orgId, userId: ctx.userId, action: "organization.travel_rates", data: rates, ip: ctx.ip });
  return rates;
}

export interface TravelRow extends MonthAllowance {
  userId: string;
  name: string;
}

export interface TravelMonth {
  rows: TravelRow[];
  rates: TravelRates;
  /** Position du siège ou du dépôt connue : sans elle, aucune zone ne peut être calculée */
  originKnown: boolean;
}

/**
 * Indemnités du mois par salarié, sur les heures validées. Le chantier retenu pour un jour est celui
 * où le salarié a passé le plus de temps ; sa zone se mesure à vol d'oiseau depuis le dépôt.
 */
export async function travelAllowances(ctx: Ctx, month: string): Promise<TravelMonth> {
  requirePermission(ctx, "staff");
  if (!/^\d{4}-\d{2}$/.test(month)) throw badRequest("Mois invalide");
  const { from, to } = monthRange(`${month}-01`);
  const [rates, org, rows, costs] = await Promise.all([
    getTravelRates(ctx),
    one<{ latitude: unknown; longitude: unknown }>(ctx.db, "SELECT latitude, longitude FROM organizations WHERE id=$1", [ctx.orgId]),
    ctx.db.query<{ user_id: string; work_date: unknown; job_id: string | null; minutes: unknown; latitude: unknown; longitude: unknown }>(
      `SELECT t.user_id, t.work_date, t.job_id, sum(t.minutes) AS minutes, j.latitude, j.longitude
       FROM time_entries t LEFT JOIN jobs j ON j.id=t.job_id AND j.org_id=t.org_id
       WHERE t.org_id=$1 AND t.work_date BETWEEN $2 AND $3 AND t.status='valide'
       GROUP BY t.user_id, t.work_date, t.job_id, j.latitude, j.longitude`,
      [ctx.orgId, from, to],
    ),
    memberCosts(ctx.db, ctx.orgId),
  ]);
  const origin = org?.latitude != null && org?.longitude != null ? { lat: num(org.latitude), lng: num(org.longitude) } : null;
  // Chantier principal de chaque jour : le plus d'heures.
  const best = new Map<string, { minutes: number; zone: Zone | null }>();
  for (const r of rows) {
    const date = r.work_date instanceof Date ? r.work_date.toISOString().slice(0, 10) : String(r.work_date).slice(0, 10);
    const key = `${r.user_id}|${date}`;
    const minutes = num(r.minutes);
    if (minutes <= 0) continue;
    const prev = best.get(key);
    if (prev && prev.minutes >= minutes) continue;
    const km = origin && r.latitude != null && r.longitude != null ? haversineKm(origin, { lat: num(r.latitude), lng: num(r.longitude) }) : null;
    best.set(key, { minutes, zone: zoneFor(km) });
  }
  const perUser = new Map<string, (Zone | null)[]>();
  for (const [key, v] of best) {
    const userId = key.split("|")[0];
    perUser.set(userId, [...(perUser.get(userId) ?? []), v.zone]);
  }
  const out: TravelRow[] = [...perUser].map(([userId, zones]) => ({ userId, name: costs.get(userId)?.name ?? "", ...monthAllowance(zones, rates) }));
  return { rows: out.sort((a, b) => a.name.localeCompare(b.name, "fr")), rates, originKnown: Boolean(origin) };
}
