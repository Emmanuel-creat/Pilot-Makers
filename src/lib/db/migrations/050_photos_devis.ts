/** Photos annotées et croquis joints au devis, imprimés dans le PDF. */
export const sql = /* sql */ `
CREATE TABLE quote_media (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  quote_id uuid NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('photo', 'croquis')),
  caption text NOT NULL DEFAULT '',
  mime text NOT NULL CHECK (mime IN ('image/jpeg', 'image/png')),
  data bytea NOT NULL,
  position integer NOT NULL DEFAULT 0,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX quote_media_quote ON quote_media(quote_id, position);
`;
