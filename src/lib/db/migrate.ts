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
import { sql as m050 } from "./migrations/050_photos_devis";
import { sql as m051 } from "./migrations/051_fiches_techniques";
import { sql as m052 } from "./migrations/052_file_de_taches";
import { sql as m053 } from "./migrations/053_cles_acces";
import { sql as m054 } from "./migrations/054_notifications_telephone";
import { sql as m055 } from "./migrations/055_releves_bancaires";
import { sql as m056 } from "./migrations/056_assistance_humaine";
import { sql as m057 } from "./migrations/057_menu_personnalise";
import { sql as m058 } from "./migrations/058_fiche_etablissement";
import { sql as m059 } from "./migrations/059_variantes";
import { sql as m060 } from "./migrations/060_presence";
import { sql as m061 } from "./migrations/061_garanties";
import { sql as m062 } from "./migrations/062_absences";
import { sql as m063 } from "./migrations/063_habilitations";
import { sql as m064 } from "./migrations/064_parc";
import { sql as m065 } from "./migrations/065_budget";
import { sql as m066 } from "./migrations/066_recouvrement";
import { sql as m067 } from "./migrations/067_acquisition";
import { sql as m068 } from "./migrations/068_labels";
import { sql as m069 } from "./migrations/069_deplacements";
import { sql as m070 } from "./migrations/070_messages_chantier";
import { sql as m071 } from "./migrations/071_rapport_mensuel";
import { sql as m072 } from "./migrations/072_avis_clients";
import { sql as m073 } from "./migrations/073_visites";
import { sql as m074 } from "./migrations/074_doe";
import { sql as m075 } from "./migrations/075_prevention";
import { sql as m076 } from "./migrations/076_dechets";
import { sql as m077 } from "./migrations/077_coordination";
import { sql as m078 } from "./migrations/078_stock";
import { sql as m079 } from "./migrations/079_locations";
import { sql as m080 } from "./migrations/080_commandes_groupees";
import { sql as m081 } from "./migrations/081_livraisons_retours";
import { sql as m082 } from "./migrations/082_ecarts_prix";
import { sql as m083 } from "./migrations/083_empreinte_carbone";
import { sql as m084 } from "./migrations/084_parrainage";
import { sql as m085 } from "./migrations/085_conges_payes";
import { sql as m086 } from "./migrations/086_apprentis";
import { sql as m087 } from "./migrations/087_decomptes";
import { sql as m088 } from "./migrations/088_carte";
import { sql as m089 } from "./migrations/089_campagnes";
import { sql as m090 } from "./migrations/090_bilan";
import { sql as m091 } from "./migrations/091_veille";
import { sql as m092 } from "./migrations/092_fiches_produits";
import { sql as m093 } from "./migrations/093_codes_barres";
import { sql as m094 } from "./migrations/094_meteo";
import { sql as m095 } from "./migrations/095_reperes";
import { sql as m096 } from "./migrations/096_financements";
import { sql as m097 } from "./migrations/097_reseaux";
import { sql as m098 } from "./migrations/098_metres";
import { sql as m099 } from "./migrations/099_score_sante";
import { sql as m100 } from "./migrations/100_conseils";
import { sql as m101 } from "./migrations/101_carnet_logement";
import { sql as m102 } from "./migrations/102_entretien";
import { sql as m103 } from "./migrations/103_marches_publics";
import { sql as m104 } from "./migrations/104_devises";
import { sql as m105 } from "./migrations/105_retards";
import { sql as m106 } from "./migrations/106_bourse";
import { sql as m107 } from "./migrations/107_etapes";
import { sql as m108 } from "./migrations/108_recommandations";
import { sql as m109 } from "./migrations/109_achats_groupes";
import { sql as m110 } from "./migrations/110_groupements";
import { sql as m111 } from "./migrations/111_diagnostics_energie";
import { sql as m112 } from "./migrations/112_langue_equipe";
import { sql as m113 } from "./migrations/113_tarifs_preferentiels";
import { sql as m114 } from "./migrations/114_entraide";
import { sql as m115 } from "./migrations/115_comptabilite_continue";
import { sql as m116 } from "./migrations/116_mise_en_relation";
import { sql as m117 } from "./migrations/117_formation";
import { sql as m118 } from "./migrations/118_base_ouvrages";
import { sql as m119 } from "./migrations/119_note_confiance";
import { sql as m120 } from "./migrations/120_renovation_coordonnee";
import { sql as m121 } from "./migrations/121_fin_de_journee";
import { sql as m122 } from "./migrations/122_reprise_entreprise";
import { sql as m123 } from "./migrations/123_bourse_modeles";
import { sql as m124 } from "./migrations/124_attestation_gestion";
import { sql as m125 } from "./migrations/125_remise_cheques";
import { sql as m126 } from "./migrations/126_mode_absence";
import { sql as m127 } from "./migrations/127_carbone_chantier";
import { sql as m128 } from "./migrations/128_bilan_matiere";
import { sql as m129 } from "./migrations/129_retours_utilisateurs";
import { sql as m130 } from "./migrations/130_engagements";
import { sql as m131 } from "./migrations/131_parcours_renovation";

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
  { id: "050_photos_devis", sql: m050 },
  { id: "051_fiches_techniques", sql: m051 },
  { id: "052_file_de_taches", sql: m052 },
  { id: "053_cles_acces", sql: m053 },
  { id: "054_notifications_telephone", sql: m054 },
  { id: "055_releves_bancaires", sql: m055 },
  { id: "056_assistance_humaine", sql: m056 },
  { id: "057_menu_personnalise", sql: m057 },
  { id: "058_fiche_etablissement", sql: m058 },
  { id: "059_variantes", sql: m059 },
  { id: "060_presence", sql: m060 },
  { id: "061_garanties", sql: m061 },
  { id: "062_absences", sql: m062 },
  { id: "063_habilitations", sql: m063 },
  { id: "064_parc", sql: m064 },
  { id: "065_budget", sql: m065 },
  { id: "066_recouvrement", sql: m066 },
  { id: "067_acquisition", sql: m067 },
  { id: "068_labels", sql: m068 },
  { id: "069_deplacements", sql: m069 },
  { id: "070_messages_chantier", sql: m070 },
  { id: "071_rapport_mensuel", sql: m071 },
  { id: "072_avis_clients", sql: m072 },
  { id: "073_visites", sql: m073 },
  { id: "074_doe", sql: m074 },
  { id: "075_prevention", sql: m075 },
  { id: "076_dechets", sql: m076 },
  { id: "077_coordination", sql: m077 },
  { id: "078_stock", sql: m078 },
  { id: "079_locations", sql: m079 },
  { id: "080_commandes_groupees", sql: m080 },
  { id: "081_livraisons_retours", sql: m081 },
  { id: "082_ecarts_prix", sql: m082 },
  { id: "083_empreinte_carbone", sql: m083 },
  { id: "084_parrainage", sql: m084 },
  { id: "085_conges_payes", sql: m085 },
  { id: "086_apprentis", sql: m086 },
  { id: "087_decomptes", sql: m087 },
  { id: "088_carte", sql: m088 },
  { id: "089_campagnes", sql: m089 },
  { id: "090_bilan", sql: m090 },
  { id: "091_veille", sql: m091 },
  { id: "092_fiches_produits", sql: m092 },
  { id: "093_codes_barres", sql: m093 },
  { id: "094_meteo", sql: m094 },
  { id: "095_reperes", sql: m095 },
  { id: "096_financements", sql: m096 },
  { id: "097_reseaux", sql: m097 },
  { id: "098_metres", sql: m098 },
  { id: "099_score_sante", sql: m099 },
  { id: "100_conseils", sql: m100 },
  { id: "101_carnet_logement", sql: m101 },
  { id: "102_entretien", sql: m102 },
  { id: "103_marches_publics", sql: m103 },
  { id: "104_devises", sql: m104 },
  { id: "105_retards", sql: m105 },
  { id: "106_bourse", sql: m106 },
  { id: "107_etapes", sql: m107 },
  { id: "108_recommandations", sql: m108 },
  { id: "109_achats_groupes", sql: m109 },
  { id: "110_groupements", sql: m110 },
  { id: "111_diagnostics_energie", sql: m111 },
  { id: "112_langue_equipe", sql: m112 },
  { id: "113_tarifs_preferentiels", sql: m113 },
  { id: "114_entraide", sql: m114 },
  { id: "115_comptabilite_continue", sql: m115 },
  { id: "116_mise_en_relation", sql: m116 },
  { id: "117_formation", sql: m117 },
  { id: "118_base_ouvrages", sql: m118 },
  { id: "119_note_confiance", sql: m119 },
  { id: "120_renovation_coordonnee", sql: m120 },
  { id: "121_fin_de_journee", sql: m121 },
  { id: "122_reprise_entreprise", sql: m122 },
  { id: "123_bourse_modeles", sql: m123 },
  { id: "124_attestation_gestion", sql: m124 },
  { id: "125_remise_cheques", sql: m125 },
  { id: "126_mode_absence", sql: m126 },
  { id: "127_carbone_chantier", sql: m127 },
  { id: "128_bilan_matiere", sql: m128 },
  { id: "129_retours_utilisateurs", sql: m129 },
  { id: "130_engagements", sql: m130 },
  { id: "131_parcours_renovation", sql: m131 },
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
