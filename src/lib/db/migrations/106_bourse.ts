/** Bourse du réseau : missions de renfort et matériaux restants proposés entre membres. */
export const sql = /* sql */ `
CREATE TABLE network_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  network_id uuid NOT NULL REFERENCES networks(id) ON DELETE CASCADE,
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('mission', 'materiau')),
  title text NOT NULL,
  detail text NOT NULL DEFAULT '',
  trade text NOT NULL DEFAULT '',
  city text NOT NULL DEFAULT '',
  start_date date,
  end_date date,
  quantity text NOT NULL DEFAULT '',
  unit text NOT NULL DEFAULT '',
  price_cents bigint,
  status text NOT NULL DEFAULT 'ouverte' CHECK (status IN ('ouverte', 'pourvue', 'retiree')),
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz
);
CREATE INDEX network_posts_network ON network_posts (network_id, status, created_at DESC);

CREATE TABLE network_post_replies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL REFERENCES network_posts(id) ON DELETE CASCADE,
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  message text NOT NULL DEFAULT '',
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (post_id, org_id)
);
`;
