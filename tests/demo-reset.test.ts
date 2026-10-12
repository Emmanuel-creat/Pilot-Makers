import { describe, expect, it } from "vitest";
import { one } from "@/lib/db";
import { DEMO_EMAIL, resetDemo, seedDemo } from "@/lib/seed";
import { freshDb } from "./helpers";

describe("démonstration remise à zéro", () => {
  it("efface les modifications du compte de démonstration et garde l'administrateur", async () => {
    const db = await freshDb();
    await seedDemo(db);
    const before = await one<{ id: string; org_id: string }>(
      db,
      "SELECT u.id, m.org_id FROM users u JOIN memberships m ON m.user_id=u.id WHERE u.email=$1",
      [DEMO_EMAIL],
    );
    await db.query("UPDATE organizations SET trade_name='Modifié par un visiteur' WHERE id=$1", [before!.org_id]);
    const admins = Number((await one<{ n: unknown }>(db, "SELECT count(*) AS n FROM users WHERE is_platform_admin"))!.n);

    await resetDemo(db);

    const after = await one<{ id: string; org_id: string; trade_name: string }>(
      db,
      "SELECT u.id, m.org_id, o.trade_name FROM users u JOIN memberships m ON m.user_id=u.id JOIN organizations o ON o.id=m.org_id WHERE u.email=$1",
      [DEMO_EMAIL],
    );
    expect(after!.id).not.toBe(before!.id);
    expect(after!.trade_name).not.toBe("Modifié par un visiteur");
    expect(await one(db, "SELECT 1 FROM organizations WHERE id=$1", [before!.org_id])).toBeNull();
    expect(Number((await one<{ n: unknown }>(db, "SELECT count(*) AS n FROM users WHERE is_platform_admin"))!.n)).toBe(admins);
    expect(Number((await one<{ n: unknown }>(db, "SELECT count(*) AS n FROM quotes WHERE org_id=$1", [after!.org_id]))!.n)).toBeGreaterThan(0);
  });
});
