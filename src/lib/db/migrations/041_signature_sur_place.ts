/** Signature du client sur l'écran de l'entreprise : image conservée avec son empreinte, liée à la version acceptée. */
export const sql = /* sql */ `
CREATE TABLE quote_signatures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  quote_id uuid NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
  version integer NOT NULL,
  signer_name text NOT NULL,
  image bytea NOT NULL,
  image_sha256 text NOT NULL,
  collected_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX quote_signatures_quote ON quote_signatures (quote_id, version);
`;
