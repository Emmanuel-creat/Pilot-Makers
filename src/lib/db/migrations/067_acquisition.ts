/** Dépenses de prospection par année et par source de demandes, pour le coût d'acquisition. */
export const sql = /* sql */ `
CREATE TABLE org_acquisition_costs (
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  year integer NOT NULL CHECK (year BETWEEN 2000 AND 2100),
  source text NOT NULL,
  cents bigint NOT NULL CHECK (cents >= 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (org_id, year, source)
);
`;
