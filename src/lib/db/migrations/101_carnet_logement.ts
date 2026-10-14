export const sql = `
CREATE TABLE home_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  address_key text NOT NULL,
  line1 text NOT NULL DEFAULT '',
  postal_code text NOT NULL DEFAULT '',
  city text NOT NULL DEFAULT '',
  share_token_hash text UNIQUE,
  share_expires_at timestamptz,
  share_views integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, customer_id, address_key)
);
CREATE TABLE home_record_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  record_id uuid NOT NULL REFERENCES home_records(id) ON DELETE CASCADE,
  entry_date date NOT NULL,
  kind text NOT NULL CHECK (kind IN ('travaux', 'equipement', 'entretien', 'diagnostic')),
  label text NOT NULL,
  detail text NOT NULL DEFAULT '',
  brand text NOT NULL DEFAULT '',
  warranty_until date,
  maintenance_months integer CHECK (maintenance_months BETWEEN 1 AND 120),
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX home_record_entries_record ON home_record_entries (record_id, entry_date DESC);
`;
