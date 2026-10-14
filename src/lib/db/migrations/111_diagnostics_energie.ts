/** Diagnostics énergétiques simplifiés faits pendant la visite, reliés au client et au devis qui en découle. */
export const sql = /* sql */ `
CREATE TABLE energy_diagnoses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  customer_id uuid REFERENCES customers(id) ON DELETE SET NULL,
  quote_id uuid REFERENCES quotes(id) ON DELETE SET NULL,
  input jsonb NOT NULL,
  current_class text NOT NULL,
  after_class text NOT NULL,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX energy_diagnoses_org ON energy_diagnoses(org_id, created_at DESC);
`;
