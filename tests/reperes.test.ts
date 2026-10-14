import { describe, expect, it } from "vitest";
import { benchmarkBoard, setBenchmarkOptin } from "@/lib/services/benchmark";
import { createItem } from "@/lib/services/catalog";
import { band, itemKey, peerGroup, position, quantile, regionOf, sizeBand } from "@/lib/benchmark";
import { completeProfile, freshDb, signUp } from "./helpers";

describe("repères anonymes", () => {
  it("trouve la région d'un code postal", () => {
    expect(regionOf("69003")).toBe("Auvergne-Rhône-Alpes");
    expect(regionOf("20090")).toBe("Corse");
    expect(regionOf("97400")).toBe("Outre-mer");
    expect(regionOf("75 011")).toBe("Île-de-France");
    expect(regionOf("abc")).toBe("");
  });
  it("compare les articles par code-barres ou par prestation commune", () => {
    expect(itemKey({ ean: "4006381333931", source: "user", name: "X", unit: "U" })).toBe("ean:4006381333931:u");
    expect(itemKey({ ean: "", source: "library", name: " Pose  de carrelage ", unit: "m²" })).toBe("lib:pose de carrelage:m²");
    expect(itemKey({ ean: "", source: "user", name: "Pose", unit: "u" })).toBeNull();
  });
  it("ne donne une fourchette qu'à partir de 5 entreprises", () => {
    expect(band([1, 2, 3, 4])).toBeNull();
    expect(band([10, 20, 30, 40, 50])).toEqual({ low: 20, median: 30, high: 40, orgs: 5 });
    expect(quantile([1, 2], 0.5)).toBe(1.5);
    const b = band([10, 20, 30, 40, 50])!;
    expect([position(15, b), position(30, b), position(45, b)]).toEqual(["bas", "dans", "haut"]);
    expect(sizeBand(3)).toBe("2 à 5 personnes");
  });
  it("élargit le groupe de comparaison faute d'entreprises", () => {
    const me = { id: "me", trade: "Plombier", region: "Bretagne", size: "1 personne" };
    const o = (id: string, trade: string, region: string, size = "1 personne") => ({ id, trade, region, size });
    const all = [
      me,
      o("a", "plombier", "Bretagne"),
      o("b", "Plombier", "Bretagne", "2 à 5 personnes"),
      o("c", "Plombier", "Normandie"),
      o("d", "Plombier", "Occitanie"),
      o("e", "Maçon", "Bretagne"),
    ];
    expect(peerGroup(me, all)).toEqual({ label: "même métier, toute la France", ids: ["me", "a", "b", "c", "d"] });
    expect(peerGroup(me, all.slice(0, 3)).label).toBe("toutes les entreprises participantes");
  });
});

describe("repères entre entreprises", () => {
  it("restitue une fourchette locale seulement aux volontaires et à partir de 5 autres entreprises", async () => {
    const db = await freshDb();
    const orgs = [];
    for (let i = 0; i < 7; i++) {
      const ctx = await signUp(db, `repere${i}@exemple.fr`);
      await completeProfile(ctx);
      const id = await createItem(ctx, { name: "Pose de carrelage", category: "main_oeuvre", vat_percent: "10", unit: "m²", unit_price: String(40 + i * 5) });
      await db.query("UPDATE catalog_items SET source='library' WHERE id=$1", [id]);
      orgs.push(ctx);
    }
    const [me, ...others] = orgs;
    expect((await benchmarkBoard(me)).optedIn).toBe(false);
    await setBenchmarkOptin(me, true);
    for (const o of others.slice(0, 4)) await setBenchmarkOptin(o, true);
    let b = await benchmarkBoard(me);
    expect(b.region).toBe("Auvergne-Rhône-Alpes");
    expect(b.prices[0]).toMatchObject({ name: "Pose de carrelage", band: null });
    await setBenchmarkOptin(others[4], true);
    b = await benchmarkBoard(me);
    // Autres entreprises : 45, 50, 55, 60, 65 € ; la mienne à 40 €.
    expect(b.prices[0]).toMatchObject({ priceCents: 4000, scope: "region", position: "bas", band: { low: 5000, median: 5500, high: 6000, orgs: 5 } });
    expect(b.peers?.count).toBe(5);
    expect(b.peers?.metrics.every((m) => m.band === null)).toBe(true);
    await setBenchmarkOptin(me, false);
    expect((await benchmarkBoard(me)).prices).toEqual([]);
  });
});
