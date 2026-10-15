/** Rénovation coordonnée : un dossier client, plusieurs entreprises avec chacune son devis, un seul pilote. */
export const sql = /* sql */ `
CREATE TABLE renovation_projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  customer_id uuid REFERENCES customers(id) ON DELETE SET NULL,
  title text NOT NULL,
  site text NOT NULL DEFAULT '',
  token_hash text UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX renovation_projects_org ON renovation_projects (org_id, created_at DESC);

CREATE TABLE renovation_participants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES renovation_projects(id) ON DELETE CASCADE,
  org_id uuid REFERENCES organizations(id) ON DELETE SET NULL,
  name text NOT NULL,
  trade text NOT NULL DEFAULT 'autre',
  status text NOT NULL CHECK (status IN ('pilote', 'invite', 'accepte', 'refuse', 'externe')),
  quote_id uuid REFERENCES quotes(id) ON DELETE SET NULL,
  amount_ttc_cents bigint CHECK (amount_ttc_cents IS NULL OR amount_ttc_cents >= 0),
  start_date date,
  end_date date,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, org_id),
  CHECK (end_date IS NULL OR start_date IS NULL OR end_date >= start_date)
);
CREATE INDEX renovation_participants_org ON renovation_participants (org_id);
`;
