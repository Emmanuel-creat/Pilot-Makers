/** Pertes et chutes par matériau : taux du catalogue, repris sur la ligne du devis. */
export const sql = /* sql */ `
ALTER TABLE catalog_items ADD COLUMN waste_bp integer NOT NULL DEFAULT 0 CHECK (waste_bp BETWEEN 0 AND 5000);
ALTER TABLE quote_lines ADD COLUMN waste_percent text NOT NULL DEFAULT '';
`;
