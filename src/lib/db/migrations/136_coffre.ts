/** Coffre chiffré : seules l'enveloppe (sel, vecteurs, nom chiffré) et la taille sont connues du serveur. */
export const sql = /* sql */ `
CREATE TABLE vault_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  storage_key text NOT NULL,
  size integer NOT NULL,
  envelope jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX vault_files_org ON vault_files (org_id, created_at DESC);
`;

/** Retour arrière : défait exactement la migration ci-dessus. */
export const down = /* sql */ `
DROP TABLE vault_files;
`;
