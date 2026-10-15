/** Bilan carbone d'un chantier : produits du devis accepté, déplacements pointés, déchets évacués. */

import { z } from "zod";
import { num, one } from "@/lib/db";
import { badRequest, isUuid, notFound } from "@/lib/http";
import { jobCarbon, VEHICLES, vehicleOf } from "@/lib/job-carbon";
import { tonnes } from "@/lib/waste";
import { quoteCarbon } from "./carbon";
import type { Ctx } from "./context";
import { requireWritable } from "./context";
import { listJobWaste } from "./waste";

export async function jobCarbonReport(ctx: Ctx, jobId: string) {
  const j = isUuid(jobId)
    ? await one<{ id: string; title: string; quote_id: string | null; carbon_trip_km: unknown; carbon_vehicle: string; carbon_trips: unknown }>(
        ctx.db,
        "SELECT id, title, quote_id, carbon_trip_km, carbon_vehicle, carbon_trips FROM jobs WHERE id=$1 AND org_id=$2",
        [jobId, ctx.orgId],
      )
    : null;
  if (!j) throw notFound("Chantier introuvable");
  const materials = j.quote_id ? await quoteCarbon(ctx, j.quote_id) : null;
  // Jours de présence : jours pointés sur le chantier, à défaut jours planifiés.
  const days = await one<{ worked: unknown; planned: unknown }>(
    ctx.db,
    `SELECT (SELECT count(DISTINCT work_date) FROM time_entries WHERE job_id=$1 AND org_id=$2 AND status <> 'refuse') AS worked,
       (SELECT coalesce(sum(end_date - start_date + 1), 0) FROM job_assignments WHERE job_id=$1 AND org_id=$2) AS planned`,
    [j.id, ctx.orgId],
  );
  const worked = num(days?.worked);
  const autoTrips = worked || num(days?.planned);
  const trips = j.carbon_trips == null ? autoTrips : num(j.carbon_trips);
  const waste = await listJobWaste(ctx, j.id);
  const report = jobCarbon({
    materialsGrams: materials?.grams ?? 0,
    materialsEstimatedGrams: materials?.estimatedGrams ?? 0,
    tripKm: j.carbon_trip_km == null ? null : Number(j.carbon_trip_km),
    trips,
    vehicle: vehicleOf(j.carbon_vehicle),
    waste: waste.map((w) => ({ category: w.category, tonnes: tonnes(w), sorted: w.sorted })),
  });
  return {
    job: { id: j.id, title: j.title, quoteId: j.quote_id },
    settings: {
      tripKm: j.carbon_trip_km == null ? null : Number(j.carbon_trip_km),
      vehicle: vehicleOf(j.carbon_vehicle),
      trips: j.carbon_trips == null ? null : num(j.carbon_trips),
      autoTrips,
      tripsSource: worked ? ("pointage" as const) : ("planning" as const),
    },
    materialsTop: materials?.top ?? [],
    materialsUnknown: materials?.unknown ?? [],
    ...report,
  };
}

const settingsSchema = z.object({
  tripKm: z.string().trim().default(""),
  vehicle: z.enum(Object.keys(VEHICLES) as [string, ...string[]]).default("utilitaire_diesel"),
  trips: z.string().trim().default(""),
});

const parse = (v: string, max: number, label: string, decimals: boolean) => {
  if (!v) return null;
  const n = Number(v.replace(",", "."));
  if (!Number.isFinite(n) || n < 0 || n > max || (!decimals && !Number.isInteger(n))) throw badRequest(`${label} invalide`);
  return decimals ? Math.round(n * 10) / 10 : n;
};

/** Distance aller-retour, véhicule et nombre d'allers-retours (vide : calculé d'après le pointage ou le planning). */
export async function setJobCarbonSettings(ctx: Ctx, jobId: string, raw: unknown) {
  requireWritable(ctx);
  const p = settingsSchema.safeParse(raw);
  if (!p.success) throw badRequest("Véhicule inconnu");
  const km = parse(p.data.tripKm, 2000, "Distance aller-retour", true);
  const trips = parse(p.data.trips, 1000, "Nombre d'allers-retours", false);
  const r = isUuid(jobId)
    ? await ctx.db.query("UPDATE jobs SET carbon_trip_km=$3, carbon_vehicle=$4, carbon_trips=$5, updated_at=now() WHERE id=$1 AND org_id=$2 RETURNING id", [
        jobId,
        ctx.orgId,
        km,
        p.data.vehicle,
        trips,
      ])
    : [];
  if (!r.length) throw notFound("Chantier introuvable");
}
