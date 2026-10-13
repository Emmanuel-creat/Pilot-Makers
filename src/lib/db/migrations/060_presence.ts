/** Présence dans l'éditeur de devis : qui a le devis ouvert, et sur quelle section. */
export const sql = /* sql */ `
CREATE TABLE quote_presence (
  quote_id uuid NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  section_id text NOT NULL DEFAULT '',
  seen_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (quote_id, user_id)
);
CREATE INDEX quote_presence_seen ON quote_presence (quote_id, seen_at);
`;
