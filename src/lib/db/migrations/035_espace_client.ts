/** Espace client : messages rattachés au devis, demandes de modification sur une ligne, lien d'accès du client. */
export const sql = /* sql */ `
CREATE TABLE quote_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  quote_id uuid NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
  version integer NOT NULL DEFAULT 0,
  author_type text NOT NULL CHECK (author_type IN ('client', 'entreprise')),
  author_name text NOT NULL DEFAULT '',
  user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  kind text NOT NULL DEFAULT 'message' CHECK (kind IN ('message', 'modification')),
  line_id text,
  line_label text NOT NULL DEFAULT '',
  body text NOT NULL,
  handled_at timestamptz,
  read_at timestamptz,
  ip text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX quote_messages_quote ON quote_messages (quote_id, created_at);
CREATE INDEX quote_messages_unread ON quote_messages (org_id) WHERE author_type = 'client' AND read_at IS NULL;

CREATE TABLE customer_portal_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  last_used_at timestamptz,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX customer_portal_links_customer ON customer_portal_links (customer_id);
`;
