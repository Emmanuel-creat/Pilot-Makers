/**
 * Assistant de préparation : propositions conservées pour mesurer la part des
 * lignes gardées telles quelles, et habitudes apprises de l'entreprise.
 */
export const sql = /* sql */ `
CREATE TABLE assistant_proposals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  quote_id uuid REFERENCES quotes(id) ON DELETE SET NULL,
  lines jsonb NOT NULL,
  added_line_ids jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  added_at timestamptz,
  measured_at timestamptz,
  kept integer NOT NULL DEFAULT 0,
  edited integer NOT NULL DEFAULT 0,
  removed integer NOT NULL DEFAULT 0
);
CREATE INDEX assistant_proposals_quote ON assistant_proposals (quote_id) WHERE measured_at IS NULL;
CREATE INDEX assistant_proposals_org ON assistant_proposals (org_id, measured_at);
CREATE TABLE assistant_habits (
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  source_key text NOT NULL,
  label text NOT NULL,
  unit text NOT NULL DEFAULT '',
  unit_price text NOT NULL DEFAULT '',
  position real NOT NULL DEFAULT 0,
  uses integer NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (org_id, source_key)
);
`;
