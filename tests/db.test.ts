import { describe, expect, it } from "vitest";
import { openDatabase } from "@/lib/db";

describe("base de données", () => {
  it("applique les migrations sur une base vierge", async () => {
    const db = await openDatabase("memory://");
    const plans = await db.query<{ code: string }>("SELECT code FROM plans ORDER BY sort");
    expect(plans.map((p) => p.code)).toEqual(["decouverte", "independant", "professionnel", "entreprise"]);
    const big = await db.query<{ v: unknown }>("SELECT 9999999980000::bigint AS v");
    expect(Number(big[0].v)).toBe(9999999980000);
    await db.close();
  });
});
