/** Métrés sur plan : image du plan, échelle et relevés, rattachés à un devis. */
export const sql = /* sql */ `
CREATE TABLE quote_takeoffs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  quote_id uuid NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
  name text NOT NULL DEFAULT '',
  mime text NOT NULL,
  data bytea NOT NULL,
  px_per_m double precision,
  measurements jsonb NOT NULL DEFAULT '[]',
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX quote_takeoffs_quote ON quote_takeoffs (quote_id, created_at);
`;
