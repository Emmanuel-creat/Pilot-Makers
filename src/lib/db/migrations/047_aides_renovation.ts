/** Aides à la rénovation énergétique : qualifications RGE de l'entreprise et dispositifs visés par chaque devis. */
export const sql = /* sql */ `
CREATE TABLE rge_qualifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  body text NOT NULL,
  number text NOT NULL,
  domains jsonb NOT NULL DEFAULT '[]',
  valid_until date NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX rge_qualifications_org ON rge_qualifications(org_id, valid_until);
ALTER TABLE quotes ADD COLUMN energy_aid jsonb;
`;
