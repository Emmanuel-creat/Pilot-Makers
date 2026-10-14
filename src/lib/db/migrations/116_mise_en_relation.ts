/** Mise en relation avec les particuliers : profil de l'artisan (métiers, départements, plafond) et demandes reçues. */
export const sql = /* sql */ `
CREATE TABLE matching_profiles (
  org_id uuid PRIMARY KEY REFERENCES organizations(id) ON DELETE CASCADE,
  enabled boolean NOT NULL DEFAULT false,
  trades text[] NOT NULL DEFAULT '{}',
  departments text[] NOT NULL DEFAULT '{}',
  weekly_cap integer NOT NULL DEFAULT 5 CHECK (weekly_cap BETWEEN 1 AND 50),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE match_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trade text NOT NULL,
  department text NOT NULL,
  timeframe text NOT NULL,
  matched integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE match_assignments (
  request_id uuid NOT NULL REFERENCES match_requests(id) ON DELETE CASCADE,
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  lead_id uuid REFERENCES leads(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (request_id, org_id)
);
CREATE INDEX match_assignments_org ON match_assignments (org_id, created_at DESC);
`;
