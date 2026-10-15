import { beforeAll, describe, expect, it } from "vitest";
import type { Database } from "@/lib/db";
import type { Ctx } from "@/lib/services/context";
import { areaOf, weeklyFeedback } from "@/lib/feedback";
import { feedbackCount, feedbackReport, myFeedback, resolveFeedback, sendFeedback } from "@/lib/services/feedback";
import { freshDb, signUp } from "./helpers";

let db: Database;
let alice: Ctx;
let bob: Ctx;
let admin: Ctx;

beforeAll(async () => {
  db = await freshDb();
  alice = await signUp(db, "alice-fb@exemple.fr");
  bob = await signUp(db, "bob-fb@exemple.fr", "Plomberie Bob");
  admin = { ...alice, isPlatformAdmin: true, twoFactor: true } as Ctx;
});

describe("retours mesurés : calculs", () => {
  it("range chaque adresse dans sa rubrique", () => {
    expect(areaOf("/app")).toBe("accueil");
    expect(areaOf("/app/devis/123/modifier?x=1")).toBe("devis");
    expect(areaOf("/app/factures")).toBe("factures");
    expect(areaOf("/ouvrages")).toBe("autre");
  });

  it("compare la semaine à la précédente et met en tête les rubriques qui gênent", () => {
    const now = new Date("2026-10-15T12:00:00Z");
    const ago = (d: number) => new Date(now.getTime() - d * 86400000).toISOString();
    const r = weeklyFeedback(
      [
        { area: "devis", useful: true, createdAt: ago(1) },
        { area: "devis", useful: true, createdAt: ago(2) },
        { area: "devis", useful: false, createdAt: ago(9) },
        { area: "factures", useful: false, createdAt: ago(1) },
        { area: "factures", useful: false, createdAt: ago(3) },
        { area: "factures", useful: true, createdAt: ago(10) },
        { area: "clients", useful: true, createdAt: ago(20) },
      ],
      now,
    );
    expect(r.total).toBe(4);
    expect(r.satisfaction).toBe(50);
    expect(r.previousSatisfaction).toBe(50);
    expect(r.areas.map((a) => a.area)).toEqual(["factures", "devis"]);
    expect(r.areas[0]).toMatchObject({ count: 2, useful: 0, satisfaction: 0, previousSatisfaction: 100, trend: -100 });
    expect(r.areas[1]).toMatchObject({ satisfaction: 100, previousSatisfaction: 0, trend: 100 });
    expect(weeklyFeedback([], now)).toMatchObject({ total: 0, satisfaction: null, areas: [] });
  });
});

describe("retours mesurés : envoi et suivi", () => {
  it("garde un retour par personne, rubrique et jour, sans identifiant dans l'adresse", async () => {
    await sendFeedback(alice, { path: "/app/devis/0b9c2b4e-1111-4222-8333-444455556666", useful: false, comment: "Le bouton d'envoi est trop loin" });
    await sendFeedback(alice, { path: "/app/devis", useful: true, comment: "" });
    await sendFeedback(bob, { path: "/app/factures", useful: false, comment: "" });
    expect(await feedbackCount(alice)).toBe(1);
    const mine = await myFeedback(alice);
    expect(mine).toHaveLength(1);
    // Le second envoi sans commentaire garde le commentaire du jour
    expect(mine[0]).toMatchObject({ area: "devis", useful: true, comment: "Le bouton d'envoi est trop loin", status: "nouveau" });
    await expect(sendFeedback(alice, { path: "/admin", useful: true })).rejects.toMatchObject({ status: 400 });
    await expect(sendFeedback(alice, { path: "/app", useful: true, comment: "x".repeat(1001) })).rejects.toMatchObject({ status: 400 });
  });

  it("réserve la synthèse à l'équipe et transmet la réponse à l'auteur", async () => {
    await expect(feedbackReport(alice)).rejects.toMatchObject({ status: 403 });
    const r = await feedbackReport(admin);
    expect(r.total).toBe(2);
    expect(r.satisfaction).toBe(50);
    expect(r.comments).toHaveLength(1);
    expect(r.comments[0].path).toBe("/app/devis");
    await expect(resolveFeedback(alice, r.comments[0].id, "x")).rejects.toMatchObject({ status: 403 });
    await expect(resolveFeedback(admin, "nope", "x")).rejects.toMatchObject({ status: 404 });
    await resolveFeedback(admin, r.comments[0].id, "Bouton remonté en haut de page");
    expect((await myFeedback(alice))[0]).toMatchObject({ status: "traite", response: "Bouton remonté en haut de page" });
    expect(await myFeedback(bob)).toHaveLength(0);
  });
});
