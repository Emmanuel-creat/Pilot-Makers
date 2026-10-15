import { beforeAll, describe, expect, it } from "vitest";
import type { Database } from "@/lib/db";
import { activityIndex, lastMonths, median, monthLabel, type OrgMonth } from "@/lib/activity-index";
import type { Ctx } from "@/lib/services/context";
import { orgMonths, publicActivityIndex } from "@/lib/services/activity-index";
import { createQuote } from "@/lib/services/quotes";
import { freshDb, signUp } from "./helpers";

const om = (orgId: string, month: string, invoiced: number, issued = 2, accepted = 1, acceptedHt = 100000): OrgMonth => ({
  orgId,
  month,
  quotesIssued: issued,
  quotesAccepted: accepted,
  acceptedHtCents: acceptedHt,
  invoicedHtCents: invoiced,
});

describe("calcul de l'indice", () => {
  it("mois complets précédents, du plus ancien au plus récent", () => {
    expect(lastMonths(new Date("2026-10-15T12:00:00Z"), 3)).toEqual(["2026-07", "2026-08", "2026-09"]);
    expect(lastMonths(new Date("2026-01-05T12:00:00Z"), 2)).toEqual(["2025-11", "2025-12"]);
    expect(monthLabel("2026-09")).toBe("septembre 2026");
    expect(median([3, 1, 2, 10])).toBe(2.5);
    expect(median([])).toBeNull();
  });

  it("base 100 au premier mois publié, médianes et taux global", () => {
    const orgs = ["a", "b", "c"];
    const rows = [...orgs.map((o, i) => om(o, "2026-08", 100000 * (i + 1))), ...orgs.map((o, i) => om(o, "2026-09", 110000 * (i + 1), 4, 1, 120000))];
    const r = activityIndex(rows, ["2026-07", "2026-08", "2026-09"], 3);
    expect(r.base).toBe("2026-08");
    expect(r.points[0]).toMatchObject({ month: "2026-07", invoiced: null, contributors: 0 });
    expect(r.points[1]).toMatchObject({ invoiced: 100, orders: 100, acceptRate: 50, contributors: 3 });
    expect(r.points[2]).toMatchObject({ invoiced: 110, orders: 120, acceptRate: 25 });
    expect(r.change).toBe(10);
  });

  it("un mois avec trop peu d'entreprises n'est jamais publié", () => {
    const rows = [om("a", "2026-09", 500000), om("b", "2026-09", 700000), om("c", "2026-09", 0, 0)];
    const r = activityIndex(rows, ["2026-09"], 3);
    expect(r.points[0]).toEqual({ month: "2026-09", contributors: 0, invoiced: null, orders: null, acceptRate: null });
    expect(r.base).toBeNull();
    expect(r.latest).toBeNull();
  });
});

describe("agrégats des entreprises contributrices", () => {
  let db: Database;
  let a: Ctx;
  let b: Ctx;

  beforeAll(async () => {
    db = await freshDb();
    a = await signUp(db, "indice-a@exemple.fr");
    b = await signUp(db, "indice-b@exemple.fr");
    await db.query("UPDATE organizations SET benchmark_optin_at=now() WHERE id=$1", [a.orgId]);
    for (const [ctx, status] of [
      [a, "accepted"],
      [a, "sent"],
      [b, "accepted"],
    ] as const) {
      const id = await createQuote(ctx, { title: "Devis" });
      await db.query("UPDATE quotes SET status=$2, issued_at='2026-09-10T10:00:00Z', total_ht_cents=250000 WHERE id=$1", [id, status]);
    }
  });

  it("seules les entreprises volontaires contribuent, et rien n'est publié sous le seuil", async () => {
    const rows = await orgMonths(db, ["2026-09"]);
    expect(rows).toEqual([{ orgId: a.orgId, month: "2026-09", quotesIssued: 2, quotesAccepted: 1, acceptedHtCents: 250000, invoicedHtCents: 0 }]);
    const pub = await publicActivityIndex(db, new Date("2026-10-15T12:00:00Z"));
    expect(pub.points.every((p) => p.invoiced == null)).toBe(true);
  });
});
