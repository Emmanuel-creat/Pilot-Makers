/** Variantes de devis : section rattachée à un choix proposé au client, avec son libellé. */
export const sql = /* sql */ `
ALTER TABLE quote_sections ADD COLUMN choice_name text NOT NULL DEFAULT '';
ALTER TABLE quote_sections ADD COLUMN choice_label text NOT NULL DEFAULT '';
`;
