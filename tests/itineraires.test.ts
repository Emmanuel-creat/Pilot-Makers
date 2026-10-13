import { beforeAll, describe, expect, it } from "vitest";
import type { Database } from "@/lib/db";
import { buildContext } from "@/lib/services/accounts";
import type { Ctx } from "@/lib/services/context";
import { getJob, updateJob } from "@/lib/services/jobs";
import { assign } from "@/lib/services/planning";
import {
  dayRoutes,
  type Fetcher,
  formatMinutes,
  geocode,
  locateJob,
  locateMissing,
  mapsUrl,
  nearestOrder,
  roadKm,
  setJobPosition,
  travelMinutes,
} from "@/lib/services/routes";
import { acceptInvite, inviteMember } from "@/lib/services/team";
import { completeProfile, freshDb, signUp } from "./helpers";

let db: Database;
let ctx: Ctx;
const DAY = "2026-11-03";
// Positions fictives autour de Lyon.
const PLACES: Record<string, [number, number]> = {
  "12 rue des Artisans": [45.764, 4.8357],
  Villeurbanne: [45.7719, 4.8902],
  Vénissieux: [45.6975, 4.8867],
  Bron: [45.7386, 4.9131],
};
const calls: string[] = [];
const fakeGeocoder: Fetcher = async (url) => {
  calls.push(url);
  const q = new URL(url).searchParams.get("q") ?? "";
  const hit = Object.entries(PLACES).find(([k]) => q.includes(k));
  const features = hit ? [{ geometry: { coordinates: [hit[1][1], hit[1][0]] }, properties: { label: hit[0], score: 0.9 } }] : [];
  return new Response(JSON.stringify({ type: "FeatureCollection", features }), { headers: { "content-type": "application/json" } });
};

async function job(title: string, city: string) {
  const r = await db.query<{ id: string }>(
    "INSERT INTO jobs (org_id, title, site_line1, site_postal_code, site_city) VALUES ($1,$2,'1 place du Marché','69000',$3) RETURNING id",
    [ctx.orgId, title, city],
  );
  return r[0].id;
}

beforeAll(async () => {
  db = await freshDb();
  const owner = await signUp(db, "trajets@exemple.fr");
  ctx = { ...owner, entitlements: { ...owner.entitlements, plan: { ...owner.entitlements.plan, maxUsers: 10 } } };
  await completeProfile(ctx);
});

describe("calculs", () => {
  it("distance routière, durée et ordre conseillé", () => {
    const lyon = { lat: 45.764, lng: 4.8357 };
    const paris = { lat: 48.8566, lng: 2.3522 };
    expect(roadKm(lyon, paris)).toBeGreaterThan(500);
    expect(roadKm(lyon, paris)).toBeLessThan(560);
    expect(travelMinutes(0)).toBe(0);
    expect(travelMinutes(6)).toBe(17);
    expect(travelMinutes(30)).toBe(41);
    expect(formatMinutes(75)).toBe("1 h 15");
    expect(formatMinutes(120)).toBe("2 h");
    const items = [
      { id: "loin", point: { lat: 45.6975, lng: 4.8867 } },
      { id: "sans", point: null },
      { id: "pres", point: { lat: 45.7719, lng: 4.8902 } },
    ];
    expect(nearestOrder(items, lyon).map((i) => i.id)).toEqual(["pres", "loin", "sans"]);
    const url = new URL(mapsUrl("12 rue des Artisans 69001 Lyon", [{ address: "Bron", point: { lat: 45.7386, lng: 4.9131 } }]));
    expect(url.searchParams.get("waypoints")).toBe("45.738600,4.913100");
    expect(url.searchParams.get("destination")).toBe("12 rue des Artisans 69001 Lyon");
  });

  it("géocodage : imprécis ou en panne, rien n'est inventé", async () => {
    expect(await geocode("1 place du Marché 69000 Bron", fakeGeocoder)).toMatchObject({ lat: 45.7386, lng: 4.9131 });
    expect(await geocode("Adresse inconnue 00000", fakeGeocoder)).toBeNull();
    const vague: Fetcher = async () =>
      new Response(JSON.stringify({ features: [{ geometry: { coordinates: [4.8, 45.7] }, properties: { score: 0.2 } }] }));
    expect(await geocode("Rue quelque part", vague)).toBeNull();
    const down: Fetcher = async () => {
      throw new Error("réseau");
    };
    expect(await geocode("Rue quelque part", down)).toBeNull();
  });
});

describe("tournées de la journée", () => {
  it("chantiers localisés, ordre conseillé, totaux et chantier sans position", async () => {
    const a = await job("Salle de bains Vénissieux", "Vénissieux");
    const b = await job("Cuisine Villeurbanne", "Villeurbanne");
    const c = await job("Toiture isolée", "Hameau perdu");
    for (const id of [a, b, c]) await assign(ctx, { jobId: id, resourceType: "user", resourceId: ctx.userId, start: DAY, end: DAY });

    const r = await locateMissing(ctx, DAY, fakeGeocoder);
    expect(r).toEqual({ found: 2, missing: 1 });
    const { routes, depot } = await dayRoutes(ctx, DAY);
    expect(depot).not.toBeNull();
    expect(routes).toHaveLength(1);
    const route = routes[0];
    expect(route.stops.map((s) => s.title)).toEqual(["Cuisine Villeurbanne", "Salle de bains Vénissieux", "Toiture isolée"]);
    expect(route.unlocated).toBe(1);
    expect(route.stops[2].km).toBeNull();
    expect(route.returnKm).toBeGreaterThan(0);
    expect(route.totalKm).toBeCloseTo(route.stops[0].km! + route.stops[1].km! + route.returnKm!, 1);
    expect(route.mapsUrl).toContain("google.com/maps/dir");

    // Position GPS relevée sur place pour le chantier isolé.
    await expect(setJobPosition(ctx, c, "200", "4")).rejects.toMatchObject({ status: 400 });
    await setJobPosition(ctx, c, 45.82, 4.95);
    expect((await dayRoutes(ctx, DAY)).routes[0].unlocated).toBe(0);
    expect((await getJob(ctx, c)).job).toMatchObject({ geo_source: "gps", latitude: 45.82 });
  });

  it("changer l'adresse efface la position géocodée, pas celle relevée sur place", async () => {
    const id = await job("Garage Bron", "Bron");
    await locateJob(ctx, id, fakeGeocoder);
    const { job: before } = await getJob(ctx, id);
    expect(before).toMatchObject({ geo_source: "adresse", geo_label: "Bron" });
    await updateJob(ctx, id, {
      title: "Garage Bron",
      status: "a_planifier",
      site_line1: "1 place du Marché",
      site_postal_code: "69000",
      site_city: "Bron",
    });
    expect((await getJob(ctx, id)).job.latitude).not.toBeNull();
    await updateJob(ctx, id, {
      title: "Garage Bron",
      status: "a_planifier",
      site_line1: "3 rue Neuve",
      site_postal_code: "69500",
      site_city: "Bron",
    });
    expect((await getJob(ctx, id)).job).toMatchObject({ latitude: null, geo_source: "" });
    await expect(locateJob(ctx, await job("Introuvable", "Nulle part"), fakeGeocoder)).rejects.toMatchObject({ status: 400 });
  });

  it("un ouvrier ne voit que sa tournée", async () => {
    const { token } = await inviteMember(ctx, { email: "compagnon@exemple.fr", jobFunction: "ouvrier" });
    const u = await signUp(db, "compagnon@exemple.fr", "Perso");
    await acceptInvite(u, token);
    const w = (await buildContext(db, u.userId, ctx.orgId, null, { ip: "127.0.0.1", userAgent: "test" }))!;
    const id = await job("Chantier du compagnon", "Villeurbanne");
    await assign(ctx, { jobId: id, resourceType: "user", resourceId: w.userId, start: DAY, end: DAY });
    expect((await dayRoutes(ctx, DAY)).routes).toHaveLength(2);
    const mine = (await dayRoutes(w, DAY)).routes;
    expect(mine.map((r) => r.userId)).toEqual([w.userId]);
    await expect(dayRoutes(ctx, "03/11/2026")).rejects.toMatchObject({ status: 400 });
  });
});
