import { beforeAll, describe, expect, it } from "vitest";
import type { Database } from "@/lib/db";
import { WATCH, daysUntil, pendingAlerts } from "@/lib/regulatory-watch";
import type { Ctx } from "@/lib/services/context";
import { markWatchRead, regulatoryAlertCount, regulatoryWatch } from "@/lib/services/regulatory-watch";
import { completeProfile, freshDb, signUp } from "./helpers";

describe("veille réglementaire", () => {
  it("signale les évolutions non lues, en vigueur ou proches", () => {
    const entries = [
      { ...WATCH[0], id: "a", published: "2026-10-01", effective: "2026-09-01" },
      { ...WATCH[0], id: "b", published: "2026-10-01", effective: "2027-09-01" },
      { ...WATCH[0], id: "c", published: "2026-12-01", effective: "2026-12-15" },
    ];
    expect(pendingAlerts(entries, [], "2026-10-14").map((e) => e.id)).toEqual(["a"]);
    expect(pendingAlerts(entries, ["a"], "2027-06-01").map((e) => e.id)).toEqual(["b", "c"]);
    expect(daysUntil("2027-09-01", "2027-08-30")).toBe(2);
    expect(new Set(WATCH.map((e) => e.id)).size).toBe(WATCH.length);
  });

  let db: Database;
  let ctx: Ctx;
  beforeAll(async () => {
    db = await freshDb();
    ctx = await signUp(db, "veille@exemple.fr");
    await completeProfile(ctx);
  });

  it("garde la lecture pour toute l'entreprise", async () => {
    const before = await regulatoryAlertCount(ctx, "2026-10-14");
    expect(before).toBeGreaterThan(0);
    const w = await regulatoryWatch(ctx, "2026-10-14");
    await markWatchRead(ctx, w.alerts[0]);
    await markWatchRead(ctx, w.alerts[0]);
    expect(await regulatoryAlertCount(ctx, "2026-10-14")).toBe(before - 1);
    await expect(markWatchRead(ctx, "inconnue")).rejects.toMatchObject({ status: 400 });
    await markWatchRead(ctx, "tout");
    expect(await regulatoryAlertCount(ctx, "2027-12-31")).toBe(0);
    expect((await regulatoryWatch(ctx, "2026-10-14")).seen.length).toBe(WATCH.length);
  });
});
