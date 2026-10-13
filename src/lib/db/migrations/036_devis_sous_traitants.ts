/** Devis demandés aux sous-traitants : demande par lien sécurisé, réponse chiffrée, intégration au devis client. */
export const sql = /* sql */ `
CREATE TABLE subcontractor_quotes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  subcontractor_id uuid NOT NULL REFERENCES subcontractors(id) ON DELETE CASCADE,
  quote_id uuid REFERENCES quotes(id) ON DELETE SET NULL,
  title text NOT NULL,
  description text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'demande' CHECK (status IN ('demande', 'recu', 'retenu', 'refuse', 'annule')),
  token_hash text UNIQUE,
  expires_at timestamptz NOT NULL,
  amount_ht_cents bigint,
  delay text NOT NULL DEFAULT '',
  answer_note text NOT NULL DEFAULT '',
  answered_by text NOT NULL DEFAULT '',
  file bytea,
  file_name text NOT NULL DEFAULT '',
  file_type text NOT NULL DEFAULT '',
  file_sha256 text NOT NULL DEFAULT '',
  margin_bp integer,
  line_id text,
  requested_by uuid REFERENCES users(id) ON DELETE SET NULL,
  answered_at timestamptz,
  decided_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX subcontractor_quotes_org ON subcontractor_quotes (org_id, created_at DESC);
CREATE INDEX subcontractor_quotes_quote ON subcontractor_quotes (quote_id);
CREATE INDEX subcontractor_quotes_sub ON subcontractor_quotes (subcontractor_id);
`;
