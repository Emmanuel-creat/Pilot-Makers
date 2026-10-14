/**
 * Météo des chantiers extérieurs : prévisions Open-Meteo (sans clé) mises en cache par zone,
 * contrôle des jours planifiés et décalage du planning sur la période favorable proposée.
 * WEATHER=off désactive le service, WEATHER=demo utilise une prévision fictive (démonstration, tests).
 */

import { z } from "zod";
import { one, type Queryable } from "@/lib/db";
import { badRequest, isUuid, notFound } from "@/lib/http";
import type { GeoPoint } from "@/lib/map";
import { checkJob, demoForecast, isOutdoorWork, OUTDOOR_WORKS, parseOpenMeteo, type DayForecast, type OutdoorWork } from "@/lib/weather";
import type { Ctx } from "./context";
import { audit, requireWritable } from "./context";
import { moveAssignment } from "./planning";
import { addDays, isWeekend, range } from "./planning-dates";
import { parisDate } from "./quotes";
import type { Fetcher } from "./routes";

const HORIZON = 10;
const CACHE_HOURS = 3;
const DEMO_POINT: GeoPoint = { lat: 45.76, lng: 4.84 };
const WEATHER_URL = () => process.env.WEATHER_URL || "https://api.open-meteo.com/v1/forecast";
const mode = () => process.env.WEATHER ?? "";

export async function forecastFor(db: Queryable, point: GeoPoint, today: string, fetcher: Fetcher = (u, i) => fetch(u, i)): Promise<DayForecast[] | null> {
  if (mode() === "off") return null;
  if (mode() === "demo") return demoForecast(today, HORIZON);
  const lat = Math.round(point.lat * 10) / 10;
  const lng = Math.round(point.lng * 10) / 10;
  const cached = await one<{ days: DayForecast[] }>(
    db,
    `SELECT days FROM weather_forecasts WHERE lat=$1 AND lng=$2 AND fetched_at > now() - interval '${CACHE_HOURS} hours'`,
    [lat, lng],
  );
  if (cached) return cached.days.filter((d) => d.date >= today);
  try {
    const daily = "temperature_2m_min,temperature_2m_max,precipitation_sum,precipitation_probability_max,wind_gusts_10m_max";
    const res = await fetcher(`${WEATHER_URL()}?latitude=${lat}&longitude=${lng}&daily=${daily}&timezone=Europe%2FParis&forecast_days=${HORIZON}`, {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;
    const days = parseOpenMeteo(await res.json());
    if (!days.length) return null;
    await db.query(
      `INSERT INTO weather_forecasts (lat, lng, days) VALUES ($1,$2,$3) ON CONFLICT (lat, lng) DO UPDATE SET days=EXCLUDED.days, fetched_at=now()`,
      [lat, lng, JSON.stringify(days)],
    );
    return days.filter((d) => d.date >= today);
  } catch {
    return null;
  }
}

const iso = (v: unknown) => (v instanceof Date ? v.toISOString().slice(0, 10) : String(v).slice(0, 10));
const toPoint = (lat: unknown, lng: unknown): GeoPoint | null => (lat == null || lng == null ? null : { lat: Number(lat), lng: Number(lng) });

/** Prévisions au dépôt et contrôle des chantiers extérieurs planifiés sur l'horizon de prévision. */
export async function weatherBoard(ctx: Ctx, now = new Date(), fetcher?: Fetcher) {
  const today = parisDate(now);
  const until = addDays(today, HORIZON - 1);
  const [org, jobs, slots] = await Promise.all([
    one<{ latitude: unknown; longitude: unknown }>(ctx.db, "SELECT latitude, longitude FROM organizations WHERE id=$1", [ctx.orgId]),
    ctx.db.query<{ id: string; title: string; outdoor_work: string; site_city: string; latitude: unknown; longitude: unknown }>(
      `SELECT id, title, outdoor_work, site_city, latitude, longitude FROM jobs
       WHERE org_id=$1 AND outdoor_work <> '' AND (status IN ('a_planifier', 'en_cours')
         OR EXISTS (SELECT 1 FROM job_assignments a WHERE a.job_id=jobs.id AND a.end_date >= $2)) ORDER BY lower(title)`,
      [ctx.orgId, today],
    ),
    ctx.db.query<{ job_id: string; start_date: unknown; end_date: unknown }>(
      "SELECT job_id, start_date, end_date FROM job_assignments WHERE org_id=$1 AND end_date >= $2 AND start_date <= $3",
      [ctx.orgId, today, until],
    ),
  ]);
  const enabled = mode() !== "off";
  const fallback = toPoint(org?.latitude, org?.longitude) ?? (mode() === "demo" ? DEMO_POINT : null);
  const depot = fallback ? await forecastFor(ctx.db, fallback, today, fetcher) : null;
  const out = [];
  for (const j of jobs) {
    const kind = (isOutdoorWork(j.outdoor_work) ? j.outdoor_work : "general") as OutdoorWork;
    const planned = slots
      .filter((s) => s.job_id === j.id)
      .flatMap((s) => range(iso(s.start_date), iso(s.end_date)))
      .filter((d) => d >= today && d <= until && !isWeekend(d));
    const point = toPoint(j.latitude, j.longitude) ?? fallback;
    const forecast = planned.length && point ? await forecastFor(ctx.db, point, today, fetcher) : null;
    out.push({
      id: j.id,
      title: j.title,
      city: j.site_city,
      kind,
      kindLabel: OUTDOOR_WORKS[kind].label,
      located: !!toPoint(j.latitude, j.longitude),
      planned: planned.length,
      check: forecast ? checkJob(planned, forecast, kind, today) : null,
    });
  }
  return { enabled, today, depot, jobs: out };
}

/** Indique si le chantier se fait dehors, et quel type de travaux, pour lui appliquer les bons seuils. */
export async function setOutdoorWork(ctx: Ctx, jobId: string, kind: string) {
  requireWritable(ctx);
  if (kind !== "" && !isOutdoorWork(kind)) throw badRequest("Type de travaux inconnu");
  if (!isUuid(jobId)) throw notFound("Chantier introuvable");
  const r = await one(ctx.db, "UPDATE jobs SET outdoor_work=$3 WHERE id=$1 AND org_id=$2 RETURNING id", [jobId, ctx.orgId, kind]);
  if (!r) throw notFound("Chantier introuvable");
}

const shiftSchema = z.object({ jobId: z.string(), shift: z.coerce.number().int().min(-60).max(60) });

/** Décale toutes les affectations à venir du chantier du nombre de jours proposé. */
export async function shiftJob(ctx: Ctx, raw: unknown, now = new Date()) {
  requireWritable(ctx);
  const p = shiftSchema.safeParse(raw);
  if (!p.success || p.data.shift === 0) throw badRequest("Décalage invalide");
  if (!isUuid(p.data.jobId)) throw notFound("Chantier introuvable");
  const today = parisDate(now);
  const rows = await ctx.db.query<{ id: string; resource_type: string; resource_id: string; start_date: unknown }>(
    "SELECT id, resource_type, resource_id, start_date FROM job_assignments WHERE org_id=$1 AND job_id=$2 AND start_date >= $3",
    [ctx.orgId, p.data.jobId, today],
  );
  if (!rows.length) throw badRequest("Aucune affectation à venir à décaler");
  let conflicts = 0;
  for (const r of rows) {
    const res = await moveAssignment(ctx, r.id, { resourceType: r.resource_type, resourceId: r.resource_id, start: addDays(iso(r.start_date), p.data.shift) });
    conflicts += res.conflicts.length;
  }
  await audit(ctx.db, { orgId: ctx.orgId, userId: ctx.userId, action: "job.weather_shift", target: p.data.jobId, data: { shift: p.data.shift }, ip: ctx.ip });
  return { moved: rows.length, conflicts };
}
