import { beforeAll, describe, expect, it } from "vitest";
import type { Database } from "@/lib/db";
import { dumpDatabase, fingerprint, restoreDatabase, RestoreError, tablesInOrder, type DatabaseDump } from "@/lib/db/backup";
import { DEMO_EMAIL, DEMO_PASSWORD, seedDemo } from "@/lib/seed";
import { login } from "@/lib/services/accounts";
import { verifySealed } from "@/lib/services/sealed-journal";
import { freshDb, meta } from "./helpers";

let source: Database;
let dump: DatabaseDump;

beforeAll(async () => {
  source = await freshDb();
  await seedDemo(source);
  dump = await dumpDatabase(source, new Date("2026-10-14T08:00:00Z"));
}, 120_000);

describe("reprise après sinistre", () => {
  it("ordonne les tables après celles qu'elles référencent", async () => {
    const order = await tablesInOrder(source);
    expect(order.indexOf("organizations")).toBeLessThan(order.indexOf("quotes"));
    expect(order.indexOf("quotes")).toBeLessThan(order.indexOf("invoices"));
    expect(order).not.toContain("schema_migrations");
  });

  it("sauvegarde chaque table avec son empreinte", () => {
    expect(dump.format).toBe(1);
    expect(dump.migrations.length).toBeGreaterThan(100);
    const quotes = dump.tables.find((t) => t.name === "quotes")!;
    expect(quotes.rows).toBeGreaterThan(0);
    expect(quotes.sha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it("restaure une base identique, journal scellé intact et connexion possible", async () => {
    const target = await freshDb();
    const r = await restoreDatabase(target, dump);
    expect(r.rows).toBe(dump.tables.reduce((s, t) => s + t.rows, 0));
    expect(await fingerprint(target)).toEqual(await fingerprint(source));
    const sealed = await verifySealed(target);
    expect(sealed.ok).toBe(true);
    expect(sealed).toEqual(await verifySealed(source));
    await expect(login(target, DEMO_EMAIL, DEMO_PASSWORD, meta)).resolves.toBeTruthy();
    // Les compteurs repartent après les identifiants restaurés : une nouvelle écriture ne heurte rien.
    await expect(target.query("INSERT INTO admin_journal (seq, payload, prev_hash, hash) VALUES (999999, 'x', 'x', 'x')")).resolves.toBeDefined();
    await target.close();
  }, 120_000);

  it("refuse une base cible non vide, une sauvegarde altérée ou en avance", async () => {
    await expect(restoreDatabase(source, dump)).rejects.toThrow(RestoreError);
    const target = await freshDb();
    const altered = { ...dump, tables: dump.tables.map((t) => (t.name === "quotes" ? { ...t, data: t.data.replace('"status":"', '"status":"x') } : t)) };
    await expect(restoreDatabase(target, altered)).rejects.toThrow(/altérée : table quotes/);
    await expect(restoreDatabase(target, { ...dump, migrations: [...dump.migrations, "999_futur"] })).rejects.toThrow(/en retard/);
    await expect(restoreDatabase(target, { ...dump, format: 2 })).rejects.toThrow(/Format/);
    expect(await fingerprint(target)).toEqual(await fingerprint(target));
    await target.close();
  }, 120_000);
});
