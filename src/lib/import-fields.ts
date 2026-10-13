/**
 * Champs proposés quand une colonne d'un fichier importé n'est pas reconnue : l'artisan choisit
 * lui-même à quoi elle correspond. Partagé entre le navigateur et le serveur.
 */

export type ImportKind = "customers" | "catalog";

export const IMPORT_FIELDS: Record<ImportKind, { value: string; label: string }[]> = {
  customers: [
    { value: "type", label: "Type de client" },
    { value: "civility", label: "Civilité" },
    { value: "first_name", label: "Prénom" },
    { value: "last_name", label: "Nom" },
    { value: "company_name", label: "Société" },
    { value: "billing_line1", label: "Adresse" },
    { value: "billing_line2", label: "Complément d'adresse" },
    { value: "billing_postal_code", label: "Code postal" },
    { value: "billing_city", label: "Ville" },
    { value: "billing_country", label: "Pays" },
    { value: "site_line1", label: "Adresse du chantier" },
    { value: "site_postal_code", label: "Code postal du chantier" },
    { value: "site_city", label: "Ville du chantier" },
    { value: "email", label: "E-mail" },
    { value: "phone", label: "Téléphone" },
    { value: "siret", label: "SIRET" },
    { value: "siren", label: "SIREN" },
    { value: "vat_number", label: "Numéro de TVA" },
    { value: "notes", label: "Notes" },
    { value: "tags", label: "Étiquettes" },
  ],
  catalog: [
    { value: "reference", label: "Référence" },
    { value: "name", label: "Désignation" },
    { value: "description", label: "Description" },
    { value: "category", label: "Catégorie" },
    { value: "subcategory", label: "Famille" },
    { value: "unit", label: "Unité" },
    { value: "unit_cost", label: "Prix d'achat HT" },
    { value: "hourly_cost", label: "Coût horaire" },
    { value: "unit_price", label: "Prix de vente HT" },
    { value: "vat_percent", label: "Taux de TVA" },
    { value: "waste_percent", label: "Pertes et chutes" },
    { value: "supplier", label: "Fournisseur" },
    { value: "supplier_ref", label: "Référence fournisseur" },
    { value: "duration_minutes", label: "Temps de pose (minutes)" },
    { value: "tags", label: "Étiquettes" },
  ],
};

/** Valeur d'en-tête qui n'est reconnue par aucun import : la colonne est ignorée. */
export const IGNORED_COLUMN = "__colonne_ignoree__";

export interface ImportColumn {
  index: number;
  header: string;
  field: string | null;
  sample: string;
}
