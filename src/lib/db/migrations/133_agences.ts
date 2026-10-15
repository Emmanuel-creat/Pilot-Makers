/** Agences d'une même entreprise : chaque membre et chaque devis peut être rattaché à une agence. */
export const sql = /* sql */ `
CREATE TABLE agencies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  city text NOT NULL DEFAULT '',
  siret text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX agencies_org_name ON agencies (org_id, lower(name));
ALTER TABLE memberships ADD COLUMN agency_id uuid REFERENCES agencies(id) ON DELETE SET NULL;
ALTER TABLE quotes ADD COLUMN agency_id uuid REFERENCES agencies(id) ON DELETE SET NULL;
CREATE INDEX quotes_agency ON quotes (agency_id) WHERE agency_id IS NOT NULL;
`;
