/** Empreinte carbone des articles du catalogue, en grammes d'équivalent CO2 par unité, avec sa source. */
export const sql = /* sql */ `
ALTER TABLE catalog_items ADD COLUMN carbon_g bigint CHECK (carbon_g IS NULL OR carbon_g >= 0);
ALTER TABLE catalog_items ADD COLUMN carbon_source text NOT NULL DEFAULT '';
`;
