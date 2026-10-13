/** Budget annuel de l'entreprise, comparé au réalisé dans les rapports. */
export const sql = /* sql */ `
CREATE TABLE org_budgets (
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  year integer NOT NULL CHECK (year BETWEEN 2000 AND 2100),
  amounts jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (org_id, year)
);
`;
