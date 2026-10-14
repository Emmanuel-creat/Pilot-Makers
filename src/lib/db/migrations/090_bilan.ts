/** Préparation du bilan : points de clôture cochés et commentaires pour l'expert-comptable, par exercice. */
export const sql = /* sql */ `
CREATE TABLE year_end_closings (
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  year integer NOT NULL CHECK (year BETWEEN 2000 AND 2100),
  checks jsonb NOT NULL DEFAULT '{}',
  notes jsonb NOT NULL DEFAULT '{}',
  updated_by uuid REFERENCES users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (org_id, year)
);
`;
