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
import { sql as m020 } from "./migrations/020_revision_prix";
import { sql as m021 } from "./migrations/021_webhooks";
import { sql as m022 } from "./migrations/022_activation_nouveautes";
import { sql as m023 } from "./migrations/023_chantiers";
import { sql as m024 } from "./migrations/024_journal_reception";
import { sql as m025 } from "./migrations/025_planning";
import { sql as m026 } from "./migrations/026_api_publique";
import { sql as m027 } from "./migrations/027_abonnements_automatisation";
import { sql as m028 } from "./migrations/028_pointage";
import { sql as m029 } from "./migrations/029_couts_chantier";
import { sql as m030 } from "./migrations/030_commandes_fournisseurs";
import { sql as m031 } from "./migrations/031_abonnement_agenda";
import { sql as m032 } from "./migrations/032_sous_traitants";
import { sql as m033 } from "./migrations/033_notes_de_frais";
import { sql as m034 } from "./migrations/034_fonctions";
import { sql as m035 } from "./migrations/035_espace_client";
import { sql as m036 } from "./migrations/036_devis_sous_traitants";
import { sql as m037 } from "./migrations/037_itineraires";
import { sql as m038 } from "./migrations/038_metres";
import { sql as m039 } from "./migrations/039_mise_en_page";
import { sql as m040 } from "./migrations/040_journal_scelle_statut";
import { sql as m041 } from "./migrations/041_signature_sur_place";
import { sql as m042 } from "./migrations/042_lots_niveaux";
import { sql as m043 } from "./migrations/043_vitrine";
import { sql as m044 } from "./migrations/044_tarifs_fournisseurs";
import { sql as m045 } from "./migrations/045_feuille_de_route";
import { sql as m046 } from "./migrations/046_personnalisation_pdf";
import { sql as m047 } from "./migrations/047_aides_renovation";
import { sql as m048 } from "./migrations/048_pilotage_financier";
import { sql as m049 } from "./migrations/049_comptabilite";

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
  { id: "020_revision_prix", sql: m020 },
  { id: "021_webhooks", sql: m021 },
  { id: "022_activation_nouveautes", sql: m022 },
  { id: "023_chantiers", sql: m023 },
  { id: "024_journal_reception", sql: m024 },
  { id: "025_planning", sql: m025 },
  { id: "026_api_publique", sql: m026 },
  { id: "027_abonnements_automatisation", sql: m027 },
  { id: "028_pointage", sql: m028 },
  { id: "029_couts_chantier", sql: m029 },
  { id: "030_commandes_fournisseurs", sql: m030 },
  { id: "031_abonnement_agenda", sql: m031 },
  { id: "032_sous_traitants", sql: m032 },
  { id: "033_notes_de_frais", sql: m033 },
  { id: "034_fonctions", sql: m034 },
  { id: "035_espace_client", sql: m035 },
  { id: "036_devis_sous_traitants", sql: m036 },
  { id: "037_itineraires", sql: m037 },
  { id: "038_metres", sql: m038 },
  { id: "039_mise_en_page", sql: m039 },
  { id: "040_journal_scelle_statut", sql: m040 },
  { id: "041_signature_sur_place", sql: m041 },
  { id: "042_lots_niveaux", sql: m042 },
  { id: "043_vitrine", sql: m043 },
  { id: "044_tarifs_fournisseurs", sql: m044 },
  { id: "045_feuille_de_route", sql: m045 },
  { id: "046_personnalisation_pdf", sql: m046 },
  { id: "047_aides_renovation", sql: m047 },
  { id: "048_pilotage_financier", sql: m048 },
  { id: "049_comptabilite", sql: m049 },
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
