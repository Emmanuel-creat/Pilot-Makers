import { beforeAll, describe, expect, it } from "vitest";
import type { Database } from "@/lib/db";
import type { Ctx } from "@/lib/services/context";
import { createRoadmapItem, deleteRoadmapItem, listRoadmap, setRoadmapStatus, toggleVote } from "@/lib/services/roadmap";
import { freshDb, signUp } from "./helpers";

let db: Database;
let alice: Ctx;
let bob: Ctx;
let admin: Ctx;

beforeAll(async () => {
  db = await freshDb();
  alice = await signUp(db, "alice-rm@exemple.fr");
  bob = await signUp(db, "bob-rm@exemple.fr", "Plomberie Bob");
  admin = { ...alice, isPlatformAdmin: true, twoFactor: true } as Ctx;
});

describe("feuille de route publique", () => {
  it("réserve la publication des sujets à l'équipe", async () => {
    await expect(createRoadmapItem(alice, { title: "Mode sombre" })).rejects.toMatchObject({ status: 403 });
    await expect(createRoadmapItem(admin, { title: "x" })).rejects.toMatchObject({ status: 400 });
  });

  it("compte un vote par personne, retirable, et classe par soutien", async () => {
    const offline = await createRoadmapItem(admin, { title: "Mode hors ligne", status: "prevu" });
    const bank = await createRoadmapItem(admin, { title: "Rapprochement bancaire", status: "prevu" });
    expect(await toggleVote(alice, bank)).toEqual({ voted: true, votes: 1 });
    expect(await toggleVote(bob, bank)).toEqual({ voted: true, votes: 2 });
    expect(await toggleVote(alice, offline)).toEqual({ voted: true, votes: 1 });
    expect(await toggleVote(alice, offline)).toEqual({ voted: false, votes: 0 });

    const publicList = await listRoadmap(db);
    expect(publicList.map((i) => [i.title, i.votes])).toEqual([
      ["Rapprochement bancaire", 2],
      ["Mode hors ligne", 0],
    ]);
    expect(publicList[0].voted).toBeUndefined();
    const mine = await listRoadmap(db, bob.userId);
    expect(mine.find((i) => i.id === bank)?.voted).toBe(true);
    expect(mine.find((i) => i.id === offline)?.voted).toBe(false);
  });

  it("date la livraison et n'accepte plus de vote ensuite", async () => {
    const id = await createRoadmapItem(admin, { title: "Signature sur place", status: "en_cours" });
    await setRoadmapStatus(admin, id, "livre");
    const item = (await listRoadmap(db)).find((i) => i.id === id)!;
    expect(item.status).toBe("livre");
    expect(item.delivered_on).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    await expect(toggleVote(bob, id)).rejects.toMatchObject({ status: 409 });
    await expect(setRoadmapStatus(admin, id, "abandonne")).rejects.toMatchObject({ status: 400 });
    await deleteRoadmapItem(admin, id);
    expect((await listRoadmap(db)).some((i) => i.id === id)).toBe(false);
  });
});
