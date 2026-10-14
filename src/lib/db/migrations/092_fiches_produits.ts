/** Fiches produits enrichies : marque, performances, certifications, garantie et délai d'approvisionnement. */
export const sql = /* sql */ `
ALTER TABLE catalog_items ADD COLUMN product_info jsonb NOT NULL DEFAULT '{}';
`;
