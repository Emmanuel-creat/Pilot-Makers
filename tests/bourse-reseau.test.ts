import { beforeAll, describe, expect, it } from "vitest";
import type { Database } from "@/lib/db";
import { isVisible, postSchema, priceCents } from "@/lib/network-board";
import type { Ctx } from "@/lib/services/context";
import { closePost, createPost, networkBoard, replyToPost } from "@/lib/services/network-board";
import { createNetwork, getNetwork, joinNetwork } from "@/lib/services/networks";
import { completeProfile, freshDb, signUp } from "./helpers";

describe("bourse : règles", () => {
  it("exige des dates pour une mission et une quantité pour des matériaux", () => {
    expect(postSchema.safeParse({ kind: "mission", title: "Renfort carrelage" }).success).toBe(false);
    expect(postSchema.safeParse({ kind: "mission", title: "Renfort", start: "2026-10-20", end: "2026-10-19" }).success).toBe(false);
    expect(postSchema.safeParse({ kind: "materiau", title: "Plaques de plâtre" }).success).toBe(false);
    expect(postSchema.safeParse({ kind: "materiau", title: "Plaques de plâtre", quantity: "12" }).success).toBe(true);
  });

  it("lit le prix et masque les missions passées", () => {
    expect(priceCents("45,50 €")).toBe(4550);
    expect(priceCents("")).toBe("");
    expect(priceCents("abc")).toBeNull();
    expect(isVisible({ status: "ouverte", kind: "mission", end: "2026-10-10" }, "2026-10-14")).toBe(false);
    expect(isVisible({ status: "ouverte", kind: "materiau", end: null }, "2026-10-14")).toBe(true);
    expect(isVisible({ status: "pourvue", kind: "materiau", end: null }, "2026-10-14")).toBe(false);
  });
});

describe("bourse : réseau", () => {
  let db: Database;
  let a: Ctx;
  let b: Ctx;
  let outsider: Ctx;
  let networkId: string;
  const NOW = new Date("2026-10-14T10:00:00Z");

  beforeAll(async () => {
    db = await freshDb();
    a = await signUp(db, "bourse-a@exemple.fr");
    await completeProfile(a);
    b = await signUp(db, "bourse-b@exemple.fr");
    await completeProfile(b);
    outsider = await signUp(db, "bourse-c@exemple.fr");
    networkId = await createNetwork(a, { name: "Artisans du Rhône" });
    await joinNetwork(b, (await getNetwork(a, networkId)).joinCode);
  });

  it("publie une mission, reçoit une réponse avec les coordonnées puis la clôt", async () => {
    const id = await createPost(a, networkId, { kind: "mission", title: "Carreleur pour une semaine", start: "2026-10-19", end: "2026-10-23", city: "Lyon" });
    await expect(createPost(outsider, networkId, { kind: "materiau", title: "Sable", quantity: "1" })).rejects.toThrow();
    await expect(replyToPost(a, id, "moi")).rejects.toThrow(/propre annonce/);
    await expect(replyToPost(outsider, id, "moi")).rejects.toThrow();
    await replyToPost(b, id, "Disponible toute la semaine");
    await expect(replyToPost(b, id, "encore")).rejects.toThrow(/déjà répondu/);
    const mine = (await networkBoard(a, networkId, NOW)).posts[0];
    expect(mine).toMatchObject({ mine: true, replies: 1 });
    expect(mine.responses[0].message).toBe("Disponible toute la semaine");
    expect((await networkBoard(b, networkId, NOW)).posts[0]).toMatchObject({ mine: false, replied: true, responses: [] });
    await expect(closePost(b, id, "pourvue")).rejects.toThrow();
    await closePost(a, id, "pourvue");
    expect((await networkBoard(b, networkId, NOW)).posts).toHaveLength(0);
    expect((await networkBoard(a, networkId, NOW)).posts[0].status).toBe("pourvue");
  });

  it("propose des matériaux restants", async () => {
    await createPost(b, networkId, { kind: "materiau", title: "Plaques de plâtre BA13", quantity: "14", unit: "u", price: "" });
    const p = (await networkBoard(a, networkId, NOW)).posts.find((x) => x.kind === "materiau")!;
    expect(p).toMatchObject({ quantity: "14", unit: "u", priceCents: null, mine: false });
  });
});
