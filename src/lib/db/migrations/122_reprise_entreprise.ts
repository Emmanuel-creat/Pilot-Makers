/** Reprise d'entreprises artisanales : annonce anonyme du cédant et prises de contact des repreneurs. */
export const sql = /* sql */ `
CREATE TABLE transfer_listings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL UNIQUE REFERENCES organizations(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'brouillon' CHECK (status IN ('brouillon', 'publiee', 'retiree')),
  headline text NOT NULL,
  description text NOT NULL,
  reason text NOT NULL DEFAULT 'autre',
  accompaniment_months integer NOT NULL DEFAULT 0 CHECK (accompaniment_months BETWEEN 0 AND 24),
  trade text NOT NULL DEFAULT '',
  department text NOT NULL DEFAULT '',
  revenue_band text NOT NULL DEFAULT '',
  staff_band text NOT NULL DEFAULT '',
  published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX transfer_listings_public ON transfer_listings (status, published_at DESC);

CREATE TABLE transfer_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id uuid NOT NULL REFERENCES transfer_listings(id) ON DELETE CASCADE,
  name text NOT NULL,
  email text NOT NULL DEFAULT '',
  phone text NOT NULL DEFAULT '',
  message text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX transfer_contacts_listing ON transfer_contacts (listing_id, created_at DESC);
`;
