import type { Database } from "./index";
import { sql as m001 } from "./migrations/001_initial";
import { sql as m002 } from "./migrations/002_two_factor";
import { sql as m003 } from "./migrations/003_templates_ouvrages";
import { sql as m004 } from "./migrations/004_invoices";
import { sql as m005 } from "./migrations/005_consumer";

/** Migrations ordonnées. Ne jamais modifier une migration publiée : en ajouter une nouvelle. */
export const migrations: { id: string; sql: string }[] = [
  { id: "001_initial", sql: m001 },
  { id: "002_two_factor", sql: m002 },
  { id: "003_templates_ouvrages", sql: m003 },
  { id: "004_invoices", sql: m004 },
  { id: "005_consumer", sql: m005 },
];

export async function runMigrations(db: Database): Promise<void> {
  await db.exec(
    "CREATE TABLE IF NOT EXISTS schema_migrations (id text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())",
  );
  const done = new Set((await db.query<{ id: string }>("SELECT id FROM schema_migrations")).map((r) => r.id));
  for (const m of migrations) {
    if (done.has(m.id)) continue;
    await db.transaction(async (tx) => {
      // Les instructions sont séparées pour rester compatibles avec les requêtes paramétrées.
      for (const statement of splitStatements(m.sql)) await tx.query(statement);
      await tx.query("INSERT INTO schema_migrations (id) VALUES ($1)", [m.id]);
    });
  }
}

function splitStatements(sql: string): string[] {
  return sql
    .split(/;\s*\n/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}
