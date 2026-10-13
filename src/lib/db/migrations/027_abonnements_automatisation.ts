/** Abonnements webhooks créés par les outils d'automatisation au moyen d'une clé d'API. */
export const sql = /* sql */ `
ALTER TABLE webhook_endpoints ADD COLUMN api_key_id uuid REFERENCES api_keys(id) ON DELETE CASCADE;
ALTER TABLE webhook_endpoints ADD COLUMN label text NOT NULL DEFAULT '';
`;
