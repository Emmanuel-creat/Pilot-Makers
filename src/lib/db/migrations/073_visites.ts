/** Prise de rendez-vous de visite en ligne : réglages sur la vitrine et rendez-vous pris. */
export const sql = /* sql */ `
ALTER TABLE showcases ADD COLUMN visit_settings jsonb NOT NULL DEFAULT '{}'::jsonb;
CREATE TABLE visit_bookings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  lead_id uuid REFERENCES leads(id) ON DELETE SET NULL,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  name text NOT NULL,
  phone text NOT NULL DEFAULT '',
  email text NOT NULL DEFAULT '',
  address text NOT NULL DEFAULT '',
  city text NOT NULL DEFAULT '',
  description text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'confirmee' CHECK (status IN ('confirmee', 'annulee')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX visit_bookings_slot ON visit_bookings(org_id, starts_at) WHERE status = 'confirmee';
CREATE INDEX visit_bookings_org ON visit_bookings(org_id, starts_at);
`;
