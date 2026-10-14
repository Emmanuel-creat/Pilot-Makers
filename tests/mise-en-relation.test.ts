import { beforeAll, describe, expect, it } from "vitest";
import type { Database } from "@/lib/db";
import { departmentOf, parseDepartments, pickArtisans } from "@/lib/matching";
import type { Ctx } from "@/lib/services/context";
import { getMatchingProfile, matchingStats, requestMatch, saveMatchingProfile } from "@/lib/services/matching";
import { completeProfile, freshDb, signUp } from "./helpers";

describe("règles de la mise en relation", () => {
  it("département du code postal et saisie des départements", () => {
    expect(departmentOf("69003")).toBe("69");
    expect(departmentOf("20090")).toBe("2A");
    expect(departmentOf("20600")).toBe("2B");
    expect(departmentOf("97400")).toBe("974");
    expect(departmentOf("6900")).toBeNull();
    expect(parseDepartments("69, 1; 38 2a 69")).toEqual({ departments: ["01", "2A", "38", "69"], invalid: [] });
    expect(parseDepartments("69 99 abc").invalid).toEqual(["99", "ABC"]);
  });

  it("répartition équitable sous le plafond de chacun", () => {
    const d = (n: number) => new Date(2026, 9, n);
    const c = [
      { orgId: "a", weeklyCap: 5, lastWeek: 2, lastAt: d(10) },
      { orgId: "b", weeklyCap: 5, lastWeek: 0, lastAt: d(1) },
      { orgId: "c", weeklyCap: 1, lastWeek: 1, lastAt: d(2) },
      { orgId: "d", weeklyCap: 5, lastWeek: 0, lastAt: null },
      { orgId: "e", weeklyCap: 5, lastWeek: 2, lastAt: d(5) },
    ];
    expect(pickArtisans(c)).toEqual(["d", "b", "e"]);
    expect(pickArtisans(c, 10)).toEqual(["d", "b", "e", "a"]);
  });
});

describe("demandes de particuliers", () => {
  let db: Database;
  let a: Ctx;
  let b: Ctx;
  const meta = { ip: "203.0.113.9" };
  const request = (extra: Record<string, unknown> = {}) => ({
    trade: "carrelage",
    postalCode: "69007",
    city: "Lyon",
    description: "Refaire la faïence de la salle de bains, environ 12 m² de murs.",
    timeframe: "mois",
    name: "Lucie Bernard",
    email: "lucie@exemple.fr",
    phone: "",
    consent: true,
    website: "",
    ...extra,
  });

  beforeAll(async () => {
    db = await freshDb();
    a = await signUp(db, "carreleur-a@exemple.fr", "Carrelage Martin");
    b = await signUp(db, "carreleur-b@exemple.fr", "Faïence Durand");
    await completeProfile(b);
  });

  it("l'activation exige métiers, départements, SIREN et assurance", async () => {
    await expect(saveMatchingProfile(a, { enabled: true, trades: [], departments: "69", weeklyCap: 5 })).rejects.toThrow(/type de travaux/);
    await expect(saveMatchingProfile(a, { enabled: true, trades: ["carrelage"], departments: "69 99", weeklyCap: 5 })).rejects.toThrow(/inconnu : 99/);
    await expect(saveMatchingProfile(a, { enabled: true, trades: ["carrelage"], departments: "69", weeklyCap: 5 })).rejects.toThrow(/SIREN/);
    await completeProfile(a);
    await saveMatchingProfile(a, { enabled: true, trades: ["carrelage", "chape"], departments: "69, 1", weeklyCap: 1 });
    await saveMatchingProfile(b, { enabled: true, trades: ["carrelage"], departments: "69", weeklyCap: 5 });
    expect(await getMatchingProfile(a)).toMatchObject({ enabled: true, trades: ["carrelage", "chape"], departments: ["01", "69"], weeklyCap: 1, lastWeek: 0 });
  });

  it("transmet la demande aux artisans du département, sous leur plafond", async () => {
    await expect(requestMatch(db, request({ consent: false }), meta)).rejects.toThrow(/Acceptez/);
    await expect(requestMatch(db, request({ email: "", phone: "" }), meta)).rejects.toThrow(/téléphone ou une adresse/);
    await expect(requestMatch(db, request({ postalCode: "690" }), meta)).rejects.toThrow(/Code postal/);
    const r1 = await requestMatch(db, request(), meta);
    expect(r1.artisans.map((x) => x.name).sort()).toEqual(["Carrelage Martin", "Faïence Durand"]);
    const leads = await db.query<{ org_id: string; source: string; city: string; description: string }>("SELECT org_id, source, city, description FROM leads");
    expect(leads).toHaveLength(2);
    expect(leads[0]).toMatchObject({
      source: "plateforme",
      city: "69007 Lyon",
      description: expect.stringMatching(/^Carrelage et faïence, dans le mois\. Refaire/),
    });
    // A a atteint son plafond d'une demande par semaine : seul B reçoit la suivante.
    const r2 = await requestMatch(db, request({ name: "Paul Petit" }), meta);
    expect(r2.artisans.map((x) => x.name)).toEqual(["Faïence Durand"]);
    expect((await getMatchingProfile(b)).lastWeek).toBe(2);
  });

  it("sans artisan disponible, aucune coordonnée n'est conservée", async () => {
    const before = (await db.query("SELECT 1 FROM leads")).length;
    const r = await requestMatch(db, request({ trade: "electricite", name: "Marc Robin" }), meta);
    expect(r.artisans).toEqual([]);
    expect((await db.query("SELECT 1 FROM leads")).length).toBe(before);
    expect(await matchingStats(db)).toEqual({ artisans: 2, requests: 2 });
    // Le robot qui remplit le champ caché ne déclenche rien.
    expect(await requestMatch(db, request({ website: "spam" }), meta)).toEqual({ artisans: [] });
    expect((await db.query("SELECT 1 FROM leads")).length).toBe(before);
  });
});
