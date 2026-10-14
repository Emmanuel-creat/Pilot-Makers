/** Recommandations de clients entre membres d'un réseau, vers un métier complémentaire. */
export const sql = /* sql */ `
CREATE TABLE network_recommendations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  network_id uuid NOT NULL REFERENCES networks(id) ON DELETE CASCADE,
  from_org uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  to_org uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  customer_name text NOT NULL,
  email text NOT NULL DEFAULT '',
  phone text NOT NULL DEFAULT '',
  city text NOT NULL DEFAULT '',
  need text NOT NULL,
  status text NOT NULL DEFAULT 'envoyee' CHECK (status IN ('envoyee', 'acceptee', 'declinee')),
  reply_note text NOT NULL DEFAULT '',
  lead_id uuid REFERENCES leads(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  answered_at timestamptz
);
CREATE INDEX network_recommendations_to ON network_recommendations(to_org, status);
CREATE INDEX network_recommendations_from ON network_recommendations(from_org, created_at);
`;
