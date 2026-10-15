/** Devis préparés sans réseau : une clé par envoi, pour ne jamais créer deux fois le même devis. */
export const sql = /* sql */ `
CREATE TABLE offline_quotes (
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  client_key text NOT NULL,
  quote_id uuid NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (org_id, client_key)
);
`;

/** Retour arrière : défait exactement la migration ci-dessus. */
export const down = /* sql */ `
DROP TABLE offline_quotes;
`;
