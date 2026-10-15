import { describe, expect, it } from "vitest";
import { compareStatuses, CREATION_DAY, MICRO_CEILING, readAmount } from "@/lib/business-creation";

describe("créer son entreprise : statut", () => {
  it("conseille la micro-entreprise quand les charges sont faibles", () => {
    const c = compareStatuses(30_000, 4_000);
    expect(c.best).toBe("micro");
    const micro = c.rows.find((r) => r.key === "micro")!;
    expect(micro.contributions).toBe(6_360);
    expect(micro.net).toBe(30_000 - 4_000 - 6_360);
    expect(c.rows.find((r) => r.key === "ei_reel")!.net).toBe(Math.round(26_000 / 1.45));
    expect(c.advice.at(-1)).toMatch(/293 B/);
  });

  it("conseille un régime au réel quand les charges pèsent lourd", () => {
    const c = compareStatuses(60_000, 30_000);
    expect(c.best).toBe("ei_reel");
    expect(c.advice[0]).toContain("50 %");
    expect(c.advice[1]).toMatch(/facturez la TVA/);
    const sasu = c.rows.find((r) => r.key === "sasu")!;
    expect(sasu.net).toBe(Math.round(30_000 / 1.82));
    expect(sasu.contributions + sasu.net).toBe(30_000);
  });

  it("écarte la micro-entreprise au-dessus du plafond et borne les saisies", () => {
    const c = compareStatuses(MICRO_CEILING + 1, 10_000);
    expect(c.rows[0]).toMatchObject({ key: "micro", eligible: false });
    expect(c.best).not.toBe("micro");
    expect(compareStatuses(0, 5_000).rows.every((r) => r.net >= 0)).toBe(true);
    expect(readAmount("45 000,50")).toBe(45000.5);
    expect(readAmount("-3")).toBeNull();
    expect(readAmount("abc")).toBeNull();
    expect(CREATION_DAY.length).toBeGreaterThanOrEqual(6);
  });
});
