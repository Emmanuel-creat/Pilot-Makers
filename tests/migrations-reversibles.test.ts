import { describe, expect, it } from "vitest";
import { FIRST_REVERSIBLE, migrations, rollbackMigrations, runMigrations } from "@/lib/db/migrate";
import { freshDb } from "./helpers";

const columns = async (db: Awaited<ReturnType<typeof freshDb>>, table: string) =>
  (await db.query<{ column_name: string }>("SELECT column_name FROM information_schema.columns WHERE table_name=$1", [table])).map((r) => r.column_name);

describe("migrations réversibles", () => {
  it("toute migration à partir de la première réversible a son retour arrière", () => {
    const start = migrations.findIndex((m) => m.id === FIRST_REVERSIBLE);
    expect(start).toBeGreaterThan(0);
    const missing = migrations.slice(start).filter((m) => !m.down?.trim());
    expect(missing.map((m) => m.id)).toEqual([]);
  });

  it("défait les migrations réversibles puis les rejoue à l'identique", async () => {
    const db = await freshDb();
    const reversible = migrations.length - migrations.findIndex((m) => m.id === FIRST_REVERSIBLE);
    const before = await columns(db, "quotes");
    expect(before).toContain("agency_id");
    const undone = await rollbackMigrations(db, reversible);
    expect(undone).toEqual(
      migrations
        .slice(-reversible)
        .map((m) => m.id)
        .reverse(),
    );
    expect(await columns(db, "quotes")).not.toContain("agency_id");
    expect(await columns(db, "page_feedback")).toEqual([]);
    await runMigrations(db);
    expect((await columns(db, "quotes")).sort()).toEqual(before.sort());
    expect(await columns(db, "page_feedback")).toContain("useful");
  });

  it("refuse de défaire une migration sans retour arrière", async () => {
    const db = await freshDb();
    const reversible = migrations.length - migrations.findIndex((m) => m.id === FIRST_REVERSIBLE);
    await expect(rollbackMigrations(db, reversible + 1)).rejects.toThrow(/n'a pas de retour arrière : restaurez/);
    // Les migrations réversibles ont été défaites avant l'arrêt, la précédente est intacte.
    const applied = (await db.query<{ id: string }>("SELECT id FROM schema_migrations")).map((r) => r.id);
    expect(applied).toContain(migrations[migrations.length - reversible - 1].id);
    await runMigrations(db);
  });
});
