/**
 * Itinéraires et temps de trajet : chaque chantier et le dépôt de l'entreprise reçoivent une position
 * (adresse géocodée par le service public de la Géoplateforme, ou position GPS relevée sur place).
 * Les trajets de la journée de chaque personne sont estimés à vol d'oiseau corrigé du détour routier,
 * dans un ordre conseillé (plus proche chantier d'abord), avec un lien vers l'application de navigation.
 */

import { one, type Queryable } from "@/lib/db";
import { badRequest } from "@/lib/http";
import type { Ctx } from "./context";
import { audit, can, requireWritable } from "./context";
import { getJob } from "./jobs";

export interface Point {
  lat: number;
  lng: number;
}

/** Détour moyen de la route par rapport à la ligne droite. */
export const ROAD_FACTOR = 1.3;

export function haversineKm(a: Point, b: Point): number {
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Distance routière estimée (km, une décimale). */
export function roadKm(a: Point, b: Point): number {
  return Math.round(haversineKm(a, b) * ROAD_FACTOR * 10) / 10;
}

/**
 * Durée estimée (minutes) : vitesse moyenne selon la distance (ville, route, voie rapide),
 * plus cinq minutes de stationnement et de déchargement dès qu'il y a déplacement.
 */
export function travelMinutes(km: number): number {
  if (km < 0.2) return 0;
  const speed = km < 10 ? 30 : km < 40 ? 50 : 75;
  return Math.round((km / speed) * 60 + 5);
}

export function formatMinutes(min: number): string {
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h} h ${String(m).padStart(2, "0")}` : `${h} h`;
}

function validPoint(lat: unknown, lng: unknown): Point | null {
  const a = Number(lat);
  const b = Number(lng);
  if (lat === null || lng === null || lat === "" || lng === "" || !Number.isFinite(a) || !Number.isFinite(b)) return null;
  if (Math.abs(a) > 90 || Math.abs(b) > 180 || (a === 0 && b === 0)) return null;
  return { lat: a, lng: b };
}

/* ------------------------------------------------------------------ */
/* Géocodage                                                           */
/* ------------------------------------------------------------------ */

export type Fetcher = (url: string, init?: RequestInit) => Promise<Response>;

const GEOCODER_URL = () => process.env.GEOCODER_URL || "https://data.geopf.fr/geocodage/search";

/** Position d'une adresse française ; null si introuvable, imprécise, ou si le service est désactivé. */
export async function geocode(address: string, fetcher: Fetcher = (u, i) => fetch(u, i)): Promise<(Point & { label: string }) | null> {
  const q = address.replace(/\s+/g, " ").trim();
  if (q.length < 5 || process.env.GEOCODER === "off") return null;
  try {
    const res = await fetcher(`${GEOCODER_URL()}?q=${encodeURIComponent(q.slice(0, 200))}&limit=1`, {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;
    const j = (await res.json()) as {
      features?: { geometry?: { coordinates?: [number, number] }; properties?: { label?: string; score?: number } }[];
    };
    const f = j.features?.[0];
    const c = f?.geometry?.coordinates;
    if (!c || (f?.properties?.score ?? 1) < 0.4) return null;
    const p = validPoint(c[1], c[0]);
    return p ? { ...p, label: String(f?.properties?.label ?? "").slice(0, 200) } : null;
  } catch {
    return null;
  }
}

function siteAddress(j: { site_line1: string; site_postal_code: string; site_city: string }) {
  return [j.site_line1, j.site_postal_code, j.site_city]
    .map((s) => s?.trim())
    .filter(Boolean)
    .join(" ");
}

/** Localise un chantier depuis son adresse. */
export async function locateJob(ctx: Ctx, jobId: string, fetcher?: Fetcher) {
  requireWritable(ctx);
  const { job } = await getJob(ctx, jobId);
  const address = siteAddress(job as never);
  if (!address) throw badRequest("Renseignez d'abord l'adresse du chantier");
  const p = await geocode(address, fetcher);
  if (!p) throw badRequest("Adresse introuvable : vérifiez-la, ou enregistrez la position depuis le chantier");
  await ctx.db.query("UPDATE jobs SET latitude=$3, longitude=$4, geo_source='adresse', geo_label=$5 WHERE id=$1 AND org_id=$2", [
    jobId,
    ctx.orgId,
    p.lat,
    p.lng,
    p.label,
  ]);
  return p;
}

/** Position relevée sur place par le téléphone : la plus fiable pour un chantier isolé. */
export async function setJobPosition(ctx: Ctx, jobId: string, lat: unknown, lng: unknown) {
  requireWritable(ctx);
  await getJob(ctx, jobId);
  const p = validPoint(lat, lng);
  if (!p) throw badRequest("Position invalide");
  await ctx.db.query("UPDATE jobs SET latitude=$3, longitude=$4, geo_source='gps', geo_label='' WHERE id=$1 AND org_id=$2", [
    jobId,
    ctx.orgId,
    p.lat,
    p.lng,
  ]);
  await audit(ctx.db, { orgId: ctx.orgId, userId: ctx.userId, action: "job.position", target: jobId, ip: ctx.ip });
  return p;
}

/** Position du dépôt (adresse de l'entreprise), point de départ et d'arrivée des tournées. */
export async function locateDepot(ctx: Ctx, fetcher?: Fetcher) {
  requireWritable(ctx);
  const o = await one<{ address_line1: string; postal_code: string; city: string }>(
    ctx.db,
    "SELECT address_line1, postal_code, city FROM organizations WHERE id=$1",
    [ctx.orgId],
  );
  const address = [o?.address_line1, o?.postal_code, o?.city].filter(Boolean).join(" ");
  if (!address) throw badRequest("Renseignez d'abord l'adresse de l'entreprise");
  const p = await geocode(address, fetcher);
  if (!p) throw badRequest("Adresse de l'entreprise introuvable");
  await ctx.db.query("UPDATE organizations SET latitude=$2, longitude=$3, geo_label=$4 WHERE id=$1", [ctx.orgId, p.lat, p.lng, p.label]);
  return p;
}

/** Localise en une fois les chantiers planifiés à la date qui n'ont pas encore de position. */
export async function locateMissing(ctx: Ctx, date: string, fetcher?: Fetcher) {
  requireWritable(ctx);
  const rows = await ctx.db.query<{ id: string; site_line1: string; site_postal_code: string; site_city: string }>(
    `SELECT DISTINCT j.id, j.site_line1, j.site_postal_code, j.site_city FROM job_assignments a JOIN jobs j ON j.id=a.job_id
     WHERE a.org_id=$1 AND a.start_date <= $2 AND a.end_date >= $2 AND j.latitude IS NULL LIMIT 25`,
    [ctx.orgId, checkDate(date)],
  );
  let found = 0;
  for (const r of rows) {
    const p = await geocode(siteAddress(r), fetcher);
    if (!p) continue;
    await ctx.db.query("UPDATE jobs SET latitude=$2, longitude=$3, geo_source='adresse', geo_label=$4 WHERE id=$1", [r.id, p.lat, p.lng, p.label]);
    found++;
  }
  const depot = await one<{ latitude: unknown }>(ctx.db, "SELECT latitude FROM organizations WHERE id=$1", [ctx.orgId]);
  if (depot?.latitude == null) await locateDepot(ctx, fetcher).catch(() => null);
  return { found, missing: rows.length - found };
}

/* ------------------------------------------------------------------ */
/* Tournées de la journée                                              */
/* ------------------------------------------------------------------ */

function checkDate(d: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) throw badRequest("Date invalide");
  return d;
}

export interface Stop {
  jobId: string;
  title: string;
  address: string;
  point: Point | null;
  /** Trajet pour arriver à cet arrêt depuis le précédent (dépôt ou chantier). */
  km: number | null;
  minutes: number | null;
}

export interface DayRoute {
  userId: string;
  name: string;
  stops: Stop[];
  returnKm: number | null;
  returnMinutes: number | null;
  totalKm: number;
  totalMinutes: number;
  unlocated: number;
  mapsUrl: string;
}

/** Ordre conseillé : on part du dépôt (ou du premier chantier) et on va toujours au plus proche. */
export function nearestOrder<T extends { point: Point | null }>(items: T[], start: Point | null): T[] {
  const located = items.filter((i) => i.point);
  const rest = items.filter((i) => !i.point);
  const out: T[] = [];
  let here = start ?? located[0]?.point ?? null;
  while (located.length) {
    let best = 0;
    for (let i = 1; i < located.length; i++) {
      if (haversineKm(here!, located[i].point!) < haversineKm(here!, located[best].point!)) best = i;
    }
    const [next] = located.splice(best, 1);
    out.push(next);
    here = next.point;
  }
  return [...out, ...rest];
}

export function buildRoute(depot: (Point & { address: string }) | null, items: Omit<Stop, "km" | "minutes">[]) {
  const ordered = nearestOrder(items, depot);
  let prev: Point | null = depot;
  let totalKm = 0;
  let totalMinutes = 0;
  const stops: Stop[] = ordered.map((s) => {
    const km = prev && s.point ? roadKm(prev, s.point) : null;
    const minutes = km === null ? null : travelMinutes(km);
    if (km !== null) {
      totalKm += km;
      totalMinutes += minutes!;
    }
    if (s.point) prev = s.point;
    return { ...s, km, minutes };
  });
  const last = [...stops].reverse().find((s) => s.point)?.point ?? null;
  const returnKm = depot && last ? roadKm(last, depot) : null;
  const returnMinutes = returnKm === null ? null : travelMinutes(returnKm);
  if (returnKm !== null) {
    totalKm += returnKm;
    totalMinutes += returnMinutes!;
  }
  return {
    stops,
    returnKm,
    returnMinutes,
    totalKm: Math.round(totalKm * 10) / 10,
    totalMinutes,
    unlocated: stops.filter((s) => !s.point).length,
    mapsUrl: mapsUrl(depot?.address ?? "", stops),
  };
}

/** Lien d'itinéraire ouvert par l'application de navigation du téléphone (Google Maps, ou Plans sur iPhone via le navigateur). */
export function mapsUrl(depotAddress: string, stops: Pick<Stop, "address" | "point">[]): string {
  const where = (s: Pick<Stop, "address" | "point">) => (s.point ? `${s.point.lat.toFixed(6)},${s.point.lng.toFixed(6)}` : s.address);
  const places = stops.map(where).filter(Boolean);
  if (!places.length) return "";
  const u = new URL("https://www.google.com/maps/dir/");
  u.searchParams.set("api", "1");
  if (depotAddress) u.searchParams.set("origin", depotAddress);
  u.searchParams.set("destination", depotAddress || places[places.length - 1]);
  const waypoints = depotAddress ? places : places.slice(0, -1);
  if (waypoints.length) u.searchParams.set("waypoints", waypoints.slice(0, 9).join("|"));
  u.searchParams.set("travelmode", "driving");
  return u.toString();
}

/** Tournées du jour : une par personne affectée ; un ouvrier ne voit que la sienne. */
export async function dayRoutes(ctx: Ctx, date: string, q: Queryable = ctx.db) {
  checkDate(date);
  const org = await one<{ latitude: unknown; longitude: unknown; address_line1: string; postal_code: string; city: string; geo_label: string }>(
    q,
    "SELECT latitude, longitude, address_line1, postal_code, city, geo_label FROM organizations WHERE id=$1",
    [ctx.orgId],
  );
  const depotPoint = validPoint(org?.latitude ?? null, org?.longitude ?? null);
  const depotAddress = [org?.address_line1, org?.postal_code, org?.city].filter(Boolean).join(" ");
  const depot = depotPoint ? { ...depotPoint, address: depotAddress } : null;
  const everyone = can(ctx, "staff");
  const rows = await q.query<{
    user_id: string;
    name: string;
    job_id: string;
    title: string;
    site_line1: string;
    site_postal_code: string;
    site_city: string;
    latitude: unknown;
    longitude: unknown;
  }>(
    `SELECT DISTINCT a.resource_id AS user_id, coalesce(nullif(u.name, ''), u.email) AS name, j.id AS job_id, j.title, j.site_line1, j.site_postal_code,
       j.site_city, j.latitude, j.longitude
     FROM job_assignments a JOIN jobs j ON j.id=a.job_id JOIN users u ON u.id=a.resource_id
     WHERE a.org_id=$1 AND a.resource_type='user' AND a.start_date <= $2 AND a.end_date >= $2 ${everyone ? "" : "AND a.resource_id=$3"}
     ORDER BY name, j.title`,
    everyone ? [ctx.orgId, date] : [ctx.orgId, date, ctx.userId],
  );
  const byUser = new Map<string, { name: string; items: Omit<Stop, "km" | "minutes">[] }>();
  for (const r of rows) {
    const u = byUser.get(r.user_id) ?? { name: r.name, items: [] };
    u.items.push({ jobId: r.job_id, title: r.title, address: siteAddress(r), point: validPoint(r.latitude, r.longitude) });
    byUser.set(r.user_id, u);
  }
  const routes: DayRoute[] = [...byUser.entries()].map(([userId, u]) => ({ userId, name: u.name, ...buildRoute(depot, u.items) }));
  return { depot: depot ? { address: depotAddress, label: org?.geo_label ?? "" } : null, depotAddress, routes };
}
