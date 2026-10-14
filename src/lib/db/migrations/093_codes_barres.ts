/** Codes-barres des articles du catalogue et du stock, pour les retrouver en les scannant. */
export const sql = /* sql */ `
ALTER TABLE catalog_items ADD COLUMN ean text NOT NULL DEFAULT '';
ALTER TABLE stock_items ADD COLUMN ean text NOT NULL DEFAULT '';
CREATE INDEX catalog_items_ean ON catalog_items (org_id, ean) WHERE ean <> '';
CREATE INDEX stock_items_ean ON stock_items (org_id, ean) WHERE ean <> '';
CREATE INDEX supplier_prices_ean ON supplier_prices (org_id, ean) WHERE ean <> '';
`;
