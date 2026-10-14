import { beforeAll, describe, expect, it } from "vitest";
import type { Database } from "@/lib/db";
import { nextTier, parseTiers, priceFor, reachedTier } from "@/lib/group-buying";
import type { Ctx } from "@/lib/services/context";
import { closeGroupPurchase, commitQuantity, createGroupPurchase, exportCommitments, groupPurchases } from "@/lib/services/group-buying";
import { createNetwork, getNetwork, joinNetwork } from "@/lib/services/networks";
import { completeProfile, freshDb, signUp } from "./helpers";

const TIERS = [
  { minQty: 100, priceCents: 700 },
  { minQty: 300, priceCents: 620 },
];

describe("paliers de prix", () => {
  it("lit des paliers croissants en quantité et décroissants en prix", () => {
    expect(
      parseTiers(
        [
          { minQty: "100", price: "7" },
          { minQty: "300", price: "6,20" },
          { minQty: "", price: "" },
        ],
        800,
      ),
    ).toEqual({ tiers: TIERS, error: null });
    expect(parseTiers([], 800).error).toMatch(/au moins un palier/);
    expect(parseTiers([{ minQty: "100", price: "9" }], 800).error).toMatch(/Palier 1 : le prix doit baisser/);
    expect(
      parseTiers(
        [
          { minQty: "300", price: "7" },
          { minQty: "100", price: "6" },
        ],
        800,
      ).error,
    ).toMatch(/Palier 2 : la quantité/);
    expect(parseTiers([{ minQty: "1,5", price: "7" }], 800).error).toMatch(/Palier 1/);
  });

  it("fixe le prix de tous selon le total engagé", () => {
    expect(reachedTier(TIERS, 99)).toBeNull();
    expect(reachedTier(TIERS, 100)).toEqual(TIERS[0]);
    expect(reachedTier(TIERS, 450)).toEqual(TIERS[1]);
    expect(nextTier(TIERS, 120)).toEqual({ tier: TIERS[1], missing: 180 });
    expect(nextTier(TIERS, 300)).toBeNull();
    expect(priceFor(800, TIERS, 150, 40)).toEqual({ unitCents: 700, totalCents: 28000, savingCents: 4000 });
    expect(priceFor(800, TIERS, 50, 40)).toEqual({ unitCents: 800, totalCents: 32000, savingCents: 0 });
  });
});

describe("achat groupé dans un réseau", () => {
  let db: Database;
  let a: Ctx;
  let b: Ctx;
  let outsider: Ctx;
  let networkId: string;
  const NOW = new Date("2026-10-14T10:00:00Z");
  const raw = {
    title: "Plaques de plâtre BA13",
    supplier: "Négoce du Rhône",
    unit: "u",
    deadline: "2026-10-31",
    basePrice: "8",
    tiers: [
      { minQty: "100", price: "7" },
      { minQty: "300", price: "6,20" },
    ],
  };

  beforeAll(async () => {
    db = await freshDb();
    a = await signUp(db, "achat-a@exemple.fr");
    await completeProfile(a);
    b = await signUp(db, "achat-b@exemple.fr");
    await completeProfile(b);
    outsider = await signUp(db, "achat-c@exemple.fr");
    networkId = await createNetwork(a, { name: "Artisans de la Drôme" });
    await joinNetwork(b, (await getNetwork(a, networkId)).joinCode);
  });

  it("engagements, palier atteint, clôture et récapitulatif fournisseur", async () => {
    await expect(createGroupPurchase(a, networkId, { ...raw, deadline: "2026-10-01" }, NOW)).rejects.toMatchObject({ status: 400 });
    await expect(createGroupPurchase(outsider, networkId, raw, NOW)).rejects.toMatchObject({ status: 404 });
    const id = await createGroupPurchase(a, networkId, raw, NOW);
    await commitQuantity(a, id, "60", NOW);
    await expect(commitQuantity(b, id, "2,5", NOW)).rejects.toMatchObject({ status: 400 });
    await expect(commitQuantity(outsider, id, "10", NOW)).rejects.toMatchObject({ status: 404 });
    await commitQuantity(b, id, "30", NOW);
    let p = (await groupPurchases(b, networkId, NOW)).purchases[0];
    expect(p).toMatchObject({ total: 90, participants: 2, mine: 30, unitCents: 800, open: true, next: { missing: 10 } });
    await commitQuantity(b, id, "50", NOW);
    p = (await groupPurchases(b, networkId, NOW)).purchases[0];
    expect(p).toMatchObject({ total: 110, unitCents: 700, mySavingCents: 5000 });
    await expect(commitQuantity(b, id, "10", new Date("2026-11-02T10:00:00Z"))).rejects.toMatchObject({ status: 409 });

    await expect(closeGroupPurchase(b, id)).rejects.toMatchObject({ status: 403 });
    await expect(exportCommitments(b, id)).rejects.toMatchObject({ status: 403 });
    expect((await closeGroupPurchase(a, id)).unitCents).toBe(700);
    await expect(closeGroupPurchase(a, id)).rejects.toMatchObject({ status: 409 });
    await expect(commitQuantity(b, id, "500", NOW)).rejects.toMatchObject({ status: 409 });
    p = (await groupPurchases(a, networkId, NOW)).purchases[0];
    expect(p).toMatchObject({ status: "close", open: false, unitCents: 700, next: null });

    const { csv, fileName } = await exportCommitments(a, id);
    expect(fileName).toBe("achat-groupe-plaques-de-pl-tre-ba13.csv");
    expect(csv).toContain("Quantité (u)");
    expect(csv).toContain("Total;;;;;110;7,00;770,00");
  });

  it("retire un engagement avec 0 et annule l'achat", async () => {
    const id = await createGroupPurchase(b, networkId, { ...raw, title: "Sacs de colle carrelage" }, NOW);
    await commitQuantity(a, id, "20", NOW);
    await commitQuantity(a, id, "0", NOW);
    const p = (await groupPurchases(a, networkId, NOW)).purchases.find((x) => x.id === id)!;
    expect(p).toMatchObject({ total: 0, mine: 0, participants: 0 });
    expect((await closeGroupPurchase(b, id, true)).unitCents).toBeNull();
    expect((await groupPurchases(a, networkId, NOW)).purchases.find((x) => x.id === id)!.status).toBe("annulee");
  });
});
