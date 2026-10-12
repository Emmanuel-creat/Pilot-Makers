/** Avenants : travaux supplémentaires rattachés à un devis accepté. */
export const sql = /* sql */ `
ALTER TABLE quotes ADD COLUMN amends_quote_id uuid REFERENCES quotes(id) ON DELETE SET NULL;
ALTER TABLE quotes ADD COLUMN amendment_index integer;
CREATE INDEX quotes_amends_idx ON quotes (amends_quote_id) WHERE amends_quote_id IS NOT NULL;
`;
