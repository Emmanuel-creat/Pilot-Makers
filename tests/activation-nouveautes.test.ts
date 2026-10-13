import { randomUUID } from "node:crypto";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import type { Database } from "@/lib/db";
import { featureEnabled, featureStates, rolloutBucket } from "@/lib/features";
import type { Ctx } from "@/lib/services/context";
import { einvoiceFile } from "@/lib/services/einvoice";
import { hasFeature, setOrgFeature } from "@/lib/services/features";
import { listNews, markNewsSeen, unreadNewsCount } from "@/lib/services/news";
import { createEndpoint } from "@/lib/services/webhooks";
import { freshDb, signUp } from "./helpers";

let db: Database;
let ctx: Ctx;
let admin: Ctx;

beforeAll(async () => {
  db = await freshDb();
  ctx = await signUp(db, "activation@exemple.fr");
  admin = { ...ctx, isPlatformAdmin: true, twoFactor: true } as Ctx;
});

afterEach(() => {
  delete process.env.FEATURE_WEBHOOKS;
});

describe("activation progressive", () => {
  it("tirage stable et proportionnel au pourcentage", () => {
    const id = randomUUID();
    expect(rolloutBucket(id, "webhooks")).toBe(rolloutBucket(id, "webhooks"));
    process.env.FEATURE_WEBHOOKS = "30";
    const on = Array.from({ length: 2000 }, () => featureEnabled({ id: randomUUID() }, "webhooks")).filter(Boolean).length;
    expect(on).toBeGreaterThan(500);
    expect(on).toBeLessThan(700);
    // Une entreprise activée à 30 % le reste à 60 %.
    const ids = Array.from({ length: 200 }, () => randomUUID()).filter((i) => featureEnabled({ id: i }, "webhooks"));
    process.env.FEATURE_WEBHOOKS = "60";
    expect(ids.every((i) => featureEnabled({ id: i }, "webhooks"))).toBe(true);
    process.env.FEATURE_WEBHOOKS = "off";
    expect(featureEnabled({ id, feature_flags: {} }, "webhooks")).toBe(false);
    expect(featureEnabled({ id, feature_flags: { webhooks: "on" } }, "webhooks")).toBe(true);
    process.env.FEATURE_WEBHOOKS = "on";
    expect(featureEnabled({ id, feature_flags: { webhooks: "off" } }, "webhooks")).toBe(false);
    expect(featureStates({ id }).find((f) => f.key === "webhooks")).toMatchObject({ percent: 100, enabled: true, override: null });
  });

  it("l'administration force une fonctionnalité pour une entreprise", async () => {
    await expect(setOrgFeature(ctx, ctx.orgId, "webhooks", "off")).rejects.toMatchObject({ status: 403 });
    await expect(setOrgFeature(admin, ctx.orgId, "inconnue", "off")).rejects.toMatchObject({ status: 400 });
    await setOrgFeature(admin, ctx.orgId, "webhooks", "off");
    await setOrgFeature(admin, ctx.orgId, "factures_structurees", "off");
    expect(await hasFeature(ctx, "webhooks")).toBe(false);
    await expect(createEndpoint(ctx, { url: "https://hooks.exemple.fr/a", events: ["invoice.paid"] })).rejects.toMatchObject({ status: 403 });
    await expect(einvoiceFile(ctx, randomUUID(), "ubl")).rejects.toMatchObject({ status: 403 });
    expect((await listNews(ctx)).some((n) => n.id === "webhooks")).toBe(false);
    await setOrgFeature(admin, ctx.orgId, "webhooks", "auto");
    await setOrgFeature(admin, ctx.orgId, "factures_structurees", "auto");
    expect(await hasFeature(ctx, "webhooks")).toBe(true);
    expect((await listNews(ctx)).some((n) => n.id === "webhooks")).toBe(true);
  });
});

describe("journal des nouveautés", () => {
  it("compte les nouveautés non lues depuis la dernière visite", async () => {
    const user = await signUp(db, "nouveautes@exemple.fr", "Menuiserie Neuve");
    // Un compte créé après une nouveauté ne la voit pas comme non lue.
    await db.query("UPDATE users SET created_at = '2026-10-11T10:00:00Z' WHERE id=$1", [user.userId]);
    const before = await unreadNewsCount(user);
    expect(before).toBeGreaterThan(0);
    await markNewsSeen(user);
    expect(await unreadNewsCount(user)).toBe(0);
    await db.query("INSERT INTO app_releases (version, notes, created_at) VALUES ('2.0.0', 'Nouvel éditeur', now() + interval '1 minute')");
    const news = await listNews(user);
    expect(news.find((n) => n.title === "Version 2.0.0")).toMatchObject({ unread: true, text: "Nouvel éditeur" });
    expect(await unreadNewsCount(user)).toBe(1);
    // Du plus récent au plus ancien.
    expect(news.map((n) => n.date)).toEqual([...news.map((n) => n.date)].sort().reverse());
  });
});
