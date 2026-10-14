/** Liens de partage du score de santé de l'entreprise avec une banque ou un assureur. */
export const sql = /* sql */ `
CREATE TABLE health_score_shares (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  label text NOT NULL DEFAULT '',
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  views integer NOT NULL DEFAULT 0,
  last_viewed_at timestamptz,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX health_score_shares_org ON health_score_shares (org_id, created_at DESC);
`;
