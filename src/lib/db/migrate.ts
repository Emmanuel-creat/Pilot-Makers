import type { Database } from "./index";
import { sql as m001 } from "./migrations/001_initial";
import { sql as m002 } from "./migrations/002_two_factor";
import { sql as m003 } from "./migrations/003_templates_ouvrages";
import { sql as m004 } from "./migrations/004_invoices";
import { sql as m005 } from "./migrations/005_consumer";
import { sql as m006 } from "./migrations/006_archive_mediateur";
import { sql as m007 } from "./migrations/007_sous_traitance";
import { sql as m008 } from "./migrations/008_refus";
import { sql as m009 } from "./migrations/009_options";
import { sql as m010 } from "./migrations/010_catalogue_etiquettes";
import { sql as m011 } from "./migrations/011_demandes";
import { sql as m012 } from "./migrations/012_situations";
import { sql as m013 } from "./migrations/013_echeanciers";
import { sql as m014 } from "./migrations/014_avenants";
import { sql as m015 } from "./migrations/015_tarifs";
import { sql as m016 } from "./migrations/016_limitation_debit";
import { sql as m017 } from "./migrations/017_assistant_habitudes";
import { sql as m018 } from "./migrations/018_chutes";
import { sql as m019 } from "./migrations/019_objectifs";

/** Migrations ordonnées. Ne jamais modifier une migration publiée : en ajouter une nouvelle. */
export const migrations: { id: string; sql: string }[] = [
  { id: "001_initial", sql: m001 },
  { id: "002_two_factor", sql: m002 },
  { id: "003_templates_ouvrages", sql: m003 },
  { id: "004_invoices", sql: m004 },
  { id: "005_consumer", sql: m005 },
  { id: "006_archive_mediateur", sql: m006 },
  { id: "007_sous_traitance", sql: m007 },
  { id: "008_refus", sql: m008 },
  { id: "009_options", sql: m009 },
  { id: "010_catalogue_etiquettes", sql: m010 },
  { id: "011_demandes", sql: m011 },
  { id: "012_situations", sql: m012 },
  { id: "013_echeanciers", sql: m013 },
  { id: "014_avenants", sql: m014 },
  { id: "015_tarifs", sql: m015 },
  { id: "016_limitation_debit", sql: m016 },
  { id: "017_assistant_habitudes", sql: m017 },
  { id: "018_chutes", sql: m018 },
  { id: "019_objectifs", sql: m019 },
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
