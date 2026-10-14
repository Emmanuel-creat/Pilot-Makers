/** Groupements momentanés d'entreprises : un mandataire et ses cotraitants, chacun avec ses lots du devis. */
export const sql = /* sql */ `
CREATE TABLE consortia (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  quote_id uuid NOT NULL UNIQUE REFERENCES quotes(id) ON DELETE CASCADE,
  form text NOT NULL CHECK (form IN ('conjoint', 'solidaire')),
  mandataire_solidaire boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE consortium_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  consortium_id uuid NOT NULL REFERENCES consortia(id) ON DELETE CASCADE,
  org_id uuid REFERENCES organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  siret text NOT NULL DEFAULT '',
  trade text NOT NULL DEFAULT '',
  status text NOT NULL CHECK (status IN ('mandataire', 'invite', 'accepte', 'refuse', 'externe')),
  section_ids text[] NOT NULL DEFAULT '{}',
  answered_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (consortium_id, org_id)
);
CREATE INDEX consortium_members_org ON consortium_members(org_id, status);
`;
