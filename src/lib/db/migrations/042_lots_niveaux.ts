/** Devis multi-bâtiments : chaque lot peut appartenir à un regroupement (bâtiment, étage, zone) avec son sous-total. */
export const sql = /* sql */ `
ALTER TABLE quote_sections ADD COLUMN grp text NOT NULL DEFAULT '';
`;
