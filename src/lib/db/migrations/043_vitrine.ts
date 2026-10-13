/** Page vitrine publique de l'entreprise et galerie de réalisations publiées avec l'accord du client. */
export const sql = /* sql */ `
CREATE TABLE showcases (
  org_id uuid PRIMARY KEY REFERENCES organizations(id) ON DELETE CASCADE,
  enabled boolean NOT NULL DEFAULT false,
  slug text NOT NULL UNIQUE,
  intro text NOT NULL DEFAULT '',
  area text NOT NULL DEFAULT '',
  show_phone boolean NOT NULL DEFAULT true,
  show_email boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE showcase_photos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  journal_id uuid NOT NULL UNIQUE REFERENCES job_journal(id) ON DELETE CASCADE,
  caption text NOT NULL DEFAULT '',
  show_city boolean NOT NULL DEFAULT true,
  consent_note text NOT NULL,
  consent_by uuid REFERENCES users(id) ON DELETE SET NULL,
  image bytea NOT NULL,
  image_type text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX showcase_photos_org ON showcase_photos(org_id, created_at DESC);
`;
