/** Comptabilité tenue en continu : chaque mois est contrôlé puis marqué vérifié, pour clôturer l'exercice en un jour. */
export const sql = /* sql */ `
CREATE TABLE accounting_months (
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  month text NOT NULL CHECK (month ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  verified_at timestamptz NOT NULL DEFAULT now(),
  verified_by uuid REFERENCES users(id) ON DELETE SET NULL,
  vat_declared boolean NOT NULL DEFAULT false,
  note text NOT NULL DEFAULT '',
  PRIMARY KEY (org_id, month)
);
`;
