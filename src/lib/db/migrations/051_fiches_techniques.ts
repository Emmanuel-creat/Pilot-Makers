/** Fiches techniques, certificats et notices des articles du catalogue, joints aux devis qui les utilisent. */
export const sql = /* sql */ `
CREATE TABLE catalog_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  item_id uuid NOT NULL REFERENCES catalog_items(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('fiche_technique', 'certificat', 'notice', 'fds', 'autre')),
  title text NOT NULL,
  file bytea NOT NULL,
  size integer NOT NULL,
  sha256 text NOT NULL,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  removed_at timestamptz
);
CREATE INDEX catalog_documents_item ON catalog_documents(item_id) WHERE removed_at IS NULL;
`;
