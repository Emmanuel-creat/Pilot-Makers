/** Étiquettes libres et dernière utilisation des prestations du catalogue. */
export const sql = /* sql */ `
ALTER TABLE catalog_items ADD COLUMN tags text[] NOT NULL DEFAULT '{}';
ALTER TABLE catalog_items ADD COLUMN last_used_at timestamptz;
CREATE INDEX catalog_items_tags ON catalog_items USING gin (tags);
`;
