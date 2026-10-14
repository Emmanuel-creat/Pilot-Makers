import { beforeAll, describe, expect, it } from "vitest";
import type { Database } from "@/lib/db";
import { distanceBands, distanceKm, osmUrl, project } from "@/lib/map";
import type { Ctx } from "@/lib/services/context";
import { locateAll, mapData } from "@/lib/services/map";
import type { Fetcher } from "@/lib/services/routes";
import { completeProfile, freshDb, makeCustomer, signUp } from "./helpers";

const lyon = { lat: 45.764, lng: 4.8357 };

describe("projection et distances", () => {
  it("place les points dans le cadre en gardant le nord en haut", () => {
    const pts = project([lyon, { lat: 45.8, lng: 4.9 }, { lat: 45.7, lng: 4.8 }], 400, 300);
    for (const p of pts) {
      expect(p.x).toBeGreaterThanOrEqual(24);
      expect(p.x).toBeLessThanOrEqual(376);
      expect(p.y).toBeGreaterThanOrEqual(24);
      expect(p.y).toBeLessThanOrEqual(276);
    }
    expect(pts[1].y).toBeLessThan(pts[2].y);
    expect(pts[1].x).toBeGreaterThan(pts[2].x);
    expect(project([lyon], 400, 300)).toEqual([{ x: 200, y: 150 }]);
    expect(project([], 400, 300)).toEqual([]);
  });

  it("répartit les chantiers par distance au dépôt", () => {
    expect(Math.round(distanceKm(lyon, { lat: 48.8566, lng: 2.3522 }))).toBe(391);
    expect(distanceBands(lyon, [lyon, { lat: 45.9, lng: 4.8357 }, { lat: 46.5, lng: 4.8357 }])).toEqual([1, 1, 0, 1]);
    expect(osmUrl(lyon)).toContain("mlat=45.76400");
  });
});

describe("carte de l'entreprise", () => {
  let db: Database;
  let ctx: Ctx;
  const geocoder: Fetcher = async (url) => {
    const q = new URL(url).searchParams.get("q") ?? "";
    const at: [number, number] | null = q.includes("Villeurbanne") ? [4.8902, 45.7719] : q.includes("Lyon") ? [4.8357, 45.764] : null;
    const features = at ? [{ geometry: { coordinates: at }, properties: { label: q, score: 0.9 } }] : [];
    return new Response(JSON.stringify({ features }));
  };

  beforeAll(async () => {
    db = await freshDb();
    ctx = await signUp(db, "carte@exemple.fr");
    await completeProfile(ctx);
    const customer = await makeCustomer(ctx);
    await db.query(
      "UPDATE customers SET billing_line1='3 rue Lafayette', billing_postal_code='69100', billing_city='Villeurbanne', site_line1='' WHERE id=$1",
      [customer],
    );
    await db.query(
      "INSERT INTO jobs (org_id, customer_id, title, site_line1, site_postal_code, site_city) VALUES ($1,$2,'Cuisine','1 rue Neuve','69100','Villeurbanne')",
      [ctx.orgId, customer],
    );
    await db.query(
      "INSERT INTO jobs (org_id, title, site_line1, site_postal_code, site_city) VALUES ($1,'Introuvable','1 chemin perdu','00000','Nulle part')",
      [ctx.orgId],
    );
  });

  it("localise les adresses manquantes puis les affiche", async () => {
    let d = await mapData(ctx);
    expect(d.places).toEqual([]);
    expect(d.missing.jobs).toBe(2);
    const r = await locateAll(ctx, geocoder);
    expect(r).toEqual({ found: 2, tried: 3 });
    d = await mapData(ctx);
    expect(d.places.map((p) => [p.kind, p.name])).toEqual([
      ["chantier", "Cuisine"],
      ["client", d.places[1].name],
    ]);
    expect(d.places[0].detail).toContain("Villeurbanne");
    expect(d.missing).toEqual({ jobs: 1, customers: 0 });
    expect(d.depot?.point.lat).toBeCloseTo(45.764);
    expect(d.bands).toEqual([1, 0, 0, 0]);
  });
});
