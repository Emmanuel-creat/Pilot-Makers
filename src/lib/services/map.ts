/** Carte des chantiers et des clients : positions connues, adresses à localiser et zone d'intervention. */

import { one } from "@/lib/db";
import { distanceBands, type GeoPoint } from "@/lib/map";
import type { Ctx } from "./context";
import { requireWritable } from "./context";
import type { JobStatus } from "./jobs-labels";
import { geocode, type Fetcher } from "./routes";

export interface MapPlace {
  id: string;
  kind: "chantier" | "client";
  name: string;
  detail: string;
  status?: JobStatus;
  point: GeoPoint;
}

const CUSTOMER_NAME = "coalesce(nullif(c.company_name, ''), nullif(trim(c.first_name || ' ' || c.last_name), ''), 'Client')";
const CUSTOMER_ADDRESS = `CASE WHEN c.site_line1 <> '' THEN concat_ws(' ', c.site_line1, c.site_postal_code, c.site_city)
  ELSE concat_ws(' ', c.billing_line1, c.billing_postal_code, c.billing_city) END`;

const pt = (lat: unknown, lng: unknown): GeoPoint => ({ lat: Number(lat), lng: Number(lng) });

export async function mapData(ctx: Ctx) {
  const [depot, jobs, customers, missing] = await Promise.all([
    one<{ latitude: unknown; longitude: unknown; geo_label: string }>(ctx.db, "SELECT latitude, longitude, geo_label FROM organizations WHERE id=$1", [
      ctx.orgId,
    ]),
    ctx.db.query<{ id: string; title: string; status: JobStatus; site_city: string; customer_name: string | null; latitude: unknown; longitude: unknown }>(
      `SELECT j.id, j.title, j.status, j.site_city, ${CUSTOMER_NAME} AS customer_name, j.latitude, j.longitude
       FROM jobs j LEFT JOIN customers c ON c.id=j.customer_id WHERE j.org_id=$1 AND j.latitude IS NOT NULL ORDER BY j.created_at DESC LIMIT 500`,
      [ctx.orgId],
    ),
    ctx.db.query<{ id: string; name: string; city: string; latitude: unknown; longitude: unknown }>(
      `SELECT c.id, ${CUSTOMER_NAME} AS name, CASE WHEN c.site_line1 <> '' THEN c.site_city ELSE c.billing_city END AS city, c.latitude, c.longitude
       FROM customers c WHERE c.org_id=$1 AND c.archived_at IS NULL AND c.latitude IS NOT NULL ORDER BY name LIMIT 500`,
      [ctx.orgId],
    ),
    one<{ jobs: number; customers: number }>(
      ctx.db,
      `SELECT (SELECT count(*)::int FROM jobs j WHERE j.org_id=$1 AND j.latitude IS NULL AND j.site_city <> '') AS jobs,
              (SELECT count(*)::int FROM customers c WHERE c.org_id=$1 AND c.archived_at IS NULL AND c.latitude IS NULL
                 AND (c.site_city <> '' OR c.billing_city <> '')) AS customers`,
      [ctx.orgId],
    ),
  ]);
  const places: MapPlace[] = [
    ...jobs.map((j) => ({
      id: j.id,
      kind: "chantier" as const,
      name: j.title,
      detail: [j.customer_name, j.site_city].filter(Boolean).join(", "),
      status: j.status,
      point: pt(j.latitude, j.longitude),
    })),
    ...customers.map((c) => ({ id: c.id, kind: "client" as const, name: c.name, detail: c.city, point: pt(c.latitude, c.longitude) })),
  ];
  const depotPoint = depot?.latitude != null ? pt(depot.latitude, depot.longitude) : null;
  return {
    depot: depotPoint ? { point: depotPoint, label: depot!.geo_label } : null,
    places,
    bands: depotPoint
      ? distanceBands(
          depotPoint,
          places.filter((p) => p.kind === "chantier").map((p) => p.point),
        )
      : null,
    missing: { jobs: missing?.jobs ?? 0, customers: missing?.customers ?? 0 },
  };
}

/** Localise par lots les chantiers et les clients sans position, et le dépôt s'il manque. */
export async function locateAll(ctx: Ctx, fetcher?: Fetcher) {
  requireWritable(ctx);
  const jobs = await ctx.db.query<{ id: string; address: string }>(
    `SELECT id, concat_ws(' ', site_line1, site_postal_code, site_city) AS address FROM jobs
     WHERE org_id=$1 AND latitude IS NULL AND site_city <> '' ORDER BY created_at DESC LIMIT 25`,
    [ctx.orgId],
  );
  const customers = await ctx.db.query<{ id: string; address: string }>(
    `SELECT c.id, ${CUSTOMER_ADDRESS} AS address FROM customers c
     WHERE c.org_id=$1 AND c.archived_at IS NULL AND c.latitude IS NULL AND (c.site_city <> '' OR c.billing_city <> '') ORDER BY c.created_at DESC LIMIT 25`,
    [ctx.orgId],
  );
  let found = 0;
  for (const j of jobs) {
    const p = await geocode(j.address, fetcher);
    if (!p) continue;
    await ctx.db.query("UPDATE jobs SET latitude=$2, longitude=$3, geo_source='adresse', geo_label=$4 WHERE id=$1", [j.id, p.lat, p.lng, p.label]);
    found++;
  }
  for (const c of customers) {
    const p = await geocode(c.address, fetcher);
    if (!p) continue;
    await ctx.db.query("UPDATE customers SET latitude=$2, longitude=$3, geo_label=$4 WHERE id=$1", [c.id, p.lat, p.lng, p.label]);
    found++;
  }
  const depot = await one<{ latitude: unknown; address: string }>(
    ctx.db,
    "SELECT latitude, concat_ws(' ', address_line1, postal_code, city) AS address FROM organizations WHERE id=$1",
    [ctx.orgId],
  );
  if (depot?.latitude == null) {
    const p = await geocode(depot?.address ?? "", fetcher);
    if (p) await ctx.db.query("UPDATE organizations SET latitude=$2, longitude=$3, geo_label=$4 WHERE id=$1", [ctx.orgId, p.lat, p.lng, p.label]);
  }
  return { found, tried: jobs.length + customers.length };
}
